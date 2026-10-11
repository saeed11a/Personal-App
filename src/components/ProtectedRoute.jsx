import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const {
    isAuthenticated,
    isLoadingAuth,
    authChecked,
    authError,
    checkUserAuth,
    pinRequired,
    pinSetupRequired,
    pinNotIssued,
  } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  // Signed in but no PIN on the account yet: an administrator sets their own on
  // /setup-pin, anyone else waits for one to be issued. Either way the app itself
  // stays closed — never silently reachable without a PIN.
  if (pinSetupRequired) {
    return <Navigate to="/setup-pin" replace />;
  }

  if (pinNotIssued) {
    return <Navigate to="/pin-not-issued" replace />;
  }

  // Signed in but the five-digit PIN has not been entered for this session.
  if (pinRequired) {
    return <Navigate to="/unlock" replace />;
  }

  return <Outlet />;
}
