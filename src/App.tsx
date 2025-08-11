import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';

import ShopPage from './pages/auth/ShopPage';
import OrderPage from './pages/auth/OrderPage';
import ProductDetailPage from './pages/auth/ProductDetailPage';

import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRegisterPage from './pages/admin/AdminRegisterPage';
import AdminProductPage from './pages/admin/AdminProductPage';
import CreateProductPage from './pages/admin/CreateProductPage';
import AdminSalesPage from './pages/admin/AdminSalesPage';
import AdminReservationsPage from './pages/admin/AdminReservationsPage';
import AdminEditProductPage from './pages/admin/AdminEditProductPage';
import Error404Page from './pages/error/Error404Page';
import Error403Page from './pages/error/Error403Page';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/orders" element={<OrderPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />

        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/register" element={<AdminRegisterPage />} />
        <Route path="/admin/products" element={<AdminProductPage />} />
        <Route path="/admin/products/new" element={<CreateProductPage />} />
        <Route path="/admin/sales" element={<AdminSalesPage />} />
        <Route path="/admin/reservations" element={<AdminReservationsPage />} />
        <Route path="/admin/products/:id/edit" element={<AdminEditProductPage />} />

        {/* 에러 페이지 라우트 */}
        <Route path="/403" element={<Error403Page />} />
        <Route path="/404" element={<Error404Page />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>

    </BrowserRouter>
  );
}

export default App;
