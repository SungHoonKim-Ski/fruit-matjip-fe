import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { failDeliveryPayment } from '../../utils/api';
import { safeErrorLog } from '../../utils/environment';

export default function DeliveryFailPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  useEffect(() => {
    const orderCode = params.get('order_id');
    if (!orderCode) {
      setStatus('error');
      return;
    }

    localStorage.removeItem('pendingDeliveryOrderCode');

    const fail = async () => {
      try {
        const res = await failDeliveryPayment(orderCode);
        if (!res.ok) throw new Error('fail failed');
        setStatus('success');
      } catch (e) {
        safeErrorLog(e, 'DeliveryFailPage - fail');
        setStatus('error');
      }
    };

    fail();
  }, [params]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white border rounded-lg shadow-sm p-6 w-full max-w-sm text-center">
        {status === 'pending' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">결제 실패 처리 중...</h1>
            <p className="mt-2 text-sm text-gray-600">잠시만 기다려 주세요.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">결제가 실패했습니다</h1>
            <p className="mt-2 text-sm text-gray-600">다시 시도해주세요.</p>
            <button
              type="button"
              className="mt-4 w-full h-10 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => nav('/store/me/orders?tab=delivery')}
            >
              주문 내역으로 이동
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">실패 처리 오류</h1>
            <p className="mt-2 text-sm text-gray-600">다시 시도해주세요.</p>
            <button
              type="button"
              className="mt-4 w-full h-10 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => nav('/store/me/orders?tab=delivery')}
            >
              주문 내역으로 이동
            </button>
          </>
        )}
      </div>
    </main>
  );
}
