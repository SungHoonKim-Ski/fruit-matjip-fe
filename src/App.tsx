// src/App.tsx
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ProductsPage from './pages/auth/ProductsPage';
import OrderPage from './pages/auth/OrderPage';
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
import AdminKeywordPage from './pages/admin/AdminKeywordPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import Error404Page from './pages/error/Error404Page';
import Error403Page from './pages/error/Error403Page';
import RequireAdmin from './routes/RequireAdmin';
import { CartProvider } from './contexts/CartContext';
import { AdminSessionProvider } from './contexts/AdminSessionContext';
import CartPage from './pages/auth/CartPage';
import OrderCheckoutPage from './pages/auth/OrderCheckoutPage';
import PWAInstallPrompt from './components/PWAInstallPrompt';

export default function App() {
  return (
    <CartProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/order/checkout" element={<OrderCheckoutPage />} />
        <Route path="/me/orders" element={<OrderPage />} />

        <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/register" element={<AdminRegisterPage />} />
        <Route element={
          <AdminSessionProvider>
            <RequireAdmin />
          </AdminSessionProvider>
        }>
          <Route path="/admin/products" element={<AdminProductPage />} />
          <Route path="/admin/products/new" element={<AdminCreateProductPage />} />
          <Route path="/admin/products/bulk-sell-date" element={<AdminBulkSellDatePage />} />
          <Route path="/admin/products/order" element={<AdminProductOrderPage />} />
          <Route path="/admin/sales" element={<AdminSalesPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/admin/reservations" element={<AdminReservationsPage />} />
          <Route path="/admin/customers" element={<AdminCustomerPage />} />
          <Route path="/admin/keywords" element={<AdminKeywordPage />} />
          <Route path="/admin/products/:id/edit" element={<AdminEditProductPage />} />
        </Route>
        <Route path="/403" element={<Error403Page />} />
        <Route path="/404" element={<Error404Page />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
      <PWAInstallPrompt />
    </CartProvider>
  );
}