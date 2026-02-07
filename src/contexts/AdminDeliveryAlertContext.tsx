import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSnackbar } from '../components/snackbar';
import { safeErrorLog } from '../utils/environment';
import { USE_MOCKS } from '../config';
import { acceptAdminDelivery, getAdminDeliveries, getServerTime, updateAdminDeliveryStatus } from '../utils/api';

type DeliveryAlertPayload = {
  orderId: number;
  reservationIds: number[];
  reservationCount: number;
  buyerName: string;
  productSummary: string;
  deliveryDate: string;
  deliveryHour: number;
  deliveryMinute: number;
  type: 'paid' | 'upcoming';
  reservationItems: { id: number; productName: string; quantity: number }[];
  totalAmount: number;
  phone: string;
  address1: string;
  address2: string;
  distanceKm: number;
  deliveryFee: number;
};

const AdminDeliveryAlertContext = createContext({});

export const AdminDeliveryAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<DeliveryAlertPayload[]>([]);
  const [estimatedMap, setEstimatedMap] = useState<Record<number, number>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const paidNotifiedRef = useRef<Set<number>>(new Set());
  const upcomingNotifiedRef = useRef<Set<number>>(new Set());
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const formatKstDate = (ms: number) =>
    new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  const parseAlertPayload = (data: any, type: 'paid' | 'upcoming'): DeliveryAlertPayload => ({
    orderId: Number(data.order_id ?? data.id ?? 0),
    reservationIds: Array.isArray(data.reservation_ids) ? data.reservation_ids.map((id: any) => Number(id)) : [],
    reservationCount: Number(data.reservation_count || 0),
    buyerName: String(data.buyer_name || ''),
    productSummary: String(data.product_summary || ''),
    deliveryDate: String(data.delivery_date || ''),
    deliveryHour: Number(data.delivery_hour || 0),
    deliveryMinute: Number(data.delivery_minute ?? data.deliveryMinute ?? 0),
    type,
    reservationItems: Array.isArray(data.reservation_items)
      ? data.reservation_items.map((item: any) => ({
          id: Number(item.id ?? 0),
          productName: String(item.product_name ?? item.productName ?? ''),
          quantity: Number(item.quantity ?? 0),
        }))
      : [],
    totalAmount: Number(data.total_amount ?? data.totalAmount ?? 0),
    phone: String(data.phone || ''),
    address1: String(data.address1 || ''),
    address2: String(data.address2 || ''),
    distanceKm: Number(data.distance_km ?? data.distanceKm ?? 0),
    deliveryFee: Number(data.delivery_fee ?? data.deliveryFee ?? 0),
  });

  const pushAlert = (payload: DeliveryAlertPayload) => {
    if (payload.type === 'upcoming') {
      if (upcomingNotifiedRef.current.has(payload.orderId)) return;
      upcomingNotifiedRef.current.add(payload.orderId);
    } else {
      if (paidNotifiedRef.current.has(payload.orderId)) return;
      paidNotifiedRef.current.add(payload.orderId);
    }
    setAlerts(prev => [...prev, payload]);
    playAlertSound();
  };

  const removeAlert = (orderId: number) => {
    setAlerts(prev => prev.filter(a => a.orderId !== orderId));
  };

  const playAlertSound = () => {
    try {
      if (!alertAudioRef.current) {
        alertAudioRef.current = new Audio('/sounds/discord-call-sound_tvxg95l.mp3');
        alertAudioRef.current.loop = true;
      }
      if (alertAudioRef.current.paused) {
        alertAudioRef.current.currentTime = 0;
        alertAudioRef.current.play().catch(() => {
          // autoplay restrictions
        });
      }
    } catch (e) {
      safeErrorLog(e, 'AdminDeliveryAlertProvider - playAlertSound');
    }
  };

  const stopAlertSound = () => {
    if (!alertAudioRef.current) return;
    alertAudioRef.current.pause();
    alertAudioRef.current.currentTime = 0;
  };

  useEffect(() => {
    if (alerts.length > 0) {
      playAlertSound();
    } else {
      stopAlertSound();
    }
    return () => stopAlertSound();
  }, [alerts.length]);

  useEffect(() => {
    if (USE_MOCKS) return;
    const isAdminPage = location.pathname.startsWith('/admin');
    const isAdminAuthPage = location.pathname === '/admin/login' || location.pathname === '/admin/register';
    if (!isAdminPage || isAdminAuthPage) return;

    paidNotifiedRef.current.clear();
    upcomingNotifiedRef.current.clear();

    const apiBase = process.env.REACT_APP_API_BASE || '';
    const connect = () => {
      if (sourceRef.current) {
        sourceRef.current.close();
      }
      const source = new EventSource(`${apiBase}/api/admin/deliveries/stream`, { withCredentials: true } as any);
      sourceRef.current = source;

      source.addEventListener('delivery_paid', event => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          pushAlert(parseAlertPayload(data, 'paid'));
        } catch (e) {
          safeErrorLog(e, 'AdminDeliveryAlertProvider - parse event');
        }
      });

      source.onerror = (e) => {
        safeErrorLog(e, 'AdminDeliveryAlertProvider - SSE error');
        source.close();
        sourceRef.current = null;
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 3000);
        }
      };
    };
    connect();

    const startPolling = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const serverMs = await getServerTime();
          const today = formatKstDate(serverMs);
          const res = await getAdminDeliveries(today);
          if (!res.ok) return;
          const data = await res.json();
          const list = Array.isArray(data?.response) ? data.response : [];
          const paidCandidates = list.filter((r: any) => String(r.status || '') === 'PAID');
          paidCandidates.forEach((r: any) => {
            pushAlert(parseAlertPayload(r, 'paid'));
          });

          const nowMs = serverMs;
          const upcomingTargets = list.filter((r: any) => {
            const status = String(r.status || '');
            if (status !== 'PAID' && status !== 'OUT_FOR_DELIVERY') return false;
            const date = String(r.delivery_date || '');
            const hour = Number(r.delivery_hour || 0);
            const minute = Number(r.delivery_minute ?? r.deliveryMinute ?? 0);
            if (!date || !hour) return false;
            const targetMs = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`).getTime();
            const diff = targetMs - nowMs;
            return diff <= 30 * 60 * 1000 && diff > 0;
          });
          upcomingTargets.forEach((r: any) => {
            pushAlert(parseAlertPayload(r, 'upcoming'));
          });
        } catch (err) {
          safeErrorLog(err, 'AdminDeliveryAlertProvider - poll');
        }
      }, 15000);
    };
    startPolling();

    return () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [location.pathname]);

  const handleReject = async (orderId: number) => {
    try {
      const res = await updateAdminDeliveryStatus(orderId, 'canceled');
      if (res.ok) {
        snackbar.show(`주문 #${orderId} 거부되었습니다.`, { variant: 'info' });
      } else {
        snackbar.show('주문 거부에 실패했습니다.', { variant: 'error' });
      }
    } catch (e) {
      safeErrorLog(e, 'AdminDeliveryAlertProvider - reject');
      snackbar.show('주문 거부 중 오류가 발생했습니다.', { variant: 'error' });
    }
    removeAlert(orderId);
  };

  const getEstimated = (orderId: number) => estimatedMap[orderId] ?? 40;
  const setEstimated = (orderId: number, min: number) =>
    setEstimatedMap(prev => ({ ...prev, [orderId]: Math.max(10, Math.min(120, min)) }));

  const handleAccept = async (orderId: number) => {
    try {
      const res = await acceptAdminDelivery(orderId, getEstimated(orderId));
      if (res.ok) {
        snackbar.show(`주문 #${orderId} 접수 완료 (${getEstimated(orderId)}분)`, { variant: 'success' });
      } else {
        snackbar.show('주문 접수에 실패했습니다.', { variant: 'error' });
      }
    } catch (e) {
      safeErrorLog(e, 'AdminDeliveryAlertProvider - accept');
      snackbar.show('주문 접수 중 오류가 발생했습니다.', { variant: 'error' });
    }
    removeAlert(orderId);
  };

  const KRW = (price: number) =>
    price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

  const modal = useMemo(() => {
    if (alerts.length === 0) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white w-full max-w-md rounded-lg shadow-lg p-5 relative">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              배달 주문 알림 ({alerts.length}건)
            </h2>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              onClick={() => { paidNotifiedRef.current.clear(); upcomingNotifiedRef.current.clear(); setAlerts([]); }}
              aria-label="알림 모두 닫기"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto space-y-3">
            {alerts.map(a => {
              const itemCount = a.reservationItems.length;
              return (
                <div key={a.orderId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  {a.type === 'upcoming' ? (
                    <>
                      <div className="text-sm font-semibold text-orange-600 mb-2">배달 예정 알림</div>
                      <p className="text-sm text-gray-700 mb-3">
                        {a.buyerName}님의 배달이 30분 이내로 예정되어 있습니다.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-green-700 mb-2">결제 완료</div>
                      <div className="text-sm text-gray-800 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-500">주문번호</span>
                          <span className="font-medium">#{a.orderId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">성명</span>
                          <span className="font-medium">{a.buyerName}</span>
                        </div>
                        {a.phone && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">연락처</span>
                            <span className="font-medium">{a.phone}</span>
                          </div>
                        )}
                        {a.address1 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">주소</span>
                            <span className="font-medium text-right max-w-[60%]">{a.address1}{a.address2 ? ` ${a.address2}` : ''}</span>
                          </div>
                        )}
                      </div>
                      {a.reservationItems.length > 0 && (
                        <div className="mt-2 bg-white rounded border border-gray-100 p-2 text-sm text-gray-700">
                          {a.reservationItems.map(item => (
                            <div key={item.id} className="flex justify-between py-0.5">
                              <span>{item.productName}</span>
                              <span className="text-gray-500">{item.quantity}개</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 text-sm text-gray-700">
                        {itemCount > 0 ? `메뉴 ${itemCount}종` : a.productSummary}{' '}
                        총 <span className="font-semibold">{KRW(a.totalAmount)}</span>
                        {a.deliveryFee > 0 && (
                          <span className="text-gray-500 ml-1">(배달비 {KRW(a.deliveryFee)}, {a.distanceKm.toFixed(1)}km)</span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-3">
                        <span className="text-sm text-gray-600">도착 예정 시간</span>
                        <button
                          type="button"
                          className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 font-bold hover:bg-gray-300"
                          onClick={() => setEstimated(a.orderId, getEstimated(a.orderId) - 10)}
                        >
                          −
                        </button>
                        <span className="text-sm font-semibold w-12 text-center">{getEstimated(a.orderId)}분</span>
                        <button
                          type="button"
                          className="w-8 h-8 rounded-full bg-gray-200 text-gray-700 font-bold hover:bg-gray-300"
                          onClick={() => setEstimated(a.orderId, getEstimated(a.orderId) + 10)}
                        >
                          +
                        </button>
                      </div>
                    </>
                  )}
                  <div className="mt-3 flex gap-2">
                    {a.type === 'paid' ? (
                      <>
                        <button
                          type="button"
                          className="flex-1 h-9 rounded bg-red-500 text-white text-sm font-medium hover:bg-red-600"
                          onClick={() => handleReject(a.orderId)}
                        >
                          거부
                        </button>
                        <button
                          type="button"
                          className="flex-1 h-9 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700"
                          onClick={() => handleAccept(a.orderId)}
                        >
                          접수
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="flex-1 h-9 rounded bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
                        onClick={() => removeAlert(a.orderId)}
                      >
                        닫기
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }, [alerts, estimatedMap, navigate, location.pathname]);

  return (
    <AdminDeliveryAlertContext.Provider value={{}}>
      {children}
      {modal}
    </AdminDeliveryAlertContext.Provider>
  );
};
