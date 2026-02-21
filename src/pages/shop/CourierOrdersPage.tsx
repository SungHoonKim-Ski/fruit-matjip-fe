import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import CourierBottomNav from '../../components/shop/CourierBottomNav';
import {
  getCourierOrders,
  type CourierOrderSummary,
  type CourierOrderStatus,
} from '../../utils/api';

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return dateStr;
  }
};

const STATUS_LABELS: Record<CourierOrderStatus, string> = {
  PENDING_PAYMENT: '결제대기',
  PAID: '결제완료',
  PREPARING: '상품준비중',
  SHIPPED: '발송완료',
  IN_TRANSIT: '배송중',
  DELIVERED: '배송완료',
  CANCELED: '취소됨',
  FAILED: '실패',
};

const STATUS_COLORS: Record<CourierOrderStatus, string> = {
  PENDING_PAYMENT: 'bg-gray-100 text-gray-600',
  PAID: 'bg-blue-100 text-blue-700',
  PREPARING: 'bg-orange-100 text-orange-700',
  SHIPPED: 'bg-purple-100 text-purple-700',
  IN_TRANSIT: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELED: 'bg-red-100 text-red-600',
  FAILED: 'bg-red-100 text-red-600',
};

export default function CourierOrdersPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [orders, setOrders] = useState<CourierOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasNext, setHasNext] = useState(false);

  const fetchOrders = useCallback(async (cursor?: number) => {
    try {
      const isInitial = cursor == null;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);

      const result = await getCourierOrders(cursor, 10);
      if (isInitial) {
        setOrders(result.orders);
      } else {
        setOrders(prev => [...prev, ...result.orders]);
      }
      setNextCursor(result.nextCursor);
      setHasNext(result.hasNext);
    } catch (e) {
      safeErrorLog(e, 'CourierOrdersPage - fetchOrders');
      show(getSafeErrorMessage(e, '주문 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [show]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleLoadMore = () => {
    if (nextCursor != null && hasNext && !loadingMore) {
      fetchOrders(nextCursor);
    }
  };

  return (
    <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-24">

      <section className="max-w-md mx-auto px-4 mt-3">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="text-center py-20">
            <svg className="mx-auto mb-4 w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 font-medium">주문 내역이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">첫 주문을 해보세요</p>
            <button
              type="button"
              onClick={() => nav('/shop')}
              className="mt-6 h-11 px-6 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition"
            >
              쇼핑하기
            </button>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="space-y-3">
            {orders.map(order => (
              <div
                key={order.displayCode}
                className="bg-white rounded-lg shadow p-4 cursor-pointer hover:bg-gray-50 transition active:bg-gray-100"
                onClick={() => nav(`/shop/orders/${order.displayCode}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-800 line-clamp-1">
                  {order.itemSummary || (order.items.length > 0
                    ? `${order.items[0].productName}${order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}`
                    : '주문 상품')}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    주문번호 {order.displayCode}
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {formatPrice(order.totalAmount)}
                  </span>
                </div>
              </div>
            ))}

            {hasNext && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full h-11 rounded-lg border border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {loadingMore ? '불러오는 중...' : '더보기'}
              </button>
            )}
          </div>
        )}
      </section>
      <CourierBottomNav />
    </main>
  );
}
