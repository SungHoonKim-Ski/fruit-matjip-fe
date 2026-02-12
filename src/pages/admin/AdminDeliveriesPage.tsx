import React, { useEffect, useState } from 'react';
import AdminHeader from '../../components/AdminHeader';
import { getAdminDeliveries, updateAdminDeliveryStatus, getAdminDeliveryConfig, updateAdminDeliveryConfig } from '../../utils/api';
import { safeErrorLog } from '../../utils/environment';
import { useSnackbar } from '../../components/snackbar';
import { printReceipt, PrintReceiptData } from '../../utils/printBridge';

interface DeliveryRow {
  id: number;
  reservationItems: { id: number; productName: string; quantity: number; amount: number }[];
  buyerName: string;
  totalAmount: number;
  status: string;
  phone: string;
  postalCode: string;
  address1: string;
  address2?: string;
  distanceKm: number;     // 영수증 출력용 배달 거리
  deliveryFee: number;    // 영수증 출력용 배달비
  deliveryHour: number;   // 영수증 출력용 배달 시간
  deliveryMinute: number; // 영수증 출력용 배달 분
  paidAt: string;         // 영수증 출력용 결제 시각
  scheduledDeliveryHour: number | null;
  scheduledDeliveryMinute: number | null;
}

interface DeliveryConfigForm {
  enabled: boolean;
  minAmount: string;
  feeNear: string;
  feePer100m: string;
  feeDistanceKm: string;
  maxDistanceKm: string;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
}

