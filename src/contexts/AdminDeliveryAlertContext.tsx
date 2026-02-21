import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSnackbar } from '../components/snackbar';
import { safeErrorLog } from '../utils/environment';
import { USE_MOCKS } from '../config';
import { acceptAdminDelivery, getAdminDeliveries, getServerTime, updateAdminDeliveryStatus } from '../utils/api';
import { printReceipt, PrintReceiptData } from '../utils/printBridge';

type DeliveryAlertPayload = {
  orderId: number;
  displayCode: string;
  reservationIds: number[];
  reservationCount: number;
  buyerName: string;
  productSummary: string;
  deliveryDate: string;
  deliveryHour: number;
  deliveryMinute: number;
  type: 'paid' | 'upcoming';
  paidAt: string; // 영수증 출력용 결제 시각
  reservationItems: { id: number; productName: string; quantity: number; amount: number }[];
  totalAmount: number;
  phone: string;
  address1: string;
  address2: string;
  distanceKm: number;
  deliveryFee: number;
  scheduledDeliveryHour: number | null;
  scheduledDeliveryMinute: number | null;
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const fallbackPollTimerRef = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const sseConnectedRef = useRef(false);

  const formatKstDate = (ms: number) =>
    new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  // D-26020216-VWQPA → D-VWQPA (중간 날짜 영역 제거)
  const shortCode = (code: string) => {
    const parts = code.split('-');
    return parts.length === 3 ? `${parts[0]}-${parts[2]}` : code;
  };

  const parseAlertPayload = (data: any, type: 'paid' | 'upcoming'): DeliveryAlertPayload => ({
    orderId: Number(data.order_id ?? data.id ?? 0),
    displayCode: shortCode(String(data.display_code ?? data.displayCode ?? data.order_id ?? data.id ?? '')),
    reservationIds: Array.isArray(data.reservation_ids) ? data.reservation_ids.map((id: any) => Number(id)) : [],
    reservationCount: Number(data.reservation_count || 0),
    buyerName: String(data.buyer_name || ''),
    productSummary: String(data.product_summary || ''),
    deliveryDate: String(data.delivery_date || ''),
    deliveryHour: Number(data.delivery_hour || 0),
    deliveryMinute: Number(data.delivery_minute ?? data.deliveryMinute ?? 0),
    type,
    paidAt: String(data.paid_at ?? data.paidAt ?? ''),
    reservationItems: Array.isArray(data.reservation_items)
      ? data.reservation_items.map((item: any) => ({
          id: Number(item.id ?? 0),
          productName: String(item.product_name ?? item.productName ?? ''),
          quantity: Number(item.quantity ?? 0),
          amount: Number(item.amount ?? 0),
        }))
      : [],
    totalAmount: Number(data.total_amount ?? data.totalAmount ?? 0),
    phone: String(data.phone || ''),
    address1: String(data.address1 || ''),
    address2: String(data.address2 || ''),
    distanceKm: Number(data.distance_km ?? data.distanceKm ?? 0),
    deliveryFee: Number(data.delivery_fee ?? data.deliveryFee ?? 0),
    scheduledDeliveryHour: data.scheduled_delivery_hour ?? data.scheduledDeliveryHour ?? null,
    scheduledDeliveryMinute: data.scheduled_delivery_minute ?? data.scheduledDeliveryMinute ?? null,
  });

  // DeliveryAlertPayload → PrintReceiptData 변환 헬퍼
  // SSE 이벤트 데이터를 프린터 브릿지가 요구하는 형식으로 변환
  const buildPrintData = (payload: DeliveryAlertPayload): PrintReceiptData => ({
    orderId: payload.orderId,
    displayCode: payload.displayCode?.split('-').pop() || undefined,
    paidAt: payload.paidAt,
    deliveryHour: payload.deliveryHour,
    deliveryMinute: payload.deliveryMinute,
    buyerName: payload.buyerName,
    phone: payload.phone,
    items: payload.reservationItems.map(item => ({
      productName: item.productName,
      quantity: item.quantity,
      amount: item.amount,
    })),
    // 상품 합계 = 총 결제금액 - 배달비
    totalProductAmount: payload.totalAmount - payload.deliveryFee,
    deliveryFee: payload.deliveryFee,
    distanceKm: payload.distanceKm,
    address1: payload.address1,
    address2: payload.address2 || undefined,
    scheduledDeliveryHour: payload.scheduledDeliveryHour ?? undefined,
    scheduledDeliveryMinute: payload.scheduledDeliveryMinute ?? undefined,
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
    setAlerts(prev => {
      const target = prev.find(a => a.orderId === orderId);
      if (target?.type === 'upcoming') {
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
        const dismissedKey = `dismissed-upcoming-alerts-${today}`;
        const dismissed: number[] = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
        if (!dismissed.includes(orderId)) {
          dismissed.push(orderId);
          localStorage.setItem(dismissedKey, JSON.stringify(dismissed));
        }
      }
      return prev.filter(a => a.orderId !== orderId);
    });
  };

  const playAlertSound = () => {
    try {
      if (!alertAudioRef.current) {
        alertAudioRef.current = new Audio('/sounds/discord-call-sound_tvxg95l.mp3');
        alertAudioRef.current.loop = true;
      }
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (!sourceNodeRef.current) {
        sourceNodeRef.current = audioCtxRef.current.createMediaElementSource(alertAudioRef.current);
        gainNodeRef.current = audioCtxRef.current.createGain();
        sourceNodeRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioCtxRef.current.destination);
      }
      const vol = parseFloat(localStorage.getItem('delivery-alert-volume') ?? '1.0');
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = Math.max(0, Math.min(10, vol));
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
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

    // 전일 이전 dismissed-upcoming-alerts 키 정리
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('dismissed-upcoming-alerts-') && !key.endsWith(todayStr)) {
        localStorage.removeItem(key);
      }
    }

    const apiBase = process.env.REACT_APP_API_BASE || '';
    let disposed = false;
    let checking = false;

    const checkDeliveries = async () => {
      if (checking) return;
      checking = true;
      try {
        const serverMs = await getServerTime();
        const today = formatKstDate(serverMs);
        const res = await getAdminDeliveries(today);
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data?.response) ? data.response : [];

        // paid 보완 폴링 (SSE 누락 대비)
        const paidCandidates = list.filter((r: any) => {
          if (String(r.status || '') !== 'PAID') return false;
          const acceptedAt = r.accepted_at ?? r.acceptedAt ?? null;
          return acceptedAt === null;
        });
        paidCandidates.forEach((r: any) => {
          pushAlert(parseAlertPayload(r, 'paid'));
        });

        // 예약배달 upcoming 체크
        const scheduledAlertOn = localStorage.getItem('scheduled-delivery-alert') !== 'false';
        if (!scheduledAlertOn) return;

        const dismissedKey = `dismissed-upcoming-alerts-${today}`;
        const dismissed: number[] = JSON.parse(localStorage.getItem(dismissedKey) || '[]');

        const nowMs = serverMs;
        const upcomingTargets = list.filter((r: any) => {
          const status = String(r.status || '');
          if (status !== 'PAID' && status !== 'OUT_FOR_DELIVERY') return false;
          const scheduledHour = r.scheduled_delivery_hour ?? r.scheduledDeliveryHour ?? null;
          if (scheduledHour === null) return false;
          const scheduledMin = Number(r.scheduled_delivery_minute ?? r.scheduledDeliveryMinute ?? 0);
          const targetMs = new Date(`${today}T${String(scheduledHour).padStart(2, '0')}:${String(scheduledMin).padStart(2, '0')}:00+09:00`).getTime();
          const diff = targetMs - nowMs;
          return diff <= 60 * 60 * 1000 && diff > 0;
        });
        upcomingTargets.forEach((r: any) => {
          const orderId = Number(r.id ?? 0);
          if (dismissed.includes(orderId)) return;
          pushAlert(parseAlertPayload(r, 'upcoming'));
        });
      } catch (err) {
        safeErrorLog(err, 'AdminDeliveryAlertProvider - checkDeliveries');
      } finally {
        checking = false;
      }
    };

    const startFallbackPolling = () => {
      if (fallbackPollTimerRef.current) return;
      checkDeliveries();
      fallbackPollTimerRef.current = window.setInterval(checkDeliveries, 15000);
    };

    const stopFallbackPolling = () => {
      if (!fallbackPollTimerRef.current) return;
      clearInterval(fallbackPollTimerRef.current);
      fallbackPollTimerRef.current = null;
    };

    const scheduleReconnect = (connectFn: () => void) => {
      if (disposed || reconnectTimerRef.current) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttemptRef.current));
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connectFn();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      const source = new EventSource(`${apiBase}/api/admin/shop/deliveries/stream`, { withCredentials: true } as any);
      sourceRef.current = source;

      source.onopen = () => {
        sseConnectedRef.current = true;
        reconnectAttemptRef.current = 0;
        stopFallbackPolling();
      };

      source.addEventListener('delivery_paid', event => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          const payload = parseAlertPayload(data, 'paid');
          pushAlert(payload);
          printReceipt(buildPrintData(payload)).then(ok => {
            if (!ok) {
              snackbar.show('영수증 출력에 실패했습니다. 프린터 연결을 확인해주세요.', { variant: 'error' });
            }
          });
        } catch (e) {
          safeErrorLog(e, 'AdminDeliveryAlertProvider - parse event');
        }
      });

      source.onerror = (e) => {
        safeErrorLog(e, 'AdminDeliveryAlertProvider - SSE error');
        sseConnectedRef.current = false;
        startFallbackPolling();
        if (sourceRef.current === source) {
          source.close();
          sourceRef.current = null;
        }
        scheduleReconnect(connect);
      };
    };
    connect();

    // 즉시 1회 체크 + 30분 정각 aligned 타이머
    checkDeliveries();
    const now = new Date();
    const msUntilNextHalf = ((30 - (now.getMinutes() % 30)) * 60 * 1000) - now.getSeconds() * 1000 - now.getMilliseconds();
    const alignTimer = window.setTimeout(() => {
      checkDeliveries();
      pollTimerRef.current = window.setInterval(checkDeliveries, 1800000);
    }, msUntilNextHalf);

    const watchdogTimer = window.setInterval(() => {
      if (disposed) return;
      const source = sourceRef.current;
      if (!source || source.readyState === EventSource.CLOSED) {
        sseConnectedRef.current = false;
        startFallbackPolling();
        scheduleReconnect(connect);
      }
    }, 10000);

    const handleOnline = () => {
      if (disposed) return;
      sseConnectedRef.current = false;
      startFallbackPolling();
      scheduleReconnect(connect);
    };

    const handleVisibilityChange = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      const source = sourceRef.current;
      if (!source || source.readyState !== EventSource.OPEN) {
        sseConnectedRef.current = false;
        startFallbackPolling();
        scheduleReconnect(connect);
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      sseConnectedRef.current = false;
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopFallbackPolling();
      clearInterval(watchdogTimer);
      clearTimeout(alignTimer);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleReject = async (orderId: number) => {
    try {
      const res = await updateAdminDeliveryStatus(orderId, 'canceled');
      if (res.ok) {
        const alertItem = alerts.find(a => a.orderId === orderId);
        snackbar.show(`주문 ${alertItem?.displayCode || '#' + orderId} 거부되었습니다.`, { variant: 'info' });
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
      const alert = alerts.find(a => a.orderId === orderId);
      const isScheduled = alert?.scheduledDeliveryHour !== null && alert?.scheduledDeliveryHour !== undefined;
      const minutes = isScheduled ? 10 : getEstimated(orderId);
      const res = await acceptAdminDelivery(orderId, minutes);
      if (res.ok) {
        const code = alert?.displayCode || '#' + orderId;
        if (isScheduled) {
          const h = alert!.scheduledDeliveryHour;
          const m = String(alert!.scheduledDeliveryMinute ?? 0).padStart(2, '0');
          snackbar.show(`주문 ${code} 접수 완료 (${h}:${m} 도착예정)`, { variant: 'success' });
        } else {
          snackbar.show(`주문 ${code} 접수 완료 (${getEstimated(orderId)}분)`, { variant: 'success' });
        }
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
              onClick={() => {
                const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
                const dismissedKey = `dismissed-upcoming-alerts-${today}`;
                const dismissed: number[] = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
                alerts.forEach(a => {
                  if (a.type === 'upcoming' && !dismissed.includes(a.orderId)) {
                    dismissed.push(a.orderId);
                  }
                });
                localStorage.setItem(dismissedKey, JSON.stringify(dismissed));
                paidNotifiedRef.current.clear();
                upcomingNotifiedRef.current.clear();
                setAlerts([]);
              }}
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
                      <div className="text-sm font-semibold text-orange-600 mb-2">예약배달 알림</div>
                      <p className="text-sm text-gray-700 mb-3">
                        {a.buyerName}님의 배달({a.scheduledDeliveryHour}:{String(a.scheduledDeliveryMinute ?? 0).padStart(2, '0')} 도착예정)이 1시간 이내로 예정되어 있습니다.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-green-700 mb-2">
                        결제 완료
                        {a.scheduledDeliveryHour !== null && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            {a.scheduledDeliveryHour}:{String(a.scheduledDeliveryMinute ?? 0).padStart(2, '0')} 도착예정
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-800 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-500">주문번호</span>
                          <span className="font-medium">{a.displayCode}</span>
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
                      {a.scheduledDeliveryHour === null && (
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
                      )}
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
