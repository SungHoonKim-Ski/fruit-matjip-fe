// src/App.tsx
import { Route, Routes, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ProductsPage from './pages/auth/ProductsPage';
import OrderPage from './pages/auth/OrderPage';
import DeliveryPage from './pages/auth/DeliveryPage';
import DeliveryApprovePage from './pages/auth/DeliveryApprovePage';
import DeliveryCancelPage from './pages/auth/DeliveryCancelPage';
import DeliveryFailPage from './pages/auth/DeliveryFailPage';
import TermsPage from './pages/terms/TermsPage';
import PrivacyPage from './pages/terms/PrivacyPage';
import RefundPolicyPage from './pages/terms/RefundPolicyPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRegisterPage from './pages/admin/AdminRegisterPage';
import AdminProductPage from './pages/admin/AdminProductPage';
import AdminCreateProductPage from './pages/admin/AdminCreateProductPage';
import AdminSalesPage from './pages/admin/AdminSalesPage';
import AdminReservationsPage from './pages/admin/AdminReservationsPage';
import AdminEditProductPage from './pages/admin/AdminEditProductPage';
import AdminBulkSellDatePage from './pages/admin/AdminBulkSellDatePage';
import AdminProductOrderPage from './pages/admin/AdminProductOrderPage';
import AdminCustomerPage from './pages/admin/AdminCustomerPage';
import AdminCategoryPage from './pages/admin/AdminCategoryPage';
import Error404Page from './pages/error/Error404Page';
import Error403Page from './pages/error/Error403Page';
import RequireAdmin from './routes/RequireAdmin';
import { AdminSessionProvider } from './contexts/AdminSessionContext';
import { AdminDeliveryAlertProvider } from './contexts/AdminDeliveryAlertContext';
import AdminDeliveriesPage from './pages/admin/AdminDeliveriesPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/me/orders" element={<OrderPage />} />
      <Route path="/me/delivery" element={<DeliveryPage />} />
      <Route path="/deliveries/approve" element={<DeliveryApprovePage />} />
      <Route path="/deliveries/cancel" element={<DeliveryCancelPage />} />
      <Route path="/deliveries/fail" element={<DeliveryFailPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/refund" element={<RefundPolicyPage />} />

      <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/register" element={<AdminRegisterPage />} />
      <Route element={
        <AdminSessionProvider>
          <AdminDeliveryAlertProvider>
            <RequireAdmin />
          </AdminDeliveryAlertProvider>
        </AdminSessionProvider>
      }>
        <Route path="/admin/products" element={<AdminProductPage />} />
        <Route path="/admin/products/new" element={<AdminCreateProductPage />} />
        <Route path="/admin/products/bulk-sell-date" element={<AdminBulkSellDatePage />} />
        <Route path="/admin/products/order" element={<AdminProductOrderPage />} />
        <Route path="/admin/sales" element={<AdminSalesPage />} />
        <Route path="/admin/reservations" element={<AdminReservationsPage />} />
        <Route path="/admin/deliveries" element={<AdminDeliveriesPage />} />
        <Route path="/admin/customers" element={<AdminCustomerPage />} />
        <Route path="/admin/keywords" element={<AdminCategoryPage />} />
        <Route path="/admin/categories" element={<AdminCategoryPage />} />
        <Route path="/admin/products/:id/edit" element={<AdminEditProductPage />} />
      </Route>
      <Route path="/403" element={<Error403Page />} />
      <Route path="/404" element={<Error404Page />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
