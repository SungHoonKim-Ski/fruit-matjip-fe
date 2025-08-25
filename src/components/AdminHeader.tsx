import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminHeader() {
  const navigate = useNavigate();
  const location = window.location.pathname;

  const goProducts = () => {
    if (location !== '/admin/products') {
      navigate('/admin/products');
    }
  };
  const goNewProduct = () => {
    if (location !== '/admin/products/new') {
      navigate('/admin/products/new');
    }
  };
  const goReservations = () => {
    if (location !== '/admin/reservations') {
      navigate('/admin/reservations');
    }
  };
  const goSales = () => {
    if (location !== '/admin/sales') {
      navigate('/admin/sales');
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <button 
          type="button" 
          onClick={goProducts} 
          className="h-10 w-full sm:w-auto px-4 rounded bg-orange-500 text-white hover:bg-orange-600 text-sm font-medium transition-colors"
        >
          📦 상품 관리
        </button>
        <button 
          type="button" 
          onClick={goNewProduct} 
          className="h-10 w-full sm:w-auto px-4 rounded bg-green-500 text-white hover:bg-green-600 text-sm font-medium transition-colors"
        >
          ➕ 상품 등록
        </button>
        <button 
          type="button" 
          onClick={goReservations} 
          className="h-10 w-full sm:w-auto px-4 rounded bg-sky-500 text-white hover:bg-sky-600 text-sm font-medium transition-colors"
        >
          🧾 예약 확인
        </button>
        <button 
          type="button" 
          onClick={goSales} 
          className="h-10 w-full sm:w-auto px-4 rounded bg-indigo-500 text-white hover:bg-indigo-600 text-sm font-medium transition-colors"
        >
          📈 판매량 확인
        </button>
      </div>
    </div>
  );
}
