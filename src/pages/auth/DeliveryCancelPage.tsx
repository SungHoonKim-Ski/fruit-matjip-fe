import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cancelDeliveryPayment } from '../../utils/api';
import { safeErrorLog } from '../../utils/environment';

export default function DeliveryCancelPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  useEffect(() => {
    const orderId = params.get('order_id');
    if (!orderId) {
      setStatus('error');
      return;
    }

    const cancel = async () => {
      try {
        const res = await cancelDeliveryPayment(Number(orderId));
        if (!res.ok) throw new Error('cancel failed');
        setStatus('success');
      } catch (e) {
        safeErrorLog(e, 'DeliveryCancelPage - cancel');
        setStatus('error');
      }
    };

    cancel();
  }, [params]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white border rounded-lg shadow-sm p-6 w-full max-w-sm text-center">
        {status === 'pending' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">결제 취소 처리 중...</h1>
            <p className="mt-2 text-sm text-gray-600">잠시만 기다려 주세요.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">결제가 취소되었습니다</h1>
            <p className="mt-2 text-sm text-gray-600">주문 내역에서 확인해주세요.</p>
            <button
              type="button"
              className="mt-4 w-full h-10 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => nav('/me/orders?tab=delivery')}
            >
              주문 내역으로 이동
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">취소 처리 실패</h1>
            <p className="mt-2 text-sm text-gray-600">다시 시도해주세요.</p>
            <button
              type="button"
              className="mt-4 w-full h-10 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => nav('/me/orders?tab=delivery')}
            >
              주문 내역으로 이동
            </button>
          </>
        )}
      </div>
    </main>
  );
}
