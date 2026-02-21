// src/App.tsx
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
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
import Error401Page from './pages/error/Error401Page';
import Error404Page from './pages/error/Error404Page';
import Error403Page from './pages/error/Error403Page';
import RequireAdmin from './routes/RequireAdmin';
import { AdminSessionProvider } from './contexts/AdminSessionContext';
import { AdminDeliveryAlertProvider } from './contexts/AdminDeliveryAlertContext';
import AdminDeliveriesPage from './pages/admin/AdminDeliveriesPage';
import MainPage from './pages/MainPage';
import CourierShopPlaceholder from './pages/shop/CourierShopPlaceholder';

/** query params를 보존하면서 redirect (OAuth callback용) */
function RedirectWithSearch({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Main Landing */}
      <Route path="/" element={<MainPage />} />

      {/* ===== /store — 현장예약/배달 (기존, /store 접두사 추가) ===== */}
      <Route path="/store/login" element={<RedirectWithSearch to="/" />} />
      <Route path="/store/products" element={<ProductsPage />} />
      <Route path="/store/me/orders" element={<OrderPage />} />
      <Route path="/store/me/delivery" element={<DeliveryPage />} />
      <Route path="/store/deliveries/approve" element={<DeliveryApprovePage />} />
      <Route path="/store/deliveries/cancel" element={<DeliveryCancelPage />} />
      <Route path="/store/deliveries/fail" element={<DeliveryFailPage />} />
      <Route path="/store/terms" element={<TermsPage />} />
      <Route path="/store/privacy" element={<PrivacyPage />} />
      <Route path="/store/refund" element={<RefundPolicyPage />} />

      <Route path="/admin/shop" element={<Navigate to="/admin/shop/login" replace />} />
      <Route path="/admin/shop/login" element={<AdminLoginPage />} />
      <Route path="/admin/shop/register" element={<AdminRegisterPage />} />
      <Route element={
        <AdminSessionProvider>
          <AdminDeliveryAlertProvider>
            <RequireAdmin />
          </AdminDeliveryAlertProvider>
        </AdminSessionProvider>
      }>
        <Route path="/admin/shop/products" element={<AdminProductPage />} />
        <Route path="/admin/shop/products/new" element={<AdminCreateProductPage />} />
        <Route path="/admin/shop/products/bulk-sell-date" element={<AdminBulkSellDatePage />} />
        <Route path="/admin/shop/products/order" element={<AdminProductOrderPage />} />
        <Route path="/admin/shop/sales" element={<AdminSalesPage />} />
        <Route path="/admin/shop/reservations" element={<AdminReservationsPage />} />
        <Route path="/admin/shop/deliveries" element={<AdminDeliveriesPage />} />
        <Route path="/admin/shop/customers" element={<AdminCustomerPage />} />
        <Route path="/admin/shop/keywords" element={<AdminCategoryPage />} />
        <Route path="/admin/shop/categories" element={<AdminCategoryPage />} />
        <Route path="/admin/shop/products/:id/edit" element={<AdminEditProductPage />} />
      </Route>

      {/* 하위호환 redirects (기존 URL → /store/*) */}
      <Route path="/login" element={<RedirectWithSearch to="/" />} />
      <Route path="/products" element={<Navigate to="/store/products" replace />} />
      <Route path="/me/orders" element={<Navigate to="/store/me/orders" replace />} />
      <Route path="/me/delivery" element={<Navigate to="/store/me/delivery" replace />} />
      <Route path="/deliveries/approve" element={<Navigate to="/store/deliveries/approve" replace />} />
      <Route path="/deliveries/cancel" element={<Navigate to="/store/deliveries/cancel" replace />} />
      <Route path="/deliveries/fail" element={<Navigate to="/store/deliveries/fail" replace />} />
      <Route path="/terms" element={<Navigate to="/store/terms" replace />} />
      <Route path="/privacy" element={<Navigate to="/store/privacy" replace />} />
      <Route path="/refund" element={<Navigate to="/store/refund" replace />} />
      <Route path="/admin/*" element={<Navigate to="/admin/shop/login" replace />} />

      {/* ===== /shop — 택배 쇼핑몰 (신규, placeholder) ===== */}
      <Route path="/shop" element={<CourierShopPlaceholder />} />
      <Route path="/shop/*" element={<CourierShopPlaceholder />} />

      {/* Error pages */}
      <Route path="/401" element={<Error401Page />} />
      <Route path="/403" element={<Error403Page />} />
      <Route path="/404" element={<Error404Page />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
