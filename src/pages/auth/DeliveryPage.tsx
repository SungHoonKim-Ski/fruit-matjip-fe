import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { theme } from '../../brand';
import {
  getReservations,
  getDeliveryInfo,
  getDeliveryConfig,
  saveDeliveryInfo,
  createDeliveryPaymentReady,
  getServerTime,
  type DeliveryInfo,
  type DeliveryConfig,
} from '../../utils/api';

const KRW = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  storeLat: 37.556504,
  storeLng: 126.8372613,
  maxDistanceKm: 3,
  feeDistanceKm: 1.5,
  minAmount: 15000,
  feeNear: 2900,
  feePer100m: 50,
  startHour: 12,
  startMinute: 0,
  endHour: 19,
  endMinute: 30,
};

const toRad = (value: number) => (value * Math.PI) / 180;
const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
};

const getDeliveryFee = (distanceKm: number | null, config: DeliveryConfig) => {
  if (distanceKm === null) return null;
  if (distanceKm <= config.feeDistanceKm) return config.feeNear;
  const extraKm = Math.max(0, distanceKm - config.feeDistanceKm);
  const extraUnits = Math.ceil(extraKm / 0.1);
  return config.feeNear + extraUnits * config.feePer100m;
};

const PAYMENT_READY = false;

type DeliveryOrderItem = {
  id: number;
  name: string;
  quantity: number;
  price: number;
};

type DeliveryOrderRow = {
  id: number;
  date: string;
  status: 'pending' | 'picked' | 'canceled';
  items: DeliveryOrderItem[];
  deliveryAvailable: boolean;
};

