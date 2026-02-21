import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCartTotalQuantity } from '../../utils/courierCart';

export default function CourierBottomNav() {
  const nav = useNavigate();
  const location = useLocation();
  const [showTop, setShowTop] = useState(false);
  const [cartCount, setCartCount] = useState(() => getCartTotalQuantity());

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 160);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const update = () => setCartCount(getCartTotalQuantity());
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  const goTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const items = [
    { label: '홈', path: '/shop', icon: '🏠', exact: true },
    { label: '장바구니', path: '/shop/cart', icon: '🛒', exact: false },
    { label: '주문내역', path: '/shop/orders', icon: '📋', exact: false },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-4xl flex">
          {items.map(item => {
            const active = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => nav(item.path)}
                className={`flex-1 flex flex-col items-center justify-center py-2 transition-colors
                  ${active ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span className="relative text-xl leading-none">
                  {item.icon}
                  {item.path === '/shop/cart' && cartCount > 0 && (
                    <span className="absolute -top-1 -right-2 bg-orange-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </span>
                <span className={`mt-0.5 text-xs font-semibold ${active ? 'text-orange-600' : 'text-gray-500'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      <button
        type="button"
        aria-label="맨 위로"
        onClick={goTop}
        className={`fixed left-4 bottom-16 z-50 rounded-full
                    bg-gradient-to-br from-white to-gray-50 text-gray-900
                    border-2 border-gray-300 shadow-2xl h-12 w-12 grid place-items-center
                    hover:from-white hover:to-gray-100 hover:shadow-[0_12px_24px_rgba(0,0,0,0.2)]
                    active:scale-[0.98] transition
                    ${showTop ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <span className="text-lg font-bold">↑</span>
      </button>
    </>
  );
}
