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
import Login from '@/pages/Login';
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

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/raw-stock" element={<RawStock />} />
          <Route path="/raw-stock/:slug" element={<RawCategoryPage />} />
          <Route path="/ready-shoes" element={<ReadyShoes />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/production" element={<Production />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/new" element={<InvoiceNew />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/roznamcha" element={<Roznamcha />} />
          <Route path="/kharcha" element={<Kharcha />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/recycle-bin" element={<RecycleBin />} />
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
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
