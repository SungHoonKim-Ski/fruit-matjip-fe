import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { approveDeliveryPayment } from '../../utils/api';
import { safeErrorLog } from '../../utils/environment';

export default function DeliveryApprovePage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  useEffect(() => {
    const pgToken = params.get('pg_token');
    const orderId = params.get('order_id');
    if (!pgToken || !orderId) {
      setStatus('error');
      return;
    }

    const approve = async () => {
      try {
        const res = await approveDeliveryPayment(Number(orderId), pgToken);
        if (!res.ok) {
          throw new Error('approve failed');
        }
        setStatus('success');
        setTimeout(() => nav('/me/orders'), 1500);
      } catch (e) {
        safeErrorLog(e, 'DeliveryApprovePage - approve');
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
            <h1 className="text-lg font-semibold text-gray-800">결제 승인 중...</h1>
            <p className="mt-2 text-sm text-gray-600">잠시만 기다려 주세요.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">결제가 완료되었습니다</h1>
            <p className="mt-2 text-sm text-gray-600">주문 내역으로 이동합니다.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-lg font-semibold text-gray-800">결제 승인 실패</h1>
            <p className="mt-2 text-sm text-gray-600">다시 시도해주세요.</p>
            <button
              type="button"
              className="mt-4 w-full h-10 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => nav('/me/orders')}
            >
              주문 내역으로 이동
            </button>
          </>
        )}
      </div>
    </main>
  );
}
