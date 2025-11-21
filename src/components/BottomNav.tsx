import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function BottomNav() {
  const nav = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === '/products' && currentPath === '/products') return true;
    if (path === '/me/orders' && currentPath.startsWith('/me/orders')) return true;
    return false;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-40 pb-safe safe-area-bottom">
      <button
        onClick={() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          nav('/products');
        }}
        className={`flex flex-col items-center justify-center w-full h-full ${isActive('/products') ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span className="text-xs font-medium">홈</span>
      </button>
      <button
        onClick={() => nav('/me/orders')}
        className={`flex flex-col items-center justify-center w-full h-full ${isActive('/me/orders') ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <span className="text-xs font-medium">주문내역</span>
      </button>
    </nav>
  );
}
