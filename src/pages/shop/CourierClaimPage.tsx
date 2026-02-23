import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import CourierBottomNav from '../../components/shop/CourierBottomNav';
import {
  getCourierOrder,
  createCourierClaim,
  type CourierOrderDetailResponse,
  type CourierClaimType,
} from '../../utils/api';

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const CLAIM_TYPE_OPTIONS: { value: CourierClaimType; label: string; desc: string }[] = [
  {
    value: 'QUALITY_ISSUE',
    label: '품질문제',
    desc: '상품 파손, 변질, 오배송 등 품질 관련 문제',
  },
  {
    value: 'CHANGE_OF_MIND',
    label: '단순변심',
    desc: '단순 변심에 의한 교환/환불 요청',
  },
];

export default function CourierClaimPage() {
  const { code } = useParams<{ code: string }>();
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [order, setOrder] = useState<CourierOrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [claimType, setClaimType] = useState<CourierClaimType>('QUALITY_ISSUE');
  const [selectedItemId, setSelectedItemId] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!code) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await getCourierOrder(code);
        if (alive) setOrder(data);
      } catch (e) {
        safeErrorLog(e, 'CourierClaimPage - getCourierOrder');
        show(getSafeErrorMessage(e, '주문 정보를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code, show]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !order) return;

    if (reason.trim().length < 10 || reason.trim().length > 100) {
      show('사유를 10자 이상 100자 이내로 입력해주세요.', { variant: 'error' });
      return;
    }

    try {
      setSubmitting(true);
      await createCourierClaim(code, {
        claimType,
        courierOrderItemId: selectedItemId,
        reason: reason.trim(),
      });
      show('문의가 접수되었습니다.', { variant: 'success' });
      nav(`/shop/orders/${code}`, { replace: true });
    } catch (err) {
      safeErrorLog(err, 'CourierClaimPage - createCourierClaim');
      show(getSafeErrorMessage(err, '문의 접수에 실패했습니다.'), { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-24">
      {/* Header */}
      <section className="max-w-md mx-auto px-4">
        <h1 className="text-xl font-bold text-gray-800">문의하기</h1>
        <p className="text-sm text-gray-500 mt-1">주문번호 {order.displayCode}</p>
      </section>

      {/* Order summary */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">주문 상품</h2>
          <div className="space-y-2">
            {order.items.map((item, idx) => (
              <div key={`${item.courierProductId}-${idx}`} className="flex gap-3 items-center">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.productName}
                    className="w-12 h-12 object-cover rounded-lg border flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 line-clamp-1">{item.productName}</div>
                  <div className="text-xs text-gray-500">
                    {formatPrice(item.unitPrice)} x {item.quantity}
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-900 flex-shrink-0">
                  {formatPrice(item.subtotal)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t text-sm font-bold text-gray-900 flex justify-between">
            <span>총 결제 금액</span>
            <span className="text-orange-500">{formatPrice(order.totalAmount)}</span>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit}>
        {/* Claim type */}
        <section className="max-w-md mx-auto px-4 mt-3">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">문의 유형 선택</h2>
            <div className="space-y-2">
              {CLAIM_TYPE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    claimType === opt.value
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="claimType"
                    value={opt.value}
                    checked={claimType === opt.value}
                    onChange={() => setClaimType(opt.value)}
                    className="mt-0.5 accent-orange-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Item selection (optional) */}
        {order.items.length > 1 && (
          <section className="max-w-md mx-auto px-4 mt-3">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">문제 상품 선택 (선택사항)</h2>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    selectedItemId === undefined
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="selectedItem"
                    checked={selectedItemId === undefined}
                    onChange={() => setSelectedItemId(undefined)}
                    className="accent-orange-500"
                  />
                  <span className="text-sm text-gray-700">전체 상품</span>
                </label>
                {order.items.map((item, idx) => (
                  <label
                    key={`${item.courierProductId}-${idx}`}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      selectedItemId === item.courierProductId
                        ? 'border-orange-400 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="selectedItem"
                      checked={selectedItemId === item.courierProductId}
                      onChange={() => setSelectedItemId(item.courierProductId)}
                      className="accent-orange-500"
                    />
                    <span className="text-sm text-gray-700">{item.productName}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Reason */}
        <section className="max-w-md mx-auto px-4 mt-3">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">상세 사유</h2>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="문의 사유를 상세히 입력해주세요. (10~100자)"
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 resize-none"
            />
            <div className="mt-1 text-xs text-gray-400 text-right">
              {reason.trim().length}자 / 100자
            </div>
          </div>
        </section>

        {/* Info box */}
        <section className="max-w-md mx-auto px-4 mt-3">
          <div className={`rounded-lg p-4 text-sm ${
            claimType === 'QUALITY_ISSUE'
              ? 'bg-blue-50 border border-blue-200'
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <div className="font-medium mb-1">
              {claimType === 'QUALITY_ISSUE' ? '품질문제 안내' : '단순변심 안내'}
            </div>
            {claimType === 'QUALITY_ISSUE' ? (
              <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
                <li>반품 배송비는 판매자가 부담합니다.</li>
                <li>확인 후 환불 또는 재발송 처리됩니다.</li>
                <li>상품 사진을 함께 첨부하면 더 빠른 처리가 가능합니다.</li>
              </ul>
            ) : (
              <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
                <li>반품 배송비는 소비자가 부담합니다.</li>
                <li>상품 수령 후 7일 이내 요청 가능합니다.</li>
                <li>신선식품 특성상 단순변심 교환/환불이 제한될 수 있습니다.</li>
              </ul>
            )}
          </div>
        </section>

        {/* Submit */}
        <section className="max-w-md mx-auto px-4 mt-4">
          <button
            type="submit"
            disabled={submitting || reason.trim().length < 10 || reason.trim().length > 100}
            className="w-full h-12 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '문의 접수 중...' : '문의 접수하기'}
          </button>
          <button
            type="button"
            onClick={() => nav(-1)}
            className="w-full h-10 mt-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            취소
          </button>
        </section>
      </form>

      <CourierBottomNav />
    </main>
  );
}
