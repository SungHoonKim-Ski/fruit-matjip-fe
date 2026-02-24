import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import CourierBottomNav from '../../components/shop/CourierBottomNav';
import { getCart, getBuyNowItem, clearBuyNow, CartItem } from '../../utils/courierCart';
import {
  getCourierShippingFee,
  createCourierOrder,
  getCourierInfo,
  type ShippingFeeResponse,
} from '../../utils/api';

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const getItemUnitPrice = (item: CartItem): number => {
  const optionExtra = (item.selectedOptions || []).reduce((s, o) => s + o.additionalPrice, 0);
  return item.price + optionExtra;
};

export default function CourierCheckoutPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [isBuyNow] = useState(() => !!getBuyNowItem());
  const [items] = useState<CartItem[]>(() => {
    const buyNow = getBuyNowItem();
    if (buyNow) {
      clearBuyNow();
      return [buyNow];
    }
    return getCart();
  });
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [deliveryMemo, setDeliveryMemo] = useState('');
  const [shippingFee, setShippingFee] = useState<ShippingFeeResponse | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentFallbackPcUrl, setPaymentFallbackPcUrl] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const buildIdempotencyKey = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  // Redirect to shop if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      nav('/shop', { replace: true });
    }
  }, [items, nav]);

  const totalQuantity = useMemo(
    () => items.reduce((s, i) => s + i.quantity, 0),
    [items],
  );

  const productTotal = useMemo(
    () => items.reduce((s, i) => s + getItemUnitPrice(i) * i.quantity, 0),
    [items],
  );

  // Fetch base shipping fee on mount (no postal code yet)
  useEffect(() => {
    if (items.length === 0) return;
    let alive = true;
    (async () => {
      try {
        setShippingLoading(true);
        const feeItems = items.map(i => ({ courierProductId: i.courierProductId, quantity: i.quantity }));
        const fee = await getCourierShippingFee(feeItems);
        if (alive) setShippingFee(fee);
      } catch (e) {
        safeErrorLog(e, 'CourierCheckoutPage - getCourierShippingFee (init)');
      } finally {
        if (alive) setShippingLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [items]);

  // Recalculate shipping fee when postal code changes
  const fetchShippingFeeForPostal = async (postal: string) => {
    if (items.length === 0) return;
    try {
      setShippingLoading(true);
      const feeItems = items.map(i => ({ courierProductId: i.courierProductId, quantity: i.quantity }));
      const fee = await getCourierShippingFee(feeItems, postal);
      setShippingFee(fee);
    } catch (e) {
      safeErrorLog(e, 'CourierCheckoutPage - getCourierShippingFee (postal)');
    } finally {
      setShippingLoading(false);
    }
  };

  // Pre-fill saved courier receiver info on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const info = await getCourierInfo();
        if (!alive || !info) return;
        if (info.receiverName) setRecipientName(info.receiverName);
        if (info.receiverPhone) setRecipientPhone(info.receiverPhone);
        if (info.postalCode) {
          setPostalCode(info.postalCode);
          await fetchShippingFeeForPostal(info.postalCode);
        }
        if (info.address1) setAddress1(info.address1);
        if (info.address2) setAddress2(info.address2);
      } catch (e) {
        // 저장된 정보 로드 실패는 무시 (사용자가 직접 입력)
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPostcode = () => {
    const kakaoPostcode = (window as any)?.kakao?.Postcode;
    if (!kakaoPostcode) {
      show('주소 검색을 불러올 수 없습니다.', { variant: 'error' });
      return;
    }
    new kakaoPostcode({
      oncomplete: async (data: any) => {
        const roadAddr = data.roadAddress || data.address || '';
        const postal = data.zonecode || '';
        const buildingName = data.buildingName || '';
        setPostalCode(postal);
        setAddress1(roadAddr);
        if (buildingName && !address2) setAddress2(buildingName);
        await fetchShippingFeeForPostal(postal);
      },
    }).open();
  };

  const totalPayment = useMemo(() => {
    if (!shippingFee) return productTotal;
    return productTotal + shippingFee.totalFee;
  }, [productTotal, shippingFee]);

  const canSubmit = useMemo(() => {
    return (
      items.length > 0
      && recipientName.trim() !== ''
      && recipientPhone.trim() !== ''
      && postalCode.trim() !== ''
      && address1.trim() !== ''
      && !submitting
      && !shippingLoading
    );
  }, [items, recipientName, recipientPhone, postalCode, address1, submitting, shippingLoading]);

  const submitBlockers = useMemo(() => {
    const reasons: string[] = [];
    if (!recipientName.trim()) reasons.push('수령인 이름을 입력해주세요.');
    if (!recipientPhone.trim()) reasons.push('연락처를 입력해주세요.');
    if (!postalCode.trim() || !address1.trim()) reasons.push('배송지 주소를 입력해주세요.');
    if (shippingLoading) reasons.push('배송비를 계산 중입니다.');
    if (submitting) reasons.push('결제 준비 중입니다.');
    return reasons;
  }, [recipientName, recipientPhone, postalCode, address1, shippingLoading, submitting]);

  const isAllowedPaymentUrl = (url: string): boolean => {
    try {
      const { hostname } = new URL(url);
      return hostname === 'online-pay.kakao.com'
        || hostname === 'online-payment.kakaopay.com'
        || hostname === 'mockup-pg-web.kakao.com';
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const idempotencyKey = idempotencyKeyRef.current ?? buildIdempotencyKey();
      idempotencyKeyRef.current = idempotencyKey;

      const result = await createCourierOrder({
        items: items.map(i => ({
          courierProductId: i.courierProductId,
          quantity: i.quantity,
          selectedOptionIds: (i.selectedOptions || []).map(o => o.optionId),
        })),
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        postalCode: postalCode.trim(),
        address1: address1.trim(),
        address2: address2.trim(),
        deliveryMemo: deliveryMemo.trim(),
        idempotencyKey,
      });

      if (result.orderCode) {
        localStorage.setItem('pendingCourierOrderCode', result.orderCode);
        if (isBuyNow) {
          localStorage.setItem('courierBuyNowOrder', 'true');
        }
      }

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const mobileUrl = result.mobileRedirectUrl;
      const pcUrl = result.redirectUrl;

      if (pcUrl && !isAllowedPaymentUrl(pcUrl)) throw new Error('허용되지 않은 결제 URL입니다.');
      if (mobileUrl && !isAllowedPaymentUrl(mobileUrl)) throw new Error('허용되지 않은 결제 URL입니다.');

      if (!isMobile) {
        if (!pcUrl) throw new Error('결제 URL이 없습니다.');
        window.location.href = pcUrl;
      } else if (mobileUrl) {
        setTimeout(() => { setPaymentFallbackPcUrl(pcUrl || null); }, 2000);
        window.location.href = mobileUrl;
      } else if (pcUrl) {
        setPaymentFallbackPcUrl(pcUrl);
      } else {
        throw new Error('결제 URL이 없습니다.');
      }
    } catch (e) {
      safeErrorLog(e, 'CourierCheckoutPage - handleSubmit');
      show(getSafeErrorMessage(e, '결제 준비 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setSubmitting(false);
      idempotencyKeyRef.current = null;
    }
  };

  if (items.length === 0) return null;

  return (
    <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-20">

      {/* Order items summary */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">주문 상품</h2>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={`${item.courierProductId}:${(item.selectedOptions || []).map(o => o.optionId).sort().join(',')}-${idx}`} className="flex gap-3">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-16 h-16 object-cover rounded-lg border flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 line-clamp-2">{item.name}</div>
                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {item.selectedOptions.map(o => o.optionName).join(', ')}
                      {item.selectedOptions.some(o => o.additionalPrice > 0) && (
                        <span className="ml-1">
                          (+{item.selectedOptions.reduce((s, o) => s + o.additionalPrice, 0).toLocaleString()}원)
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-gray-500">
                    {formatPrice(getItemUnitPrice(item))} x {item.quantity}
                  </div>
                  <div className="text-sm font-bold text-orange-500">
                    {formatPrice(getItemUnitPrice(item) * item.quantity)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recipient info form */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">배송지 정보</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">수령인 이름 *</label>
              <input
                type="text"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
                className="mt-1 w-full h-10 border rounded-lg px-3 text-sm"
                placeholder="수령인 이름"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">연락처 *</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={recipientPhone}
                onChange={e => setRecipientPhone(e.target.value.replace(/\D/g, ''))}
                onPaste={e => {
                  e.preventDefault();
                  const pasted = (e.clipboardData || (window as any).clipboardData).getData('text');
                  setRecipientPhone(pasted.replace(/\D/g, ''));
                }}
                className="mt-1 w-full h-10 border rounded-lg px-3 text-sm"
                placeholder="01012345678"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">배송지 주소 *</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={postalCode}
                  readOnly
                  className="h-10 w-24 border rounded-lg px-3 bg-gray-50 text-sm"
                  placeholder="우편번호"
                />
                <button
                  type="button"
                  className="h-10 px-4 rounded-lg border bg-white hover:bg-gray-50 text-sm"
                  onClick={openPostcode}
                >
                  우편번호 검색
                </button>
              </div>
              <input
                type="text"
                value={address1}
                readOnly
                className="mt-2 w-full h-10 border rounded-lg px-3 bg-gray-50 text-sm"
                placeholder="기본 주소"
              />
              <input
                type="text"
                value={address2}
                onChange={e => setAddress2(e.target.value)}
                className="mt-2 w-full h-10 border rounded-lg px-3 text-sm"
                placeholder="상세 주소 (동, 호수 등)"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">배송 메모 (선택)</label>
              <input
                type="text"
                value={deliveryMemo}
                onChange={e => setDeliveryMemo(e.target.value)}
                className="mt-1 w-full h-10 border rounded-lg px-3 text-sm"
                placeholder="부재 시 문 앞에 놓아주세요"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Shipping info */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">배송비</h2>
          {shippingLoading ? (
            <div className="text-sm text-gray-500">배송비 계산 중...</div>
          ) : shippingFee ? (
            <div className="space-y-1 text-sm text-gray-700">
              <div className="flex justify-between">
                <span>기본 배송비</span>
                <span>{formatPrice(shippingFee.baseFee)}</span>
              </div>
              {shippingFee.isRemoteArea && shippingFee.extraFee > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>도서산간 추가비</span>
                  <span>+{formatPrice(shippingFee.extraFee)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                <span>배송비 합계</span>
                <span>{formatPrice(shippingFee.totalFee)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">배송비를 조회할 수 없습니다.</div>
          )}
        </div>
      </section>

      {/* 결제 수단 */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold text-gray-800 mb-3">결제 수단</h2>
          <div className="flex gap-2">
            <label className="flex-1 flex items-center gap-2 cursor-pointer border-2 border-orange-500 rounded-lg px-3 py-2.5">
              <input type="radio" checked readOnly className="accent-orange-500" />
              <span className="inline-block h-6 px-2 rounded text-xs font-bold leading-6"
                style={{ backgroundColor: '#FEE500', color: '#3C1E1E' }}>
                카카오페이
              </span>
            </label>
            <button
              type="button"
              onClick={() => show('네이버페이는 추후 구현 예정입니다.', { variant: 'info' })}
              className="flex-1 flex items-center gap-2 border-2 border-gray-200 rounded-lg px-3 py-2.5 opacity-60 hover:opacity-80 transition"
            >
              <span className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
              <span className="inline-block h-6 px-2 rounded text-xs font-bold leading-6"
                style={{ backgroundColor: '#03C75A', color: '#fff' }}>
                네이버페이
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* 결제 요약 + 결제 버튼 */}
      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>상품 합계</span>
              <span>{formatPrice(productTotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>배송비</span>
              <span>{shippingFee ? formatPrice(shippingFee.totalFee) : '-'}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-2 mt-2">
              <span>총 결제 금액</span>
              <span className="text-orange-500">{formatPrice(totalPayment)}</span>
            </div>
          </div>
          {!canSubmit && !submitting && submitBlockers.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 space-y-1">
              {submitBlockers.map((reason, idx) => (
                <div key={`${reason}-${idx}`}>&#8226; {reason}</div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="mt-4 w-full h-12 rounded-lg bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '결제 준비 중...' : `${formatPrice(totalPayment)} 결제하기`}
          </button>
        </div>
      </section>

      {/* Mobile payment fallback modal */}
      {paymentFallbackPcUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm text-center">
            <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-yellow-100 mb-4">
              <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">모바일 결제 연결 실패</h3>
            <p className="text-sm text-gray-600 mb-4">
              카카오페이 앱 연결에 실패했습니다.<br />
              QR 코드 결제로 진행해 주세요.
            </p>
            <button
              type="button"
              className="w-full h-11 rounded-lg text-gray-900 font-semibold"
              style={{ backgroundColor: '#FEE500' }}
              onClick={() => { window.location.href = paymentFallbackPcUrl; }}
            >
              QR 코드 결제
            </button>
            <button
              type="button"
              className="mt-2 w-full h-10 rounded-lg bg-gray-100 text-gray-600 text-sm hover:bg-gray-200"
              onClick={() => setPaymentFallbackPcUrl(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
      <CourierBottomNav />
    </main>
  );
}
