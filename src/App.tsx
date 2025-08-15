// src/App.tsx
import { Route, Routes, Navigate } from 'react-router-dom';
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
import Error404Page from './pages/error/Error404Page';
import Error403Page from './pages/error/Error403Page';
import RequireAdmin from './routes/RequireAdmin';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/me/orders" element={<OrderPage />} />

      <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route path="/admin/register" element={<AdminRegisterPage />} />
        <Route path="/admin/products" element={<AdminProductPage />} />
        <Route path="/admin/products/new" element={<AdminCreateProductPage />} />
        <Route path="/admin/sales" element={<AdminSalesPage />} />
        <Route path="/admin/reservations" element={<AdminReservationsPage />} />
        <Route path="/admin/products/:id/edit" element={<AdminEditProductPage />} />
      </Route>
      <Route path="/403" element={<Error403Page />} />
      <Route path="/404" element={<Error404Page />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}