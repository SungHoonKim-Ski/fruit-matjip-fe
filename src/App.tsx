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
import CourierShopPage from './pages/shop/CourierShopPage';
import CourierProductDetailStandalone from './pages/shop/CourierProductDetailStandalone';
import CourierCartPage from './pages/shop/CourierCartPage';
import CourierCheckoutPage from './pages/shop/CourierCheckoutPage';
import CourierOrdersPage from './pages/shop/CourierOrdersPage';
import CourierOrderDetailPage from './pages/shop/CourierOrderDetailPage';
import CourierClaimPage from './pages/shop/CourierClaimPage';
import CourierApprovePage from './pages/shop/CourierApprovePage';
import CourierCancelPage from './pages/shop/CourierCancelPage';
import CourierFailPage from './pages/shop/CourierFailPage';
import AdminCourierProductPage from './pages/admin/courier/AdminCourierProductPage';
import AdminCourierCreateProductPage from './pages/admin/courier/AdminCourierCreateProductPage';
import AdminCourierEditProductPage from './pages/admin/courier/AdminCourierEditProductPage';
import AdminCourierOrdersPage from './pages/admin/courier/AdminCourierOrdersPage';
import AdminCourierOrderDetailPage from './pages/admin/courier/AdminCourierOrderDetailPage';
import AdminCourierClaimsPage from './pages/admin/courier/AdminCourierClaimsPage';
import AdminCourierConfigPage from './pages/admin/courier/AdminCourierConfigPage';
import AdminCourierProductOrderPage from './pages/admin/courier/AdminCourierProductOrderPage';
import AdminCourierCategoryPage from './pages/admin/courier/AdminCourierCategoryPage';
import AdminPointPage from './pages/admin/AdminPointPage';

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
      <Route path="/store/payment/approve" element={<DeliveryApprovePage />} />
      <Route path="/store/payment/cancel" element={<DeliveryCancelPage />} />
      <Route path="/store/payment/fail" element={<DeliveryFailPage />} />
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
      <Route path="/deliveries/approve" element={<Navigate to="/store/payment/approve" replace />} />
      <Route path="/deliveries/cancel" element={<Navigate to="/store/payment/cancel" replace />} />
      <Route path="/deliveries/fail" element={<Navigate to="/store/payment/fail" replace />} />
      <Route path="/terms" element={<Navigate to="/store/terms" replace />} />
      <Route path="/privacy" element={<Navigate to="/store/privacy" replace />} />
      <Route path="/refund" element={<Navigate to="/store/refund" replace />} />
      {/* ===== /shop — 택배 쇼핑몰 ===== */}
      <Route path="/shop" element={<CourierShopPage />} />
      <Route path="/shop/cart" element={<CourierCartPage />} />
      <Route path="/shop/checkout" element={<CourierCheckoutPage />} />
      <Route path="/shop/orders" element={<CourierOrdersPage />} />
      <Route path="/shop/orders/:code/claim" element={<CourierClaimPage />} />
      <Route path="/shop/orders/:code" element={<CourierOrderDetailPage />} />
      <Route path="/shop/payment/approve" element={<CourierApprovePage />} />
      <Route path="/shop/payment/cancel" element={<CourierCancelPage />} />
      <Route path="/shop/payment/fail" element={<CourierFailPage />} />
      <Route path="/shop/:id" element={<CourierProductDetailStandalone />} />

      {/* ===== /admin/courier — 택배 관리자 (catch-all보다 먼저 선언) ===== */}
      <Route path="/admin/courier" element={<Navigate to="/admin/courier/login" replace />} />
      <Route path="/admin/courier/login" element={<AdminLoginPage />} />
      <Route element={
        <AdminSessionProvider>
          <RequireAdmin />
        </AdminSessionProvider>
      }>
        <Route path="/admin/courier/products" element={<AdminCourierProductPage />} />
        <Route path="/admin/courier/products/order" element={<AdminCourierProductOrderPage />} />
        <Route path="/admin/courier/products/new" element={<AdminCourierCreateProductPage />} />
        <Route path="/admin/courier/products/:id/edit" element={<AdminCourierEditProductPage />} />
        <Route path="/admin/courier/orders" element={<AdminCourierOrdersPage />} />
        <Route path="/admin/courier/orders/:id" element={<AdminCourierOrderDetailPage />} />
        <Route path="/admin/courier/claims" element={<AdminCourierClaimsPage />} />
        <Route path="/admin/courier/config" element={<AdminCourierConfigPage />} />
        <Route path="/admin/courier/categories" element={<AdminCourierCategoryPage />} />
        <Route path="/admin/courier/points" element={<AdminPointPage />} />
      </Route>

      {/* 하위호환: /admin/courier 이외의 /admin/* → /admin/shop/login */}
      <Route path="/admin/*" element={<Navigate to="/admin/shop/login" replace />} />

      {/* Error pages */}
      <Route path="/401" element={<Error401Page />} />
      <Route path="/403" element={<Error403Page />} />
      <Route path="/404" element={<Error404Page />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