export default function DeliveryPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null);
  const [today, setToday] = useState<string>('');
  const [orders, setOrders] = useState<DeliveryOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({
    phone: '',
    postalCode: '',
    address1: '',
    address2: '',
  });
  const [deliveryHour, setDeliveryHour] = useState<number>(12);
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryDistanceError, setDeliveryDistanceError] = useState<string | null>(null);

  const getKstNow = () => new Date(Date.now() + serverTimeOffsetMs);

  const totalPrice = (o: DeliveryOrderRow) =>
    o.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const selectedOrders = useMemo(
    () => orders.filter(order => selectedIds.includes(order.id)),
    [orders, selectedIds]
  );

  const selectedAmount = useMemo(
    () => selectedOrders.reduce((sum, order) => sum + totalPrice(order), 0),
    [selectedOrders]
  );
  const config = deliveryConfig || DEFAULT_DELIVERY_CONFIG;
  const appliedFee = getDeliveryFee(deliveryDistanceKm, config);
  const isAfterDeadline = useMemo(() => {
    const now = getKstNow();
    const h = now.getHours();
    const m = now.getMinutes();
    return h > config.endHour || (h === config.endHour && m > config.endMinute);
  }, [serverTimeOffsetMs, config.endHour, config.endMinute]);
  const isBeforeStart = useMemo(() => {
    const now = getKstNow();
    const h = now.getHours();
    const m = now.getMinutes();
    return h < config.startHour || (h === config.startHour && m < config.startMinute);
  }, [serverTimeOffsetMs, config.startHour, config.startMinute]);
  const canSubmit = PAYMENT_READY
    && selectedIds.length > 0
    && deliveryHour >= 0
    && !deliverySubmitting
    && !isGeocoding
    && deliveryDistanceKm !== null
    && !deliveryDistanceError
    && selectedAmount >= config.minAmount
    && !isAfterDeadline
    && !isBeforeStart;

  const ensureKakaoMapsLoaded = () =>
    new Promise<void>((resolve, reject) => {
      const waitForServices = () => {
        const start = Date.now();
        const timer = setInterval(() => {
          const ready = (window as any)?.kakao?.maps?.services;
          if (ready) {
            clearInterval(timer);
            resolve();
            return;
          }
          if (Date.now() - start > 15000) {
            clearInterval(timer);
            reject(new Error('Kakao maps load timeout'));
          }
        }, 50);
      };

      const kakao = (window as any)?.kakao;
      if (kakao?.maps?.services) {
        resolve();
        return;
      }
      const appKey = process.env.REACT_APP_JS_KAKAO_KEY;
      if (!appKey) {
        reject(new Error('Kakao app key missing'));
        return;
      }
      const existing = document.querySelector('script[data-kakao-maps]');
      if (existing) {
        if ((window as any)?.kakao?.maps?.load) {
          (window as any).kakao.maps.load(() => {
            waitForServices();
          });
        } else {
          waitForServices();
        }
        return;
      }
      const script = document.createElement('script');
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-kakao-maps', 'true');
      script.onload = () => {
        const loader = (window as any)?.kakao?.maps?.load;
        if (loader) {
          loader(() => waitForServices());
        } else {
          waitForServices();
        }
      };
      script.onerror = () => reject(new Error('Kakao maps load failed'));
      document.head.appendChild(script);
    });

  const geocodeAddress = async (address: string) =>
    new Promise<void>(async (resolve) => {
      try {
        await ensureKakaoMapsLoaded();
        const kakao = (window as any)?.kakao;
        if (!kakao?.maps?.services) {
          setDeliveryDistanceKm(null);
          setDeliveryDistanceError('카카오맵 로드에 실패했습니다. 관리자에게 문의해주세요.');
          show('카카오맵 로드에 실패했습니다. 관리자에게 문의해주세요.', { variant: 'error' });
          resolve();
          return;
        }
        const geocoder = new kakao.maps.services.Geocoder();
        geocoder.addressSearch(address, (result: any, status: any) => {
          if (status === kakao.maps.services.Status.OK && result?.[0]) {
            const lat = Number(result[0].y);
            const lng = Number(result[0].x);
            const distanceKm = getDistanceKm(config.storeLat, config.storeLng, lat, lng);
            setDeliveryDistanceKm(distanceKm);
            if (distanceKm > config.maxDistanceKm) {
              const message = `배달 가능 거리(${config.maxDistanceKm}km)를 초과했습니다.`;
              setDeliveryDistanceError(message);
              show(message, { variant: 'error' });
            } else {
              setDeliveryDistanceError(null);
            }
          } else {
            setDeliveryDistanceKm(null);
            setDeliveryDistanceError('주소 좌표를 찾을 수 없습니다.');
            show('주소 좌표를 찾을 수 없습니다.', { variant: 'error' });
          }
          resolve();
        });
      } catch (e) {
        safeErrorLog(e, 'DeliveryPage - ensureKakaoMapsLoaded');
        setDeliveryDistanceKm(null);
        setDeliveryDistanceError('카카오맵 로드에 실패했습니다. 관리자에게 문의해주세요.');
        show('카카오맵 로드에 실패했습니다. 관리자에게 문의해주세요.', { variant: 'error' });
        resolve();
      }
    });

  const openPostcode = () => {
    const daumPostcode = (window as any)?.daum?.Postcode;
    if (!daumPostcode) {
      show('주소 검색을 불러올 수 없습니다.', { variant: 'error' });
      return;
    }
    new daumPostcode({
      oncomplete: async (data: any) => {
        const address = data.address || '';
        const postalCode = data.zonecode || '';
        setDeliveryInfo(prev => ({ ...prev, postalCode, address1: address }));
        setIsGeocoding(true);
        try {
          await geocodeAddress(address);
        } finally {
          setIsGeocoding(false);
        }
      },
    }).open();
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const serverMs = await getServerTime();
        const offset = serverMs - Date.now();
        if (alive) {
          setServerTimeOffsetMs(offset);
          const serverToday = new Date(Date.now() + offset)
            .toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
          setToday(serverToday);
          const now = new Date(Date.now() + offset);
          setDeliveryHour(now.getHours());
        }
      } catch (e) {
        safeErrorLog(e, 'DeliveryPage - getServerTime');
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!today) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (USE_MOCKS) {
          setOrders([]);
          return;
        }
        const res = await getReservations(today, today);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return;
          throw new Error('배달 예약 목록을 불러오지 못했습니다.');
        }
        const data = await res.json();
        const list = data && typeof data === 'object' && Array.isArray(data.response) ? data.response : data;
        if (!Array.isArray(list)) throw new Error('배달 데이터가 배열 형태가 아닙니다.');

        const eligible = list.filter((r: any) => {
          const rawStatus = String(r.status ?? '').toUpperCase();
          const isPending = rawStatus === 'PENDING' || rawStatus === 'pending';
          return isPending && !r.delivery && String(r.order_date || '') === today;
        }).map((r: any) => {
          const qty = Math.max(1, Number(r.quantity ?? 1));
          const amt = Number(r.amount ?? 0);
          const unit = qty > 0 ? amt / qty : amt;
          const deliveryAvailable = typeof r.delivery_available === 'boolean'
            ? Boolean(r.delivery_available)
            : (typeof r.deliveryAvailable === 'boolean' ? Boolean(r.deliveryAvailable) : true);
          return {
            id: r.id,
            date: r.order_date,
            status: 'pending' as const,
            items: [{
              id: r.id,
              name: r.product_name,
              quantity: qty,
              price: unit,
            }],
            deliveryAvailable,
          };
        });

        if (alive) {
          setOrders(eligible);
        }
      } catch (e: any) {
        safeErrorLog(e, 'DeliveryPage - loadOrders');
        show(getSafeErrorMessage(e, '배달 예약을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [today, show]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (USE_MOCKS) return;
      try {
        const info = await getDeliveryInfo();
        if (!alive || !info) return;
        setDeliveryInfo({
          phone: info.phone || '',
          postalCode: info.postalCode || '',
          address1: info.address1 || '',
          address2: info.address2 || '',
        });
        if (info.address1) {
          setIsGeocoding(true);
          try {
            await geocodeAddress(info.address1);
          } finally {
            setIsGeocoding(false);
          }
        }
      } catch (e) {
        safeErrorLog(e, 'DeliveryPage - getDeliveryInfo');
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (USE_MOCKS) return;
      try {
        const cfg = await getDeliveryConfig();
        if (!alive || !cfg) return;
        setDeliveryConfig(cfg);
      } catch (e) {
        safeErrorLog(e, 'DeliveryPage - getDeliveryConfig');
      }
    })();
    return () => { alive = false; };
  }, []);

  const toggleSelection = (order: DeliveryOrderRow) => {
    if (!order.deliveryAvailable) {
      show('배달 불가 상품입니다.', { variant: 'info' });
      return;
    }
    setSelectedIds(prev => {
      const exists = prev.includes(order.id);
      if (exists) return prev.filter(id => id !== order.id);
      return [...prev, order.id];
    });
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      show('배달할 예약을 선택해주세요.', { variant: 'info' });
      return;
    }
    const now = getKstNow();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const tooEarly = currentHour < config.startHour
      || (currentHour === config.startHour && currentMinute < config.startMinute);
    const tooLate = currentHour > config.endHour
      || (currentHour === config.endHour && currentMinute > config.endMinute);
    if (tooEarly || tooLate) {
      const startLabel = config.startMinute ? `${config.startHour}시 ${config.startMinute}분` : `${config.startHour}시`;
      const endLabel = config.endMinute ? `${config.endHour}시 ${config.endMinute}분` : `${config.endHour}시`;
      show(`배달 주문 가능 시간은 ${startLabel} ~ ${endLabel}입니다.`, { variant: 'error' });
      return;
    }
    if (isGeocoding) {
      show('주소 좌표 확인 중입니다. 잠시만 기다려 주세요.', { variant: 'info' });
      return;
    }
    if (deliveryDistanceKm === null || deliveryDistanceError) {
      show(deliveryDistanceError || '주소 좌표를 확인해주세요.', { variant: 'error' });
      return;
    }
    if (selectedAmount < config.minAmount) {
      show(`배달 주문은 ${config.minAmount.toLocaleString()}원 이상부터 가능합니다.`, { variant: 'error' });
      return;
    }

    setDeliverySubmitting(true);
    try {
      if (!USE_MOCKS) {
        await saveDeliveryInfo(deliveryInfo);
        setDeliveryHour(currentHour);
        const res = await createDeliveryPaymentReady({
          reservationIds: selectedIds,
          deliveryHour: currentHour,
          deliveryMinute: currentMinute,
          phone: deliveryInfo.phone,
          postalCode: deliveryInfo.postalCode,
          address1: deliveryInfo.address1,
          address2: deliveryInfo.address2 || '',
        });
        if (!res.ok) {
          if (res.status === 400) {
            const data = await res.json().catch(() => ({}));
            show(data.message || '배달 주문이 불가능합니다.', { variant: 'error' });
            return;
          }
          throw new Error('배달 결제 준비 실패');
        }
        const data = await res.json();
        const redirectUrl = data.redirectUrl || data.redirect_url;
        if (!redirectUrl) throw new Error('결제 URL이 없습니다.');
        window.location.href = redirectUrl;
      } else {
        show('모의 결제로 처리되었습니다.', { variant: 'info' });
      }
    } catch (e) {
      safeErrorLog(e, 'DeliveryPage - handleSubmit');
      show(getSafeErrorMessage(e, '배달 결제 준비 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setDeliverySubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 pt-16 pb-24">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="mx-auto w-full max-w-4xl h-14 flex items-center justify-between px-4">
          <button onClick={() => nav(-1)} className="text-sm text-gray-600 hover:text-gray-800">← 뒤로</button>
          <div className="font-bold text-gray-800">배달 주문</div>
          <div className="w-8" />
        </div>
      </header>

      <section className="max-w-4xl mx-auto mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="mb-2 text-xs font-semibold text-rose-600">개발중인 기능으로 현재 사용할 수 없습니다.</div>
        <div className="flex flex-col gap-1 text-sm text-emerald-900">
          <span>오늘({today || '오늘'}) 수령 상품만 배달 가능합니다.</span>
        </div>
        {(isAfterDeadline || isBeforeStart) && (
          <div className="mt-2 text-xs text-red-600">
            배달 주문 가능 시간은 {config.startMinute ? `${config.startHour}시 ${config.startMinute}분` : `${config.startHour}시`} ~ {config.endMinute ? `${config.endHour}시 ${config.endMinute}분` : `${config.endHour}시`}입니다.
          </div>
        )}
      </section>

      <section className="max-w-4xl mx-auto mt-4 bg-white rounded-lg shadow p-4">
        <h2 className="text-base font-semibold text-gray-800 mb-3">배달 정보</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-gray-500">연락처</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={deliveryInfo.phone}
              onChange={e => {
                const onlyDigits = e.target.value.replace(/\\D/g, '');
                setDeliveryInfo(prev => ({ ...prev, phone: onlyDigits }));
              }}
              onPaste={e => {
                e.preventDefault();
                const pasted = (e.clipboardData || (window as any).clipboardData).getData('text');
                const onlyDigits = pasted.replace(/\\D/g, '');
                setDeliveryInfo(prev => ({ ...prev, phone: onlyDigits }));
              }}
              className="mt-1 w-full h-10 border rounded px-2"
              placeholder="01012345678"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500">주소</label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={deliveryInfo.postalCode}
              readOnly
              className="h-10 w-24 border rounded px-2 bg-gray-50"
              placeholder="우편번호"
            />
            <button
              type="button"
              className="h-10 px-3 rounded border bg-white hover:bg-gray-50"
              onClick={openPostcode}
            >
              우편번호 검색
            </button>
          </div>
          <input
            type="text"
            value={deliveryInfo.address1}
            readOnly
            className="mt-2 w-full h-10 border rounded px-2 bg-gray-50"
            placeholder="기본 주소"
          />
          <input
            type="text"
            value={deliveryInfo.address2}
            onChange={e => setDeliveryInfo(prev => ({ ...prev, address2: e.target.value }))}
            className="mt-2 w-full h-10 border rounded px-2"
            placeholder="상세 주소"
          />
        </div>
        <div className="mt-3 text-xs text-gray-500 space-y-1">
          <div>배달비 {appliedFee ? `${appliedFee.toLocaleString()}원` : '배달 불가'}</div>
          <div>요금 기준: {config.feeDistanceKm}km까지 {config.feeNear.toLocaleString()}원 · 이후 100m당 {config.feePer100m.toLocaleString()}원 추가</div>
          <div>배달 가능 거리: {config.maxDistanceKm}km 이내</div>
          {isGeocoding && (
            <div className="text-xs text-blue-600">주소 좌표를 확인 중입니다...</div>
          )}
          {!isGeocoding && deliveryDistanceKm !== null && (
            <div>현재 거리: {deliveryDistanceKm.toFixed(2)}km</div>
          )}
        </div>
      </section>

      <section className="max-w-4xl mx-auto mt-4 bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">배달 대상 선택</h2>
          <div className="text-xs text-gray-500">선택 {selectedIds.length}건</div>
        </div>
        {loading && <div className="text-sm text-gray-500">불러오는 중…</div>}
        {!loading && orders.length === 0 && (
          <div className="text-sm text-gray-500">오늘 배달 가능한 예약이 없습니다.</div>
        )}
        <div className="space-y-3">
          {orders.map(order => (
            <label
              key={order.id}
              className={`flex items-center gap-3 border rounded-xl p-4 ${order.deliveryAvailable ? 'cursor-pointer hover:bg-gray-50' : 'opacity-60 bg-gray-50'}`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(order.id)}
                onChange={() => toggleSelection(order)}
                disabled={!order.deliveryAvailable}
                className="flex-shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-1">
                {order.items.map(item => (
                  <div key={item.id} className="text-sm text-gray-700 truncate">{item.name}</div>
                ))}
                {!order.deliveryAvailable && (
                  <div className="text-xs text-red-600">배달 불가상품</div>
                )}
              </div>
              <div className="flex-shrink-0 text-sm text-gray-500">
                {order.items.map(item => (
                  <div key={item.id}>× {item.quantity}</div>
                ))}
              </div>
              <div className="flex-shrink-0 text-sm font-semibold text-gray-900 whitespace-nowrap">{KRW(totalPrice(order))}</div>
            </label>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto mt-4 bg-white rounded-lg shadow p-4">
        <h2 className="text-base font-semibold text-gray-800 mb-3">결제 요약</h2>
        <div className="text-xs text-gray-700 space-y-2">
          <div className="flex items-center justify-between">
            <span>상품 금액</span>
            <span>{KRW(selectedAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>배달비</span>
            <span>{appliedFee ? KRW(appliedFee) : '배달 불가'}</span>
          </div>
          <div className="flex items-center justify-between font-semibold text-gray-900">
            <span>총 결제 금액</span>
            <span>
              {(() => {
                if (!appliedFee) return '배달 불가';
                return KRW(selectedAmount + appliedFee);
              })()}
            </span>
          </div>
          {selectedAmount < config.minAmount && (
            <div className="text-xs text-red-600">
              최소 주문 금액 {config.minAmount.toLocaleString()}원 이상부터 배달 가능합니다.
            </div>
          )}
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-11 rounded bg-green-600 text-white font-medium disabled:opacity-60"
          >
            {PAYMENT_READY ? '배달 결제하기' : '추후 지원 예정'}
          </button>
        </div>
      </section>

      <section className="max-w-4xl mx-auto mt-4 bg-white rounded-lg shadow p-4 text-xs text-gray-600 space-y-2">
        <div className="flex flex-wrap gap-3 text-gray-500">
          <Link to="/terms" className="hover:underline">이용약관</Link>
          <Link to="/privacy" className="hover:underline">개인정보처리방침</Link>
          <Link to="/refund" className="hover:underline">교환/환불 정책</Link>
        </div>
        <div className="space-y-1">
          <div className="font-semibold text-gray-800">{theme.companyName}</div>
          <div>대표자: {theme.contact.representative}</div>
          <div>사업자등록번호: {theme.contact.businessNumber}</div>
          {theme.contact.address && <div>사업장 주소: {theme.contact.address}</div>}
          <div>전화번호: {theme.contact.phone}</div>
        </div>
        <div className="text-gray-400">{theme.copyright}</div>
      </section>
    </main>
  );
}
