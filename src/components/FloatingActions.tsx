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
      {/* 오른쪽: 배달하기 / 주문내역 */}
      <div className="fixed right-4 bottom-4 z-50">
        <button
          type="button"
          aria-label="배달하기 · 주문내역"
          onClick={() => nav(orderPath)}
          className="rounded-xl bg-white text-gray-900 border-2 border-orange-500 shadow-lg px-4 py-2
                     text-sm font-bold tracking-tight flex items-center gap-2
                     hover:bg-orange-50 hover:shadow-xl active:scale-[0.98]
                     focus:outline-none focus:ring-4 focus:ring-orange-200 transition"
        >
          <span className="text-gray-900 text-center leading-tight">배달하기<br />주문내역</span>
          <span className="ml-1 text-orange-500 text-lg leading-none" aria-hidden="true">›</span>
        </button>
      </div>

      {/* 왼쪽: 맨 위로 */}
      <button
        type="button"
        aria-label="맨 위로"
        onClick={goTop}
        className={`fixed left-4 bottom-4 z-50 rounded-full
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
