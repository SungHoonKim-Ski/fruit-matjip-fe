import React from 'react';
import { Link } from 'react-router-dom'; 

const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 w-full bg-white border-t flex justify-around py-2 z-10">
      <Link to="/" className="text-center text-sm">🏠 홈</Link>
      <Link to="/auth/[storeName]/order" className="text-center text-sm">📦 내 예약</Link>
      <Link to="/login" className="text-center text-sm">🔐 로그인</Link>
    </nav>
  );
};

export default BottomNav;
