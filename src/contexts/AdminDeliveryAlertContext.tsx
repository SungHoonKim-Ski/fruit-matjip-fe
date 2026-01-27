import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { safeErrorLog } from '../utils/environment';
import { USE_MOCKS } from '../config';
import { getAdminDeliveries, getServerTime } from '../utils/api';

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
};

const AdminDeliveryAlertContext = createContext({});

export const AdminDeliveryAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alert, setAlert] = useState<DeliveryAlertPayload | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const lastNotifiedIdRef = useRef<number>(0);
  const upcomingNotifiedRef = useRef<Set<number>>(new Set());
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const formatKstDate = (ms: number) =>
    new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  const pushAlert = (payload: DeliveryAlertPayload) => {
    if (payload.type === 'upcoming') {
      if (upcomingNotifiedRef.current.has(payload.orderId)) return;
      upcomingNotifiedRef.current.add(payload.orderId);
      setAlert(payload);
      playAlertSound();
      return;
    }
    if (payload.orderId <= lastNotifiedIdRef.current) return;
    lastNotifiedIdRef.current = payload.orderId;
    setAlert(payload);
    playAlertSound();
  };

  const playAlertSound = () => {
    try {
      if (!alertAudioRef.current) {
        alertAudioRef.current = new Audio('/sounds/discord-call-sound_tvxg95l.mp3');
      }
      alertAudioRef.current.currentTime = 0;
      alertAudioRef.current.play().catch(() => {
        // autoplay restrictions
      });
    } catch (e) {
      safeErrorLog(e, 'AdminDeliveryAlertProvider - playAlertSound');
    }
  };

  useEffect(() => {
    if (USE_MOCKS) return;
    const isAdminPage = location.pathname.startsWith('/admin');
    const isAdminAuthPage = location.pathname === '/admin/login' || location.pathname === '/admin/register';
    if (!isAdminPage || isAdminAuthPage) return;

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
          pushAlert({
            orderId: Number(data.order_id),
            reservationIds: Array.isArray(data.reservation_ids) ? data.reservation_ids.map((id: any) => Number(id)) : [],
            reservationCount: Number(data.reservation_count || 0),
            buyerName: String(data.buyer_name || ''),
            productSummary: String(data.product_summary || ''),
            deliveryDate: String(data.delivery_date || ''),
            deliveryHour: Number(data.delivery_hour || 0),
            deliveryMinute: Number(data.delivery_minute ?? data.deliveryMinute ?? 0),
            type: 'paid',
          });
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
          if (paidCandidates.length > 0) {
            const latest = paidCandidates.reduce((acc: any, cur: any) => (Number(cur.id) > Number(acc.id) ? cur : acc));
            pushAlert({
              orderId: Number(latest.id),
              reservationIds: Array.isArray(latest.reservation_ids) ? latest.reservation_ids.map((id: any) => Number(id)) : [],
              reservationCount: Number(latest.reservation_count || 0),
              buyerName: String(latest.buyer_name || ''),
              productSummary: String(latest.product_summary || ''),
              deliveryDate: String(latest.delivery_date || ''),
              deliveryHour: Number(latest.delivery_hour || 0),
              deliveryMinute: Number(latest.delivery_minute ?? latest.deliveryMinute ?? 0),
              type: 'paid',
            });
          }

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
            pushAlert({
              orderId: Number(r.id),
              reservationIds: Array.isArray(r.reservation_ids) ? r.reservation_ids.map((id: any) => Number(id)) : [],
              reservationCount: Number(r.reservation_count || 0),
              buyerName: String(r.buyer_name || ''),
              productSummary: String(r.product_summary || ''),
              deliveryDate: String(r.delivery_date || ''),
              deliveryHour: Number(r.delivery_hour || 0),
              deliveryMinute: Number(r.delivery_minute ?? r.deliveryMinute ?? 0),
              type: 'upcoming',
            });
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

  const modal = useMemo(() => {
    if (!alert) return null;
    const timeLabel = alert.deliveryMinute && alert.deliveryMinute > 0
      ? `${alert.deliveryHour}시 ${String(alert.deliveryMinute).padStart(2, '0')}분`
      : `${alert.deliveryHour}시`;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white w-full max-w-sm rounded-lg shadow-lg p-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {alert.type === 'upcoming' ? '배달 예정 알림' : '배달 주문 결제 완료'}
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            {alert.type === 'upcoming'
              ? `${alert.buyerName}님의 배달이 30분 이내로 예정되어 있습니다.`
              : `${alert.buyerName}님이 ${alert.productSummary} 배달 결제를 완료했습니다.`}
            <br />
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 h-10 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => setAlert(null)}
            >
              이동 안함
            </button>
            <button
              type="button"
              className="flex-1 h-10 rounded bg-green-600 text-white hover:bg-green-700"
              onClick={() => {
                setAlert(null);
                if (location.pathname === '/admin/deliveries') {
                  window.location.reload();
                  return;
                }
                sessionStorage.setItem('admin-deliveries-reload', '1');
                navigate('/admin/deliveries');
              }}
            >
              배달 페이지로 이동
            </button>
          </div>
        </div>
      </div>
    );
  }, [alert, navigate, location.pathname]);

  return (
    <AdminDeliveryAlertContext.Provider value={{}}>
      {children}
      {modal}
    </AdminDeliveryAlertContext.Provider>
  );
};
