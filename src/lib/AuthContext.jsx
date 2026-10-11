import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44, isBase44Configured } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { usesSupabaseAuth } from '@/lib/authMode';
import { signOut } from '@/lib/authApi';
import { getPinStatus } from '@/lib/pin';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

// Marks, for this browser tab session, that the five-digit PIN was entered.
// Locking clears it (PIN asked again, session kept); signing out drops the Supabase
// session entirely and clears it with it.
const PIN_UNLOCK_KEY = 'hiker_pin_unlocked';

// Only the columns the UI needs — the PIN hash is never selectable from the browser
// (see 0002_admin_bootstrap.sql / 0003 / 0008). `department` and `avatar_url` feed
// the account menu in the top bar.
const PROFILE_COLUMNS = 'id, email, full_name, phone, role, status, department, avatar_url';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }
  // What pin_status() reports (has_pin / locked_until) and whether this tab has
  // already been unlocked with the PIN. Neither ever carries the PIN or its hash.
  const [pinStatus, setPinStatus] = useState({ has_pin: false, locked_until: null });
  const [pinUnlocked, setPinUnlocked] = useState(false);

  useEffect(() => {
    checkAppState();
  }, []);

  // Keep the app in step with the Supabase session: signing in and out, token
  // refresh, and changes made in another tab. INITIAL_SESSION is skipped because
  // checkAppState() already loads the session on mount.
  useEffect(() => {
    if (!usesSupabaseAuth) return undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (session) {
        applySupabaseSession(session);
      } else {
        clearAuth();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const clearAuth = () => {
    setUser(null);
    setIsAuthenticated(false);
    setPinUnlocked(false);
    setPinStatus({ has_pin: false, locked_until: null });
    setIsLoadingAuth(false);
    setIsLoadingPublicSettings(false);
    setAuthChecked(true);
  };

  // Signed in: load the account's profile row, then decide whether the five-digit
  // PIN still has to be entered for this session. The PIN value itself is never
  // read here — only whether one exists (pin_status(), server-side).
  const applySupabaseSession = async (session) => {
    setIsLoadingAuth(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', session.user.id)
      .maybeSingle();

    setUser(
      profile
        ? { ...profile, id: session.user.id, email: profile.email || session.user.email }
        : { id: session.user.id, email: session.user.email, role: 'user', status: 'active' }
    );
    setIsAuthenticated(true);

    let status = { has_pin: false, locked_until: null };
    try {
      status = (await getPinStatus()) || status;
    } catch {
      status = { has_pin: false, locked_until: null };
    }
    setPinStatus(status);
    setPinUnlocked(sessionStorage.getItem(PIN_UNLOCK_KEY) === '1');

    setIsLoadingAuth(false);
    setIsLoadingPublicSettings(false);
    setAuthChecked(true);
  };

  const checkSupabaseSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      clearAuth();
      return;
    }
    await applySupabaseSession(data.session);
  };

  const checkAppState = async () => {
    if (usesSupabaseAuth) {
      setAuthError(null);
      setIsLoadingPublicSettings(true);
      try {
        await checkSupabaseSession();
      } catch (error) {
        console.error('App state check failed:', error);
        setAuthError({
          type: 'unknown',
          message: error.message || 'Failed to load app'
        });
        clearAuth();
      }
      return;
    }

    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      // No Base44 backend linked (e.g. this sandbox): there is nothing to reach,
      // so skip the requests that would 404 and go straight to the signed-out
      // state. The router then shows the login screen.
      if (!isBase44Configured) {
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }

      try {
        const publicSettings = await base44.app.getPublicSettings();
        setAppPublicSettings(publicSettings);

        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    if (usesSupabaseAuth) {
      setIsLoadingAuth(true);
      try {
        await checkSupabaseSession();
      } catch (error) {
        console.error('User auth check failed:', error);
        clearAuth();
      }
      return;
    }

    if (!isBase44Configured) {
      // No backend to ask; treat as signed out rather than firing a 404.
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      return;
    }

    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);

      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  // Called by the unlock screen once verify_pin() accepted the five digits.
  const unlock = () => {
    sessionStorage.setItem(PIN_UNLOCK_KEY, '1');
    setPinUnlocked(true);
  };

  // Called by the lock action: keep the session, ask for the PIN again.
  const lock = () => {
    sessionStorage.removeItem(PIN_UNLOCK_KEY);
    setPinUnlocked(false);
  };

  // Re-reads pin_status() (whether the account has a PIN, and any lockout). Used
  // after first-time setup and after a PIN change; never reads the hash.
  const refreshPinStatus = async () => {
    if (!usesSupabaseAuth) return null;
    const status = (await getPinStatus()) || { has_pin: false, locked_until: null };
    setPinStatus(status);
    return status;
  };

  // Re-reads the signed-in account's own profile row — used after the profile menu
  // saves a new picture, so the new URL shows everywhere without a reload. It is the
  // same self-only read RLS already allows at startup; no privileged access.
  const refreshProfile = async () => {
    if (!usesSupabaseAuth) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', session.user.id)
      .maybeSingle();

    if (profile) {
      setUser({ ...profile, id: session.user.id, email: profile.email || session.user.email });
    }
    return profile || null;
  };

  const logout = async (shouldRedirect = true) => {
    sessionStorage.removeItem(PIN_UNLOCK_KEY);
    setUser(null);
    setIsAuthenticated(false);
    setPinUnlocked(false);
    setPinStatus({ has_pin: false, locked_until: null });

    if (usesSupabaseAuth) {
      await signOut();
      if (shouldRedirect) {
        window.location.href = '/login';
      }
      return;
    }

    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    if (usesSupabaseAuth) {
      window.location.href = '/login';
      return;
    }
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  // The PIN gate is a Supabase-auth concern and only exists once the account has a
  // PIN. Without one: an administrator is sent to first-time setup, anyone else to
  // the "not issued" notice — the app is never reachable without a PIN.
  const pinEnabled = usesSupabaseAuth && pinStatus?.has_pin === true;
  const pinRequired = isAuthenticated && pinEnabled && !pinUnlocked;
  const pinSetupRequired = isAuthenticated && usesSupabaseAuth && !pinStatus?.has_pin && user?.role === 'admin';
  const pinNotIssued = isAuthenticated && usesSupabaseAuth && !pinStatus?.has_pin && user?.role !== 'admin';

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      pinEnabled,
      pinStatus,
      pinRequired,
      pinSetupRequired,
      pinNotIssued,
      refreshPinStatus,
      refreshProfile,
      unlock,
      lock,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
