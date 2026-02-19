import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { theme } from '../../brand';
import BottomNav from '../../components/BottomNav';
import {
  getReservations,
  getDeliveryInfo,
  getDeliveryConfig,
  getDeliveryFeeEstimate,
  saveDeliveryInfo,
  createDeliveryPaymentReady,
  cancelDeliveryPayment,
  getServerTime,
  type DeliveryInfo,
  type DeliveryConfig,
} from '../../utils/api';

const KRW = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  enabled: true,
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

const PAYMENT_READY = true;

type DeliveryOrderItem = {
  id: number;
  name: string;
  quantity: number;
  price: number;
};

type DeliveryOrderRow = {
  id: number;
  displayCode: string;
  date: string;
  status: 'pending' | 'picked' | 'canceled';
  items: DeliveryOrderItem[];
  deliveryAvailable: boolean;
};

const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 3;

type DrumPickerProps = {
  slots: { hour: number; minute: number }[];
  selectedSlot: { hour: number; minute: number } | null;
  onSelectSlot: (slot: { hour: number; minute: number }) => void;
};

function DrumPicker({ slots, selectedSlot, onSelectSlot }: DrumPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const formatRange = (slot: { hour: number; minute: number }) => {
    const endTotal = slot.hour * 60 + slot.minute;
    const startTotal = endTotal - 60;
    const sH = Math.floor(startTotal / 60);
    const sM = startTotal % 60;
    return `${sH}:${String(sM).padStart(2, '0')} ~ ${slot.hour}:${String(slot.minute).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (slots.length === 0) return;
    const index = selectedSlot
      ? slots.findIndex(s => s.hour === selectedSlot.hour && s.minute === selectedSlot.minute)
      : 0;
    const finalIndex = index >= 0 ? index : 0;
    setSelectedIndex(finalIndex);
    if (pickerRef.current) {
      pickerRef.current.scrollTop = finalIndex * ITEM_HEIGHT;
    }
  }, [slots, selectedSlot]);

  const handleScroll = () => {
    if (!pickerRef.current || slots.length === 0) return;
    const scrollTop = pickerRef.current.scrollTop;
    const index = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(slots.length - 1, index));
    setSelectedIndex(clampedIndex);
    onSelectSlot(slots[clampedIndex]);
  };

  if (slots.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        선택 가능한 시간이 없습니다
      </div>
    );
  }

  return (
    <div className="relative">
      <style>
        {`
          .drum-picker::-webkit-scrollbar {
            display: none;
          }
        `}
      </style>
      {/* 상단 마스크 */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" />

      {/* 중앙 선택 영역 하이라이트 */}
      <div
        className="absolute left-0 right-0 border-t border-b border-green-500 pointer-events-none z-10"
        style={{
          top: ITEM_HEIGHT,
          height: ITEM_HEIGHT
        }}
      />

      {/* 스크롤 컨테이너 */}
      <div
        ref={pickerRef}
        onScroll={handleScroll}
        className="drum-picker"
        style={{
          height: ITEM_HEIGHT * VISIBLE_ITEMS,
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {/* 상단 빈 공간 */}
        <div style={{ height: ITEM_HEIGHT }} />

        {slots.map((slot, i) => (
          <div
            key={`${slot.hour}-${slot.minute}`}
            style={{
              height: ITEM_HEIGHT,
              scrollSnapAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            className={`text-lg font-medium transition-all ${
              selectedIndex === i ? 'text-green-700 scale-105' : 'text-gray-400'
            }`}
          >
            {formatRange(slot)}
          </div>
        ))}

        {/* 하단 빈 공간 */}
        <div style={{ height: ITEM_HEIGHT }} />
      </div>

      {/* 하단 마스크 */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none z-10" />
    </div>
  );
}

export default function DeliveryPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null);
  const [today, setToday] = useState<string>('');
  const [orders, setOrders] = useState<DeliveryOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({
    phone: '',
    postalCode: '',
    address1: '',
    address2: '',
    latitude: undefined,
    longitude: undefined,
  });
  const [deliveryHour, setDeliveryHour] = useState<number>(12);
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [deliveryType, setDeliveryType] = useState<'normal' | 'scheduled'>('normal');
  const [scheduledSlot, setScheduledSlot] = useState<{ hour: number; minute: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null);
  const [deliveryDistanceError, setDeliveryDistanceError] = useState<string | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [paymentFallbackPcUrl, setPaymentFallbackPcUrl] = useState<string | null>(null);

  useEffect(() => {
    if (deliveryInfo.phone && /\\D/.test(deliveryInfo.phone)) {
      setDeliveryInfo(prev => ({ ...prev, phone: prev.phone.replace(/\\D/g, '') }));
    }
  }, [deliveryInfo.phone]);
  const idempotencyKeyRef = useRef<string | null>(null);
  const buildIdempotencyKey = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const getKstNow = () => new Date(Date.now() + serverTimeOffsetMs);

  const totalPrice = (o: DeliveryOrderRow) =>
    o.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const selectedOrders = useMemo(
    () => orders.filter(order => selectedCodes.includes(order.displayCode)),
    [orders, selectedCodes]
  );

  const selectedAmount = useMemo(
    () => selectedOrders.reduce((sum, order) => sum + totalPrice(order), 0),
    [selectedOrders]
  );
  const config = deliveryConfig || DEFAULT_DELIVERY_CONFIG;
  const deliveryEnabled = config.enabled !== false;
  const appliedFee = deliveryFee;
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
  const scheduledCutoffTotal = (config.endHour * 60 + config.endMinute) - 60;
  const isAfterScheduledCutoff = useMemo(() => {
    const now = getKstNow();
    return now.getHours() * 60 + now.getMinutes() >= scheduledCutoffTotal;
  }, [serverTimeOffsetMs, scheduledCutoffTotal]);
  const scheduledSlots = useMemo(() => {
    const startTotal = config.startHour * 60 + config.startMinute;
    const endTotal = config.endHour * 60 + config.endMinute;
    const slots: { hour: number; minute: number }[] = [];
    for (let t = startTotal + 60; t <= endTotal; t += 60) {
      slots.push({ hour: Math.floor(t / 60), minute: t % 60 });
    }
    return slots;
  }, [config.startHour, config.startMinute, config.endHour, config.endMinute]);
  const isSlotAvailable = (slot: { hour: number; minute: number }) => {
    const now = getKstNow();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return slot.hour * 60 + slot.minute - currentMinutes >= 60;
  };
  const canSubmit = PAYMENT_READY
    && deliveryEnabled
    && selectedCodes.length > 0
    && deliveryHour >= 0
    && !deliverySubmitting
    && !isGeocoding
    && deliveryDistanceKm !== null
    && deliveryFee !== null
    && deliveryCoords !== null
    && !deliveryDistanceError
    && selectedAmount >= config.minAmount
    && !isAfterDeadline
    && !isBeforeStart
    && (deliveryType === 'normal' || scheduledSlot !== null);
  const submitBlockers = useMemo(() => {
    const reasons: string[] = [];
    if (!deliveryEnabled) reasons.push('현재 배달 주문이 중단되어 있습니다.');
    if (selectedCodes.length === 0) reasons.push('배달할 예약을 선택해주세요.');
    if (!deliveryInfo.phone) reasons.push('연락처를 입력해주세요.');
    if (!deliveryInfo.postalCode || !deliveryInfo.address1) reasons.push('주소를 입력해주세요.');
    if (deliveryDistanceError) reasons.push(deliveryDistanceError);
    if (!deliveryCoords || deliveryDistanceKm === null || deliveryFee === null) {
      reasons.push('주소 좌표/배달비 계산이 필요합니다.');
    }
    if (selectedAmount < config.minAmount) {
      reasons.push(`최소 주문 금액 ${config.minAmount.toLocaleString()}원 이상이어야 합니다.`);
    }
    if (isBeforeStart || isAfterDeadline) {
      const startLabel = config.startMinute ? `${config.startHour}시 ${config.startMinute}분` : `${config.startHour}시`;
      const endLabel = config.endMinute ? `${config.endHour}시 ${config.endMinute}분` : `${config.endHour}시`;
      reasons.push(`배달 주문 가능 시간은 ${startLabel} ~ ${endLabel}입니다.`);
    }
    if (isGeocoding) reasons.push('주소 좌표를 확인 중입니다.');
    if (deliverySubmitting) reasons.push('결제 준비 중입니다.');
    if (deliveryType === 'scheduled' && scheduledSlot === null) reasons.push('예약배달 시간을 선택해주세요.');
    return reasons;
  }, [
    deliveryEnabled,
    selectedCodes.length,
    deliveryInfo.phone,
    deliveryInfo.postalCode,
    deliveryInfo.address1,
    deliveryDistanceError,
    deliveryCoords,
    deliveryDistanceKm,
    deliveryFee,
    selectedAmount,
    config.minAmount,
    isBeforeStart,
    isAfterDeadline,
    config.startHour,
    config.startMinute,
    config.endHour,
    config.endMinute,
    isGeocoding,
    deliverySubmitting,
  ]);

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

  const estimateDeliveryFee = async (address: string) => {
    if (!address) return;
    setDeliveryDistanceError(null);
    setDeliveryDistanceKm(null);
    setDeliveryFee(null);
    setDeliveryCoords(null);
    try {
      setIsGeocoding(true);
      await ensureKakaoMapsLoaded();
      const kakao = (window as any)?.kakao;
      if (!kakao?.maps?.services) {
        setDeliveryDistanceError('카카오맵 로드에 실패했습니다. 관리자에게 문의해주세요.');
        show('카카오맵 로드에 실패했습니다. 관리자에게 문의해주세요.', { variant: 'error' });
        return;
      }
      const geocoder = new kakao.maps.services.Geocoder();
      await new Promise<void>(resolve => {
        geocoder.addressSearch(address, async (result: any, status: any) => {
          if (status === kakao.maps.services.Status.OK && result?.[0]) {
            const lat = Number(result[0].y);
            const lng = Number(result[0].x);
            setDeliveryCoords({ lat, lng });
            setDeliveryInfo(prev => ({ ...prev, latitude: lat, longitude: lng }));
            const estimate = await getDeliveryFeeEstimate(lat, lng);
            if (!estimate) {
              setDeliveryDistanceError('배달비 계산에 실패했습니다.');
              resolve();
              return;
            }
            setDeliveryDistanceKm(estimate.distanceKm);
            setDeliveryFee(estimate.deliveryFee);
            resolve();
            return;
          }
          setDeliveryDistanceError('주소 좌표를 찾을 수 없습니다.');
          show('주소 좌표를 찾을 수 없습니다.', { variant: 'error' });
          resolve();
        });
      });
    } catch (e) {
      safeErrorLog(e, 'DeliveryPage - estimateDeliveryFee');
      setDeliveryDistanceError(getSafeErrorMessage(e, '배달비 계산에 실패했습니다.'));
      show(getSafeErrorMessage(e, '배달비 계산에 실패했습니다.'), { variant: 'error' });
    } finally {
      setIsGeocoding(false);
    }
  };

  const openPostcode = () => {
    const kakaoPostcode = (window as any)?.kakao?.Postcode;
    if (!kakaoPostcode) {
      show('주소 검색을 불러올 수 없습니다.', { variant: 'error' });
      return;
    }
    new kakaoPostcode({
      oncomplete: async (data: any) => {
        const roadAddr = data.roadAddress || data.address || '';
        const postalCode = data.zonecode || '';
        const buildingName = data.buildingName || '';
        setDeliveryInfo(prev => ({
          ...prev,
          postalCode,
          address1: roadAddr,
          address2: buildingName,
        }));
        await estimateDeliveryFee(roadAddr);
      },
    }).open();
  };

  useEffect(() => {
    const pendingOrderCode = localStorage.getItem('pendingDeliveryOrderCode');
    if (pendingOrderCode) {
      localStorage.removeItem('pendingDeliveryOrderCode');
      cancelDeliveryPayment(pendingOrderCode).catch(() => { });
    }
  }, []);

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
          const isPending = rawStatus === 'PENDING';
          const deliveryStatus = String(r.delivery?.status ?? r.delivery_status ?? r.deliveryStatus ?? '').toUpperCase();
          const canReorderDelivery = !deliveryStatus || deliveryStatus === 'CANCELED' || deliveryStatus === 'FAILED';
          return isPending && canReorderDelivery && String(r.order_date || '') === today;
        }).map((r: any) => {
          const qty = Math.max(1, Number(r.quantity ?? 1));
          const amt = Number(r.amount ?? 0);
          const unit = qty > 0 ? amt / qty : amt;
          const deliveryAvailable = typeof r.delivery_available === 'boolean'
            ? Boolean(r.delivery_available)
            : (typeof r.deliveryAvailable === 'boolean' ? Boolean(r.deliveryAvailable) : true);
          return {
            id: r.id,
            displayCode: String(r.display_code ?? r.displayCode ?? r.id),
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
          latitude: info.latitude,
          longitude: info.longitude,
        });
        if (info.latitude != null && info.longitude != null) {
          setDeliveryCoords({ lat: info.latitude, lng: info.longitude });
          const estimate = await getDeliveryFeeEstimate(info.latitude, info.longitude);
          if (estimate) {
            setDeliveryDistanceKm(estimate.distanceKm);
            setDeliveryFee(estimate.deliveryFee);
          }
        } else if (info.address1) {
          await estimateDeliveryFee(info.address1);
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
    setSelectedCodes(prev => {
      const exists = prev.includes(order.displayCode);
      if (exists) return prev.filter(code => code !== order.displayCode);
      return [...prev, order.displayCode];
    });
  };

  const handleSubmit = async () => {
    if (selectedCodes.length === 0) {
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
    if (!deliveryCoords) {
      show('주소 좌표를 확인해주세요.', { variant: 'error' });
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
        const idempotencyKey = idempotencyKeyRef.current ?? buildIdempotencyKey();
        idempotencyKeyRef.current = idempotencyKey;
        const res = await createDeliveryPaymentReady({
          reservationCodes: selectedOrders.map(o => o.displayCode),
          deliveryHour: currentHour,
          deliveryMinute: currentMinute,
          phone: deliveryInfo.phone,
          postalCode: deliveryInfo.postalCode,
          address1: deliveryInfo.address1,
          address2: deliveryInfo.address2 || '',
          latitude: deliveryCoords.lat,
          longitude: deliveryCoords.lng,
          scheduledDeliveryHour: deliveryType === 'scheduled' ? scheduledSlot?.hour ?? null : null,
          scheduledDeliveryMinute: deliveryType === 'scheduled' ? scheduledSlot?.minute ?? null : null,
          idempotencyKey,
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
        const orderCode = data.orderCode || data.order_code || data.orderId || data.order_id;
        if (orderCode) localStorage.setItem('pendingDeliveryOrderCode', String(orderCode));
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const mobileUrl = data.mobileRedirectUrl || data.mobile_redirect_url;
        const pcUrl = data.redirectUrl || data.redirect_url;

        const isAllowedPaymentUrl = (url: string): boolean => {
          try {
            const { hostname } = new URL(url);
            return hostname === 'online-pay.kakao.com' || hostname === 'online-payment.kakaopay.com' || hostname === 'mockup-pg-web.kakao.com';
          } catch {
            return false;
          }
        };

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
      } else {
        show('모의 결제로 처리되었습니다.', { variant: 'info' });
      }
    } catch (e) {
      safeErrorLog(e, 'DeliveryPage - handleSubmit');
      show(getSafeErrorMessage(e, '배달 결제 준비 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setDeliverySubmitting(false);
      idempotencyKeyRef.current = null;
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

      {!deliveryEnabled && (
        <section className="max-w-4xl mx-auto mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          현재 배달 주문이 중단되어 있습니다.
        </section>
      )}

      <section className="max-w-4xl mx-auto mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
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
              onInput={e => {
                const target = e.currentTarget;
                const onlyDigits = target.value.replace(/\\D/g, '');
                if (onlyDigits !== target.value) {
                  setDeliveryInfo(prev => ({ ...prev, phone: onlyDigits }));
                }
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
          <div>배달비 {appliedFee === null ? '배달 불가' : `${appliedFee.toLocaleString()}원`}</div>
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
        <h2 className="text-base font-semibold text-gray-800 mb-3">도착 예정 시간</h2>

        {/* 세그먼트 토글 */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setDeliveryType('normal'); setScheduledSlot(null); }}
            className={`flex-1 h-11 rounded-lg text-sm font-medium transition-all ${
              deliveryType === 'normal'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            바로배달
          </button>
          <button
            type="button"
            onClick={() => {
              if (isAfterScheduledCutoff) return;
              setDeliveryType('scheduled');
              const availableSlots = scheduledSlots.filter(isSlotAvailable);
              if (availableSlots.length > 0 && !scheduledSlot) {
                setScheduledSlot(availableSlots[0]);
              }
            }}
            disabled={isAfterScheduledCutoff}
            className={`flex-1 h-11 rounded-lg text-sm font-medium transition-all ${
              deliveryType === 'scheduled'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            예약배달
          </button>
        </div>

        {/* Drum Picker (예약배달 선택 시에만 표시) */}
        {deliveryType === 'scheduled' && (
          <DrumPicker
            slots={scheduledSlots.filter(isSlotAvailable)}
            selectedSlot={scheduledSlot}
            onSelectSlot={setScheduledSlot}
          />
        )}

        {isAfterScheduledCutoff && (
          <div className="text-xs text-red-600 mt-2">
            예약배달은 {Math.floor(scheduledCutoffTotal / 60)}시{scheduledCutoffTotal % 60 > 0 ? ` ${scheduledCutoffTotal % 60}분` : ''}까지만 접수 가능합니다.
          </div>
        )}
      </section>

      <section className="max-w-4xl mx-auto mt-4 bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">배달 대상 선택</h2>
          <div className="text-xs text-gray-500">선택 {selectedCodes.length}건</div>
        </div>
        {loading && <div className="text-sm text-gray-500">불러오는 중…</div>}
        {!loading && orders.length === 0 && (
          <div className="text-sm text-gray-500">오늘 배달 가능한 예약이 없습니다.</div>
        )}
        <div className="space-y-3">
          {[...orders].sort((a, b) => (a.deliveryAvailable === b.deliveryAvailable ? 0 : a.deliveryAvailable ? -1 : 1)).map(order => (
            <label
              key={order.displayCode}
              className={`flex items-center gap-3 border rounded-xl p-4 ${order.deliveryAvailable ? 'cursor-pointer hover:bg-gray-50' : 'opacity-60 bg-gray-50'}`}
            >
              <input
                type="checkbox"
                checked={selectedCodes.includes(order.displayCode)}
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
            <span>{appliedFee === null ? '배달 불가' : KRW(appliedFee)}</span>
          </div>
          <div className="flex items-center justify-between font-semibold text-gray-900">
            <span>총 결제 금액</span>
            <span>
              {(() => {
                if (appliedFee === null) return '배달 불가';
                return KRW(selectedAmount + appliedFee);
              })()}
            </span>
          </div>
          {selectedAmount < config.minAmount && (
            <div className="text-xs text-red-600">
              최소 주문 금액 {config.minAmount.toLocaleString()}원 이상부터 배달 가능합니다.
            </div>
          )}
          <div className="text-xs text-red-600">배달 가능 거리({config.maxDistanceKm}km) 내라도, 강이나 행정구역 경계를 넘어가는 경우 배달이 취소될 수 있습니다.</div>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-11 rounded bg-green-600 text-white font-medium disabled:opacity-60"
          >
            배달 결제하기
          </button>
          {!canSubmit && submitBlockers.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 space-y-1">
              {submitBlockers.map((reason, idx) => (
                <div key={`${reason}-${idx}`}>• {reason}</div>
              ))}
            </div>
          )}
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
      <BottomNav />
    </main>
  );
}