export default function AdminDeliveriesPage() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }));
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'out_for_delivery' | 'delivered' | 'canceled'>('all');
  const [scheduledFilter, setScheduledFilter] = useState<'all' | 'normal' | 'scheduled'>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [configForm, setConfigForm] = useState<DeliveryConfigForm>({
    enabled: true,
    minAmount: '',
    feeNear: '',
    feePer100m: '',
    feeDistanceKm: '',
    maxDistanceKm: '',
    startHour: '',
    startMinute: '',
    endHour: '',
    endMinute: '',
  });
  const { show } = useSnackbar();
  const [alertVolume, setAlertVolume] = useState<number>(() => {
    const saved = localStorage.getItem('delivery-alert-volume');
    return saved !== null ? parseFloat(saved) : 1.0;
  });
  const [scheduledAlertEnabled, setScheduledAlertEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('scheduled-delivery-alert');
    return saved !== null ? saved === 'true' : true;
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING_PAYMENT':
        return '결제 대기';
      case 'PAID':
        return '결제 완료';
      case 'OUT_FOR_DELIVERY':
        return '배달중';
      case 'DELIVERED':
        return '배달 완료';
      case 'CANCELED':
        return '주문 취소';
      case 'FAILED':
        return '결제 실패';
      default:
        return status;
    }
  };

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return raw;
  };

  const filteredRows = rows.filter(row => {
    if (deliveryFilter !== 'all' && row.status !== deliveryFilter.toUpperCase()) return false;
    if (scheduledFilter === 'normal' && row.scheduledDeliveryHour !== null) return false;
    if (scheduledFilter === 'scheduled' && row.scheduledDeliveryHour === null) return false;
    return true;
  });

  useEffect(() => {
    if (sessionStorage.getItem('admin-deliveries-reload') === '1') {
      sessionStorage.removeItem('admin-deliveries-reload');
      window.location.reload();
      return;
    }
    const load = async () => {
      try {
        const res = await getAdminDeliveries(selectedDate);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || '배달 목록을 불러오지 못했습니다.');
        }
        const data = await res.json();
        const list = Array.isArray(data?.response) ? data.response : [];
        const mapped = list.map((r: any) => ({
          id: Number(r.id),
          reservationItems: Array.isArray(r.reservation_items)
            ? r.reservation_items.map((item: any) => ({
              id: Number(item.id ?? item.reservation_id ?? 0),
              productName: String(item.product_name ?? item.productName ?? ''),
              quantity: Number(item.quantity ?? 0),
              amount: Number(item.amount ?? 0),
            }))
            : Array.isArray(r.reservations)
              ? r.reservations.map((item: any) => ({
                id: Number(item.id ?? item.reservation_id ?? 0),
                productName: String(item.product_name ?? item.productName ?? ''),
                quantity: Number(item.quantity ?? 0),
                amount: Number(item.amount ?? 0),
              }))
              : [],
          buyerName: String(r.buyer_name || ''),
          totalAmount: Number(r.total_amount || 0),
          status: String(r.status || ''),
          phone: String(r.phone || ''),
          postalCode: String(r.postal_code || ''),
          address1: String(r.address1 || ''),
          address2: String(r.address2 || ''),
          distanceKm: Number(r.distance_km ?? r.distanceKm ?? 0),
          deliveryFee: Number(r.delivery_fee ?? r.deliveryFee ?? 0),
          deliveryHour: Number(r.delivery_hour ?? r.deliveryHour ?? 0),
          deliveryMinute: Number(r.delivery_minute ?? r.deliveryMinute ?? 0),
          paidAt: String(r.paid_at ?? r.paidAt ?? ''),
          scheduledDeliveryHour: r.scheduled_delivery_hour ?? r.scheduledDeliveryHour ?? null,
          scheduledDeliveryMinute: r.scheduled_delivery_minute ?? r.scheduledDeliveryMinute ?? null,
        }));
        const statusPriority: Record<string, number> = {
          PAID: 1,
          OUT_FOR_DELIVERY: 2,
          DELIVERED: 3,
          CANCELED: 4,
        };
        const sorted = mapped.sort((a: DeliveryRow, b: DeliveryRow) => {
          const aPriority = statusPriority[a.status] ?? 99;
          const bPriority = statusPriority[b.status] ?? 99;
          if (aPriority !== bPriority) return aPriority - bPriority;
          const aScheduled = a.scheduledDeliveryHour !== null;
          const bScheduled = b.scheduledDeliveryHour !== null;
          if (aScheduled && bScheduled) {
            const aTime = a.scheduledDeliveryHour! * 60 + (a.scheduledDeliveryMinute ?? 0);
            const bTime = b.scheduledDeliveryHour! * 60 + (b.scheduledDeliveryMinute ?? 0);
            if (aTime !== bTime) return aTime - bTime;
          }
          if (aScheduled !== bScheduled) return aScheduled ? -1 : 1;
          return b.id - a.id;
        });
        setRows(sorted);
      } catch (e) {
        safeErrorLog(e, 'AdminDeliveriesPage - load');
        show('배달 목록을 불러오는 중 오류가 발생했습니다.', { variant: 'error' });
      }
    };
    load();
  }, [selectedDate, show]);

  useEffect(() => {
    let alive = true;
    const loadConfig = async () => {
      try {
        setConfigLoading(true);
        const res = await getAdminDeliveryConfig();
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || '배달 설정을 불러오지 못했습니다.');
        }
        const data = await res.json();
        if (!alive) return;
        setConfigForm({
          enabled: data.enabled ?? data.delivery_enabled ?? true,
          minAmount: String(data.min_amount ?? data.minAmount ?? ''),
          feeNear: String(data.fee_near ?? data.feeNear ?? ''),
          feePer100m: String(data.fee_per100m ?? data.feePer100m ?? ''),
          feeDistanceKm: String(data.fee_distance_km ?? data.feeDistanceKm ?? ''),
          maxDistanceKm: String(data.max_distance_km ?? data.maxDistanceKm ?? ''),
          startHour: String(data.start_hour ?? data.startHour ?? ''),
          startMinute: String(data.start_minute ?? data.startMinute ?? ''),
          endHour: String(data.end_hour ?? data.endHour ?? ''),
          endMinute: String(data.end_minute ?? data.endMinute ?? ''),
        });
      } catch (e) {
        safeErrorLog(e, 'AdminDeliveriesPage - loadConfig');
        show('배달 설정을 불러오는 중 오류가 발생했습니다.', { variant: 'error' });
      } finally {
        if (alive) setConfigLoading(false);
      }
    };
    loadConfig();
    return () => {
      alive = false;
    };
  }, [show]);

  const handleStatusChange = async (row: DeliveryRow, next: 'out_for_delivery' | 'delivered' | 'canceled') => {
    try {
      const confirmMessage = next === 'out_for_delivery'
        ? '배달을 시작하시겠습니까?'
        : next === 'delivered'
          ? '배달 완료 처리하시겠습니까?'
          : '주문을 취소하시겠습니까?';
      if (!window.confirm(confirmMessage)) {
        return;
      }
      setUpdatingId(row.id);
      const res = await updateAdminDeliveryStatus(row.id, next);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '상태 변경에 실패했습니다.');
      }
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: next.toUpperCase() } : r));
      show('상태가 변경되었습니다.');
    } catch (e) {
      safeErrorLog(e, 'AdminDeliveriesPage - updateStatus');
      show('상태 변경 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setUpdatingId(null);
    }
  };

  // 영수증 출력 핸들러
  // DeliveryRow 데이터를 PrintReceiptData 형식으로 변환 후 프린터 브릿지 호출
  const handlePrint = async (row: DeliveryRow) => {
    const data: PrintReceiptData = {
      orderId: row.id,
      paidAt: row.paidAt,
      deliveryHour: row.deliveryHour,
      deliveryMinute: row.deliveryMinute,
      buyerName: row.buyerName,
      phone: row.phone,
      items: row.reservationItems.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        amount: item.amount,
      })),
      // 상품 합계 = 총 결제금액 - 배달비
      totalProductAmount: row.totalAmount - row.deliveryFee,
      deliveryFee: row.deliveryFee,
      distanceKm: row.distanceKm,
      address1: row.address1,
      address2: row.address2 || undefined,
    };

    const ok = await printReceipt(data);
    if (ok) {
      show('영수증이 출력되었습니다.');
    } else {
      show('영수증 출력에 실패했습니다. 프린터 연결을 확인해주세요.', { variant: 'error' });
    }
  };

  const handleVolumeChange = (value: number) => {
    const clamped = Math.max(0, Math.min(10, value));
    setAlertVolume(clamped);
    localStorage.setItem('delivery-alert-volume', String(clamped));
  };

  const handleScheduledAlertToggle = () => {
    setScheduledAlertEnabled(prev => {
      const next = !prev;
      localStorage.setItem('scheduled-delivery-alert', String(next));
      return next;
    });
  };

  const handleSaveConfig = async () => {
    try {
      setConfigSaving(true);
      const minAmount = Number(configForm.minAmount);
      const feeNear = Number(configForm.feeNear);
      const feePer100m = Number(configForm.feePer100m);
      const feeDistanceKm = Number(configForm.feeDistanceKm);
      const maxDistanceKm = Number(configForm.maxDistanceKm);
      const startHour = Number(configForm.startHour);
      const startMinute = Number(configForm.startMinute);
      const endHour = Number(configForm.endHour);
      const endMinute = Number(configForm.endMinute);

      if ([minAmount, feeNear, feePer100m, feeDistanceKm, maxDistanceKm, startHour, startMinute, endHour, endMinute]
        .some(v => Number.isNaN(v))) {
        show('배달 설정의 숫자 값을 확인해주세요.', { variant: 'error' });
        return;
      }
      if (minAmount < 0 || feeNear < 0 || feePer100m < 0 || feeDistanceKm < 0 || maxDistanceKm < 0) {
        show('배달 설정 값은 0 이상이어야 합니다.', { variant: 'error' });
        return;
      }
      if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 || startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
        show('배달 시간 범위를 확인해주세요.', { variant: 'error' });
        return;
      }
      if (feeDistanceKm > maxDistanceKm) {
        show('배달 기준 거리는 최대 거리보다 클 수 없습니다.', { variant: 'error' });
        return;
      }

      const res = await updateAdminDeliveryConfig({
        enabled: configForm.enabled,
        minAmount,
        feeNear,
        feePer100m,
        feeDistanceKm,
        maxDistanceKm,
        startHour,
        startMinute,
        endHour,
        endMinute,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '배달 설정 저장에 실패했습니다.');
      }
      const data = await res.json();
      setConfigForm({
        enabled: data.enabled ?? data.delivery_enabled ?? true,
        minAmount: String(data.min_amount ?? data.minAmount ?? minAmount),
        feeNear: String(data.fee_near ?? data.feeNear ?? feeNear),
        feePer100m: String(data.fee_per_100m ?? data.feePer100m ?? feePer100m),
        feeDistanceKm: String(data.fee_distance_km ?? data.feeDistanceKm ?? feeDistanceKm),
        maxDistanceKm: String(data.max_distance_km ?? data.maxDistanceKm ?? maxDistanceKm),
        startHour: String(data.start_hour ?? data.startHour ?? startHour),
        startMinute: String(data.start_minute ?? data.startMinute ?? startMinute),
        endHour: String(data.end_hour ?? data.endHour ?? endHour),
        endMinute: String(data.end_minute ?? data.endMinute ?? endMinute),
      });
      show('배달 설정이 저장되었습니다.');
    } catch (e) {
      safeErrorLog(e, 'AdminDeliveriesPage - saveConfig');
      show('배달 설정 저장 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">🚚 배달 관리</h1>
          <div className="flex justify-end">
            <AdminHeader />
          </div>
        </div>
        <div className="mt-4 bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <button
            type="button"
            onClick={() => setConfigOpen(prev => !prev)}
            className="w-full flex items-center justify-between text-left"
            aria-expanded={configOpen}
          >
            <span className="text-xl font-bold text-gray-800">⚙️ 배달 설정</span>
            <span className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold px-2 py-1 rounded ${configForm.enabled ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}
              >
                {configForm.enabled ? '배달 허용' : '배달 금지'}
              </span>
              <span className="text-base text-gray-500">{configOpen ? '▲' : '▼'}</span>
            </span>
          </button>
          {configOpen && (
            <>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">최소 주문 금액(원)</div>
                  <input
                    type="number"
                    value={configForm.minAmount}
                    onChange={e => setConfigForm(prev => ({ ...prev, minAmount: e.target.value }))}
                    className="h-10 w-full border rounded px-2"
                    min={0}
                    disabled={configLoading}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">배달 시작 시간</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={configForm.startHour}
                      onChange={e => setConfigForm(prev => ({ ...prev, startHour: e.target.value }))}
                      className="h-10 w-full border rounded px-2"
                      min={0}
                      max={23}
                      disabled={configLoading}
                      placeholder="시"
                    />
                    <input
                      type="number"
                      value={configForm.startMinute}
                      onChange={e => setConfigForm(prev => ({ ...prev, startMinute: e.target.value }))}
                      className="h-10 w-full border rounded px-2"
                      min={0}
                      max={59}
                      disabled={configLoading}
                      placeholder="분"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">배달 종료 시간</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={configForm.endHour}
                      onChange={e => setConfigForm(prev => ({ ...prev, endHour: e.target.value }))}
                      className="h-10 w-full border rounded px-2"
                      min={0}
                      max={23}
                      disabled={configLoading}
                      placeholder="시"
                    />
                    <input
                      type="number"
                      value={configForm.endMinute}
                      onChange={e => setConfigForm(prev => ({ ...prev, endMinute: e.target.value }))}
                      className="h-10 w-full border rounded px-2"
                      min={0}
                      max={59}
                      disabled={configLoading}
                      placeholder="분"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">기본 배달비(원)</div>
                  <input
                    type="number"
                    value={configForm.feeNear}
                    onChange={e => setConfigForm(prev => ({ ...prev, feeNear: e.target.value }))}
                    className="h-10 w-full border rounded px-2"
                    min={0}
                    disabled={configLoading}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">기준 거리(km)</div>
                  <input
                    type="number"
                    value={configForm.feeDistanceKm}
                    onChange={e => setConfigForm(prev => ({ ...prev, feeDistanceKm: e.target.value }))}
                    className="h-10 w-full border rounded px-2"
                    min={0}
                    step="0.1"
                    disabled={configLoading}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">거리 추가 요금(100m당)</div>
                  <input
                    type="number"
                    value={configForm.feePer100m}
                    onChange={e => setConfigForm(prev => ({ ...prev, feePer100m: e.target.value }))}
                    className="h-10 w-full border rounded px-2"
                    min={0}
                    step="1"
                    inputMode="numeric"
                    disabled={configLoading}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">최대 배달 거리(km)</div>
                  <input
                    type="number"
                    value={configForm.maxDistanceKm}
                    onChange={e => setConfigForm(prev => ({ ...prev, maxDistanceKm: e.target.value }))}
                    className="h-10 w-full border rounded px-2"
                    min={0}
                    step="0.1"
                    disabled={configLoading}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfigForm(prev => ({ ...prev, enabled: !prev.enabled }))}
                  disabled={configLoading}
                  className={`h-10 px-4 rounded text-white text-sm font-semibold ${configForm.enabled ? 'bg-green-600' : 'bg-rose-600'} disabled:opacity-50`}
                >
                  {configForm.enabled ? '배달 허용' : '배달 금지'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={configSaving || configLoading}
                  className="h-10 px-4 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  저장
                </button>
              </div>
              {configLoading && (
                <div className="mt-3 text-xs text-gray-500">배달 설정을 불러오는 중...</div>
              )}
            </>
          )}
        </div>
        <div className="mt-4 bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <button
            type="button"
            onClick={() => setAlertOpen(prev => !prev)}
            className="w-full flex items-center justify-between text-left"
            aria-expanded={alertOpen}
          >
            <span className="text-xl font-bold text-gray-800">🔔 알림 설정</span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-700">
                {Math.round(alertVolume * 100)}%
              </span>
              <span className="text-base text-gray-500">{alertOpen ? '▲' : '▼'}</span>
            </span>
          </button>
          {alertOpen && (
            <>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-700">🔊 알림 볼륨</div>
                  <div className="text-xs text-gray-700 font-medium">{Math.round(alertVolume * 100)}%</div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.1}
                  value={alertVolume}
                  onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600"
                />
                <div className="relative text-xs text-gray-400 mt-1 h-4">
                  <span className="absolute left-0">0</span>
                  <span className="absolute left-[10%]">100%</span>
                  <span className="absolute left-[50%] -translate-x-1/2">500%</span>
                  <span className="absolute right-0">1000%</span>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-700">🕐 예약배달 알림</div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduledAlertEnabled}
                      onChange={handleScheduledAlertToggle}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                <div className="text-xs text-gray-500 mt-1">예약배달 주문의 1시간 전 리마인더 알림</div>
              </div>
            </>
          )}
        </div>
        <div id="delivery-orders" className="mt-4 bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h2 className="text-xl font-bold text-gray-800">배달 주문 목록</h2>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">날짜</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="h-10 border rounded px-2"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">배달방식</span>
              <button
                type="button"
                onClick={() => setScheduledFilter('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  scheduledFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => setScheduledFilter('normal')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  scheduledFilter === 'normal' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                일반
              </button>
              <button
                type="button"
                onClick={() => setScheduledFilter('scheduled')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  scheduledFilter === 'scheduled' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                예약
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">배달상태</span>
              <button
                type="button"
                onClick={() => setDeliveryFilter('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  deliveryFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => setDeliveryFilter('out_for_delivery')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  deliveryFilter === 'out_for_delivery' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                배달중
              </button>
              <button
                type="button"
                onClick={() => setDeliveryFilter('delivered')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  deliveryFilter === 'delivered' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                배달완료
              </button>
              <button
                type="button"
                onClick={() => setDeliveryFilter('canceled')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  deliveryFilter === 'canceled' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                취소
              </button>
            </div>
          </div>
          {/* Desktop table */}
          <div className="mt-4 overflow-x-auto hidden md:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 pr-3">상품</th>
                  <th className="py-2 pr-3">연락처/주소</th>
                  <th className="py-2 pr-3">주문</th>
                  <th className="py-2 pr-3">금액</th>
                  <th className="py-2 pr-3">상태</th>
                  <th className="py-2 pr-3">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-gray-500">배달 주문이 없습니다.</td>
                  </tr>
                )}
                {filteredRows.map(r => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 pr-3">
                      {r.reservationItems.length > 0 ? (
                        <div className="space-y-1">
                          {r.reservationItems.map(item => (
                            <div key={`${r.id}-${item.id}`} className="text-sm text-gray-900">
                              {item.productName} · {item.quantity}개 · {item.amount.toLocaleString()}원
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <div className="text-base font-semibold text-gray-900">상품 정보 없음</div>
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-sm font-semibold text-gray-900">{r.buyerName}</div>
                      <div className={`text-sm ${r.phone ? 'text-gray-700' : 'text-rose-600'}`}>
                        {r.phone ? formatPhone(r.phone) : '휴대폰 없음'}
                      </div>
                      <div className="text-xs text-gray-500">{r.postalCode}</div>
                      <div className="text-xs text-gray-600">{r.address1} {r.address2}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-800">#{r.id}</span>
                        {r.scheduledDeliveryHour !== null && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            {r.scheduledDeliveryHour}시{r.scheduledDeliveryMinute ? `${r.scheduledDeliveryMinute}분` : ''} 도착예정
                          </span>
                        )}
                      </div>
                      {r.paidAt && (
                        <div className="text-xs text-gray-500">{new Date(r.paidAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 주문</div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-gray-700">총 {r.totalAmount.toLocaleString()}원</div>
                    </td>
                    <td className="py-2 pr-3">{getStatusLabel(r.status)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="h-8 px-2 rounded bg-blue-500 text-white text-xs disabled:opacity-50"
                          onClick={() => handleStatusChange(r, 'out_for_delivery')}
                          disabled={updatingId === r.id || r.status !== 'PAID'}
                        >
                          배달 시작
                        </button>
                        <button
                          type="button"
                          className="h-8 px-2 rounded bg-green-600 text-white text-xs disabled:opacity-50"
                          onClick={() => handleStatusChange(r, 'delivered')}
                          disabled={updatingId === r.id || r.status !== 'OUT_FOR_DELIVERY'}
                        >
                          배달 완료
                        </button>
                        <button
                          type="button"
                          className="h-8 px-2 rounded bg-gray-500 text-white text-xs disabled:opacity-50"
                          onClick={() => handleStatusChange(r, 'canceled')}
                          disabled={updatingId === r.id || r.status === 'DELIVERED' || r.status === 'CANCELED' || r.status === 'FAILED'}
                        >
                          주문 취소
                        </button>
                        <button
                          type="button"
                          className="h-8 px-2 rounded bg-purple-500 text-white text-xs disabled:opacity-50"
                          onClick={() => handlePrint(r)}
                          disabled={updatingId === r.id || r.status === 'CANCELED' || r.status === 'FAILED'}
                        >
                          출력
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-3 md:hidden">
            {filteredRows.length === 0 && (
              <div className="py-6 text-center text-gray-500">배달 주문이 없습니다.</div>
            )}
            {filteredRows.map(r => (
              <div key={r.id} className="bg-white border rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-800">#{r.id}</span>
                      {r.scheduledDeliveryHour !== null && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {r.scheduledDeliveryHour}시{r.scheduledDeliveryMinute ? `${r.scheduledDeliveryMinute}분` : ''} 도착예정
                        </span>
                      )}
                    </div>
                    {r.paidAt && (
                      <div className="text-xs text-gray-500">{new Date(r.paidAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 주문</div>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{getStatusLabel(r.status)}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {r.reservationItems.length > 0 ? (
                    r.reservationItems.map(item => (
                      <div key={`${r.id}-${item.id}`} className="text-sm text-gray-900">
                        {item.productName} · {item.quantity}개 · {item.amount.toLocaleString()}원
                      </div>
                    ))
                  ) : (
                    <div className="text-base font-semibold text-gray-900">상품 정보 없음</div>
                  )}
                </div>
                <div className="mt-2 text-base font-semibold text-gray-900">{r.buyerName}</div>
                <div className={`mt-1 text-sm ${r.phone ? 'text-gray-700' : 'text-rose-600'}`}>
                  {r.phone ? formatPhone(r.phone) : '휴대폰 없음'}
                </div>
                <div className="mt-1 text-sm text-gray-700">{r.address1} {r.address2}</div>
                <div className="mt-1 text-xs text-gray-500">{r.postalCode}</div>
                <div className="mt-1 text-sm text-gray-700">총 {r.totalAmount.toLocaleString()}원</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    className="h-9 rounded bg-blue-500 text-white text-xs disabled:opacity-50"
                    onClick={() => handleStatusChange(r, 'out_for_delivery')}
                    disabled={updatingId === r.id || r.status !== 'PAID'}
                  >
                    배달 시작
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded bg-green-600 text-white text-xs disabled:opacity-50"
                    onClick={() => handleStatusChange(r, 'delivered')}
                    disabled={updatingId === r.id || r.status !== 'OUT_FOR_DELIVERY'}
                  >
                    배달 완료
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded bg-gray-500 text-white text-xs disabled:opacity-50"
                    onClick={() => handleStatusChange(r, 'canceled')}
                    disabled={updatingId === r.id || r.status === 'DELIVERED' || r.status === 'CANCELED' || r.status === 'FAILED'}
                  >
                    주문 취소
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
