import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';

import ShopPage from './pages/auth/ShopPage';
import OrderPage from './pages/auth/OrderPage';

import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRegisterPage from './pages/admin/AdminRegisterPage';
import AdminProductPage from './pages/admin/AdminProductPage';
import CreateProductPage from './pages/admin/CreateProductPage';
import AdminSalesPage from './pages/admin/AdminSalesPage';
import AdminReservationsPage from './pages/admin/AdminReservationsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/login' element={<LoginPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/orders" element={<OrderPage />} />

        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/register" element={<AdminRegisterPage />} />
        <Route path="/admin/products" element={<AdminProductPage />} />
        <Route path="/admin/products/new" element={<CreateProductPage />} />
        <Route path="/admin/sales" element={<AdminSalesPage />} />
        <Route path="/admin/reservations" element={<AdminReservationsPage />} />


        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>

    </BrowserRouter>
  );
}

export default App;
