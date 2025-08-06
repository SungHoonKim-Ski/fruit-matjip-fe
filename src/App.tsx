import { BrowserRouter, Route, Routes, Navigate} from 'react-router-dom';
import MainPage from './pages/MainPage'; 
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRegisterPage from './pages/admin/AdminRegisterPage';
import AdminProductPage from './pages/admin/AdminProductPage';
import CreateProductPage from './pages/admin/CreateProductPage';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* <Route path="/" element={<Navigate to="/auth/my-store-name" />} /> */}
        <Route path="/" element={<MainPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/register" element={<AdminRegisterPage />} />
        <Route path="/admin/products" element={<AdminProductPage />} />
        <Route path="/admin/products/new" element={<CreateProductPage />} />
    
        {/* 기본 리디렉션 or 404 핸들링 */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
      <ToastContainer
        position="bottom-right"  // 👈 우측 하단
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        pauseOnHover
        draggable
      />
    </BrowserRouter>
  );
}

export default App;
