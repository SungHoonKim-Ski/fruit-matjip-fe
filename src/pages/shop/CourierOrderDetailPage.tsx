import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import CourierBottomNav from '../../components/shop/CourierBottomNav';
import {
  getCourierOrder,
  getCourierClaims,
  cancelCourierOrder,
  getTrackingUrl,
  type CourierOrderDetailResponse,
  type CourierOrderStatus,
  type CourierClaimSummary,
  type CourierClaimStatus,
  type CourierClaimType,
} from '../../utils/api';

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const CLAIM_TYPE_LABELS: Record<CourierClaimType, string> = {
  QUALITY_ISSUE: '품질문제',
  CHANGE_OF_MIND: '단순변심',
};

const CLAIM_STATUS_LABELS: Record<CourierClaimStatus, string> = {
  REQUESTED: '접수됨',
  IN_REVIEW: '검토중',
  APPROVED: '승인',
  REJECTED: '거부',
  RESOLVED: '처리완료',
};

const CLAIM_STATUS_COLORS: Record<CourierClaimStatus, string> = {
  REQUESTED: 'bg-yellow-100 text-yellow-700',
  IN_REVIEW: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
  RESOLVED: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<CourierOrderStatus, string> = {
  PENDING_PAYMENT: '결제대기',
  PAID: '결제완료',
  ORDERING: '상품준비중',
  ORDER_COMPLETED: '상품준비완료',
  IN_TRANSIT: '배송중',
  DELIVERED: '배송완료',
  CANCELED: '취소됨',
  FAILED: '실패',
};

const STATUS_COLORS: Record<CourierOrderStatus, string> = {
  PENDING_PAYMENT: 'bg-gray-100 text-gray-600',
  PAID: 'bg-blue-100 text-blue-700',
  ORDERING: 'bg-orange-100 text-orange-700',
  ORDER_COMPLETED: 'bg-purple-100 text-purple-700',
  IN_TRANSIT: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELED: 'bg-red-100 text-red-600',
  FAILED: 'bg-red-100 text-red-600',
};

export default function CourierOrderDetailPage() {
  const { code } = useParams<{ code: string }>();
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [order, setOrder] = useState<CourierOrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<CourierClaimSummary[]>([]);
  const [cancelModal, setCancelModal] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await getCourierOrder(code);
        if (alive) setOrder(data);
        // 클레임 목록도 함께 로드 (실패해도 주문 상세는 표시)
        try {
          const claimData = await getCourierClaims(code);
          if (alive) setClaims(claimData.claims);
        } catch {
          // 클레임 조회 실패는 무시
        }
      } catch (e) {
        safeErrorLog(e, 'CourierOrderDetailPage - getCourierOrder');
        show(getSafeErrorMessage(e, '주문 상세를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code, show]);

  if (loading) {
    return (
      <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-24">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
        <CourierBottomNav />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-24">
        <div className="max-w-md mx-auto px-4 mt-20 text-center">
          <p className="text-gray-500">주문 정보를 찾을 수 없습니다.</p>
          <button
            type="button"
            onClick={() => nav('/shop/orders')}
            className="mt-4 h-10 px-6 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
          >
            주문 목록으로 이동
          </button>
        </div>
        <CourierBottomNav />
      </main>
    );
  }

  const trackingUrl = order.trackingNumber
    ? getTrackingUrl(order.courierCompany, order.trackingNumber)
    : null;

  const canCancel = order.status === 'PAID' || order.status === 'ORDERING';

  const handleCancel = async () => {
    if (!order) return;
    try {
      setCanceling(true);
      await cancelCourierOrder(order.displayCode);
      show('주문이 취소되었습니다.', { variant: 'success' });
      setCancelModal(false);
      nav('/shop/orders');
    } catch (e) {
      safeErrorLog(e, 'CourierOrderDetailPage - cancel');
      show(getSafeErrorMessage(e, '주문 취소에 실패했습니다.'), { variant: 'error' });
    } finally {
      setCanceling(false);
    }
  };

  return (
    <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-24">

      {/* Order header */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">주문번호 {order.displayCode}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-400">{formatDateTime(order.createdAt)}</div>
        </div>
      </section>

      {/* Order items */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">주문 상품</h2>
          <div className="space-y-3">
            {order.items.map((item, idx) => (
              <div key={`${item.courierProductId}-${idx}`} className="flex gap-3">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.productName}
                    className="w-16 h-16 object-cover rounded-lg border flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 line-clamp-2">{item.productName}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formatPrice(item.unitPrice)} x {item.quantity}
                  </div>
                </div>
                <div className="flex-shrink-0 text-sm font-semibold text-gray-900">
                  {formatPrice(item.subtotal)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Payment info */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">결제 정보</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>상품 합계</span>
              <span>{formatPrice(order.productTotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>배송비</span>
              <span>{formatPrice(order.shippingFee)}</span>
            </div>
            {order.remoteAreaFee > 0 && (
              <div className="flex justify-between text-orange-600">
                <span>도서산간 추가비</span>
                <span>+{formatPrice(order.remoteAreaFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t pt-2 mt-2">
              <span>총 결제 금액</span>
              <span className="text-orange-500">{formatPrice(order.totalAmount)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Delivery address info */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">배송지 정보</h2>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex gap-2">
              <span className="text-gray-500 w-16 flex-shrink-0">수령인</span>
              <span>{order.recipientName}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 w-16 flex-shrink-0">연락처</span>
              <span>{order.recipientPhone}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 w-16 flex-shrink-0">주소</span>
              <span>({order.postalCode}) {order.address1} {order.address2}</span>
            </div>
            {order.deliveryMemo && (
              <div className="flex gap-2">
                <span className="text-gray-500 w-16 flex-shrink-0">메모</span>
                <span>{order.deliveryMemo}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Shipping/tracking info */}
      {(order.courierCompany || order.trackingNumber || order.shippedAt || order.deliveredAt) && (
        <section className="max-w-md mx-auto px-4 mt-3">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-base font-semibold text-gray-800 mb-3">배송 정보</h2>
            <div className="space-y-2 text-sm text-gray-700">
              {order.courierCompany && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 flex-shrink-0">택배사</span>
                  <span>{order.courierCompany}</span>
                </div>
              )}
              {order.trackingNumber && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 flex-shrink-0">운송장번호</span>
                  <span>{order.trackingNumber}</span>
                </div>
              )}
              {order.shippedAt && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 flex-shrink-0">발송일</span>
                  <span>{formatDateTime(order.shippedAt)}</span>
                </div>
              )}
              {order.deliveredAt && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 flex-shrink-0">배송완료</span>
                  <span>{formatDateTime(order.deliveredAt)}</span>
                </div>
              )}
              {trackingUrl && (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  배송 추적하기
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 주문 취소 버튼 - PAID/ORDERING 상태에서만 노출 */}
      {canCancel && (
        <section className="max-w-md mx-auto px-4 mt-3">
          <button
            type="button"
            onClick={() => setCancelModal(true)}
            className="w-full h-11 rounded-lg border border-red-300 bg-white text-sm text-red-600 hover:bg-red-50 transition font-medium"
          >
            주문 취소
          </button>
        </section>
      )}

      {/* CS claim button - available after payment */}
      {!['PENDING_PAYMENT', 'CANCELED', 'FAILED'].includes(order.status) && (
        <section className="max-w-md mx-auto px-4 mt-3">
          <button
            type="button"
            onClick={() => nav(`/shop/orders/${order.displayCode}/claim`)}
            className="w-full h-11 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 transition font-medium"
          >
            문의하기
          </button>
        </section>
      )}

      {/* Existing claims */}
      {claims.length > 0 && (
        <section className="max-w-md mx-auto px-4 mt-3">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-base font-semibold text-gray-800 mb-3">문의 내역</h2>
            <div className="space-y-3">
              {claims.map(claim => (
                <div key={claim.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLAIM_STATUS_COLORS[claim.status] || 'bg-gray-100 text-gray-600'}`}>
                      {CLAIM_STATUS_LABELS[claim.status] || claim.status}
                    </span>
                    <span className={`text-xs font-medium ${
                      claim.claimType === 'QUALITY_ISSUE' ? 'text-red-600' : 'text-blue-600'
                    }`}>
                      {CLAIM_TYPE_LABELS[claim.claimType] || claim.claimType}
                    </span>
                  </div>
                  {claim.productName && (
                    <div className="text-sm text-gray-700 mb-1">{claim.productName}</div>
                  )}
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">{claim.reason}</div>
                  {claim.adminNote && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-500 mb-0.5">관리자 답변</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">{claim.adminNote}</div>
                    </div>
                  )}
                  {claim.action && (
                    <div className="mt-1 text-xs text-gray-500">
                      처리: {claim.action === 'REFUND' ? '환불' : claim.action === 'RESHIP' ? '재발송' : claim.action}
                      {claim.refundAmount != null && ` (${formatPrice(claim.refundAmount)})`}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-gray-400">
                    {formatDateTime(claim.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <CourierBottomNav />

      {/* 주문 취소 확인 모달 */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">주문 취소</h3>
            <p className="text-sm text-gray-600 mb-1">
              주문번호 <span className="font-mono font-medium">{order.displayCode}</span>
            </p>
            <p className="text-sm text-red-600 mb-6">정말 취소하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCancelModal(false)}
                disabled={canceling}
                className="flex-1 h-11 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                돌아가기
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={canceling}
                className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition disabled:opacity-50"
              >
                {canceling ? '처리중...' : '주문 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
