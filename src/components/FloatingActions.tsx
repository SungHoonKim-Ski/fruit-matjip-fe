import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Props = {
  orderPath?: string; 
};

export default function FloatingActionsReversed({
  orderPath = '/order',
}: Props) {
  const nav = useNavigate();
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 160);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const goTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <>
      {/* 오른쪽: 주문내역 */}
      <button
        type="button"
        aria-label="주문 내역"
        onClick={() => nav(orderPath)}
        className="fixed right-4 bottom-4 z-50 rounded-full bg-orange-500 text-white
                   shadow-xl px-4 h-12 text-sm font-medium
                   hover:bg-orange-600 active:scale-[0.98] transition"
      >
        주문 내역
      </button>

      {/* 왼쪽: 맨 위로 */}
      <button
        type="button"
        aria-label="맨 위로"
        onClick={goTop}
        className={`fixed left-4 bottom-4 z-50 rounded-full bg-white text-gray-800
                    border border-gray-200 shadow-xl h-12 w-12 grid place-items-center
                    hover:shadow-2xl active:scale-[0.98] transition
                    ${showTop ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        ↑
      </button>
    </>
  );
}
