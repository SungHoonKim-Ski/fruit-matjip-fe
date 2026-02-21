import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getCartTotalQuantity } from '../../utils/courierCart';

interface CourierNavProps {
  title?: string;
  showBack?: boolean;
  backTo?: string;
  showCart?: boolean;
}

export default function CourierNav({ title = '', showBack = true, backTo, showCart = true }: CourierNavProps) {
  const nav = useNavigate();
  const cartCount = getCartTotalQuantity();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
      <div className="mx-auto w-full max-w-md h-14 flex items-center justify-between px-4">
        {/* Left: Back / Home */}
        <div className="flex-1 flex justify-start">
          {showBack && (
            <button
              type="button"
              onClick={() => (backTo ? nav(backTo) : nav(-1))}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
              aria-label="뒤로 가기"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span>홈</span>
            </button>
          )}
        </div>

        {/* Center: Title */}
        <div className="flex-1 flex justify-center">
          <span className="font-bold text-gray-800 text-base truncate">{title}</span>
        </div>

        {/* Right: Cart */}
        <div className="flex-1 flex justify-end">
          {showCart && (
            <button
              type="button"
              onClick={() => nav('/shop/cart')}
              className="relative h-10 w-10 grid place-items-center rounded-md hover:bg-gray-50"
              aria-label="장바구니"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
