import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { approveCourierPayment } from '../../utils/api';
import { clearCart } from '../../utils/courierCart';
import { safeErrorLog } from '../../utils/environment';

export default function CourierApprovePage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  // Prevent back navigation during approval
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const pgToken = params.get('pg_token');
    const orderCode = params.get('order_id');
    if (!pgToken || !orderCode) {
      setStatus('error');
      return;
    }

    localStorage.removeItem('pendingCourierOrderCode');

    const approve = async () => {
      try {
        const res = await approveCourierPayment(orderCode, pgToken);
        if (!res.ok) {
          throw new Error('approve failed');
        }
        const wasBuyNow = localStorage.getItem('courierBuyNowOrder');
        localStorage.removeItem('courierBuyNowOrder');
        if (!wasBuyNow) {
          clearCart();
        }
        setStatus('success');
        setTimeout(() => nav(`/shop/orders/${orderCode}`, { replace: true }), 1500);
      } catch (e) {
        safeErrorLog(e, 'CourierApprovePage - approve');
        setStatus('error');
      }
    };

    approve();
  }, [params, nav]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white border rounded-lg shadow-sm p-6 w-full max-w-sm text-center">
        {status === 'pending' && (
          <>
            <div className="mx-auto w-10 h-10 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
            <h1 className="mt-4 text-lg font-semibold text-gray-800">결제 처리 중...</h1>
            <p className="mt-2 text-sm text-gray-600">잠시만 기다려 주세요.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="mx-auto w-10 h-10 flex items-center justify-center rounded-full bg-green-100">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mt-4 text-lg font-semibold text-gray-800">결제가 완료되었습니다</h1>
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-600">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
              <span>주문 상세로 이동 중...</span>
            </div>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">결제 승인 실패</h1>
            <p className="mt-2 text-sm text-gray-600">다시 시도해주세요.</p>
            <button
              type="button"
              className="mt-4 w-full h-10 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => nav('/shop/cart')}
            >
              장바구니로 이동
            </button>
          </>
        )}
      </div>
    </main>
  );
}
