import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import { SyncProvider } from '@/lib/SyncContext';
import Login from '@/pages/Login';
import PinUnlock from '@/pages/PinUnlock';
import PinSetup from '@/pages/PinSetup';
import PinChange from '@/pages/PinChange';
import PinNotIssued from '@/pages/PinNotIssued';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import RawStock from '@/pages/RawStock';
import RawCategoryPage from '@/pages/RawCategoryPage';
import ReadyShoes from '@/pages/ReadyShoes';
import Articles from '@/pages/Articles';
import Production from '@/pages/Production';
import Purchases from '@/pages/Purchases';
import Invoices from '@/pages/Invoices';
import InvoiceNew from '@/pages/InvoiceNew';
import Sales from '@/pages/Sales';
import Customers from '@/pages/Customers';
import Suppliers from '@/pages/Suppliers';
import Payments from '@/pages/Payments';
import Roznamcha from '@/pages/Roznamcha';
import Kharcha from '@/pages/Kharcha';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import RecycleBin from '@/pages/RecycleBin';
import Labour from '@/pages/Labour';
import DatabaseCenter from '@/pages/DatabaseCenter';
import Users from '@/pages/Users';
import RequirePermission from '@/components/RequirePermission';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app. Every ERP route states the module it belongs to, so the
  // same rule that hides a menu entry also blocks a typed-in URL.
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unlock" element={<PinUnlock />} />
      <Route path="/setup-pin" element={<PinSetup />} />
      <Route path="/change-pin" element={<PinChange />} />
      <Route path="/pin-not-issued" element={<PinNotIssued />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<RequirePermission module="dashboard"><Dashboard /></RequirePermission>} />
          <Route path="/raw-stock" element={<RequirePermission module="raw_stock"><RawStock /></RequirePermission>} />
          <Route path="/raw-stock/:slug" element={<RequirePermission module="raw_stock"><RawCategoryPage /></RequirePermission>} />
          <Route path="/ready-shoes" element={<RequirePermission module="ready_shoes"><ReadyShoes /></RequirePermission>} />
          <Route path="/articles" element={<RequirePermission module="articles"><Articles /></RequirePermission>} />
          <Route path="/production" element={<RequirePermission module="production"><Production /></RequirePermission>} />
          <Route path="/purchases" element={<RequirePermission module="purchase"><Purchases /></RequirePermission>} />
          <Route path="/labour" element={<RequirePermission module="labour"><Labour /></RequirePermission>} />
          <Route path="/invoices" element={<RequirePermission module="invoices"><Invoices /></RequirePermission>} />
          <Route path="/invoices/new" element={<RequirePermission module="invoices" action="add"><InvoiceNew /></RequirePermission>} />
          <Route path="/sales" element={<RequirePermission module="sales"><Sales /></RequirePermission>} />
          <Route path="/customers" element={<RequirePermission module="customers"><Customers /></RequirePermission>} />
          <Route path="/suppliers" element={<RequirePermission module="suppliers"><Suppliers /></RequirePermission>} />
          <Route path="/payments" element={<RequirePermission module="payments"><Payments /></RequirePermission>} />
          <Route path="/roznamcha" element={<RequirePermission module="roznamcha"><Roznamcha /></RequirePermission>} />
          <Route path="/kharcha" element={<RequirePermission module="kharcha"><Kharcha /></RequirePermission>} />
          <Route path="/reports" element={<RequirePermission module="reports"><Reports /></RequirePermission>} />
          <Route path="/settings" element={<RequirePermission module="settings"><Settings /></RequirePermission>} />
          <Route path="/recycle-bin" element={<RequirePermission module="recycle_bin"><RecycleBin /></RequirePermission>} />
          <Route path="/database-center" element={<RequirePermission module="database_center"><DatabaseCenter /></RequirePermission>} />
          <Route path="/users" element={<RequirePermission module="users"><Users /></RequirePermission>} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <SyncProvider>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
        </SyncProvider>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
