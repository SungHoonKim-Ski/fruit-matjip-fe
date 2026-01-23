import React, { useEffect, useState } from 'react';
import AdminHeader from '../../components/AdminHeader';
import { getAdminDeliveries, updateAdminDeliveryStatus } from '../../utils/api';
import { safeErrorLog } from '../../utils/environment';
import { useSnackbar } from '../../components/snackbar';

interface DeliveryRow {
  id: number;
  reservationIds: number[];
  reservationCount: number;
  buyerName: string;
  productSummary: string;
  totalQuantity: number;
  deliveryDate: string;
  deliveryHour: number;
  deliveryFee: number;
  totalAmount: number;
  status: string;
  phone: string;
  postalCode: string;
  address1: string;
  address2?: string;
}

export default function AdminDeliveriesPage() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }));
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const { show } = useSnackbar();

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
          reservationIds: Array.isArray(r.reservation_ids) ? r.reservation_ids.map((id: any) => Number(id)) : [],
          reservationCount: Number(r.reservation_count || 0),
          buyerName: String(r.buyer_name || ''),
          productSummary: String(r.product_summary || ''),
          totalQuantity: Number(r.total_quantity || 0),
          deliveryDate: String(r.delivery_date || ''),
          deliveryHour: Number(r.delivery_hour || 0),
          deliveryFee: Number(r.delivery_fee || 0),
          totalAmount: Number(r.total_amount || 0),
          status: String(r.status || ''),
          phone: String(r.phone || ''),
          postalCode: String(r.postal_code || ''),
          address1: String(r.address1 || ''),
          address2: String(r.address2 || ''),
        }));
        setRows(mapped);
      } catch (e) {
        safeErrorLog(e, 'AdminDeliveriesPage - load');
        show('배달 목록을 불러오는 중 오류가 발생했습니다.', { variant: 'error' });
      }
    };
    load();
  }, [selectedDate, show]);

  const handleStatusChange = async (row: DeliveryRow, next: 'out_for_delivery' | 'delivered' | 'canceled') => {
    try {
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

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <AdminHeader />
        <div className="mt-4 bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-800">🚚 배달 관리</h1>
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
          {/* Desktop table */}
          <div className="mt-4 overflow-x-auto hidden md:block">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2 pr-3">수령시간</th>
                  <th className="py-2 pr-3">상품</th>
                  <th className="py-2 pr-3">주소</th>
                  <th className="py-2 pr-3">휴대폰</th>
                  <th className="py-2 pr-3">주문</th>
                  <th className="py-2 pr-3">금액</th>
                  <th className="py-2 pr-3">상태</th>
                  <th className="py-2 pr-3">관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-gray-500">배달 주문이 없습니다.</td>
                  </tr>
                )}
                {rows.map(r => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 pr-3">
                      <div className="text-base font-semibold text-gray-900">{r.deliveryHour}시 수령 예정</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-base font-semibold text-gray-900">{r.productSummary}</div>
                      <div className="text-xs text-gray-500">{r.totalQuantity}개</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-sm font-medium text-gray-800">{r.postalCode}</div>
                      <div className="text-sm text-gray-700">{r.address1} {r.address2}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-base font-semibold text-gray-900">{r.phone}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-gray-800">#{r.id}</div>
                      <div className="text-xs text-gray-500">예약 {r.reservationCount}건</div>
                      {r.reservationIds.length > 0 && (
                        <div className="text-xs text-gray-400">#{r.reservationIds.join(', #')}</div>
                      )}
                      <div className="text-xs text-gray-500">{r.buyerName}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="text-gray-700">총 {r.totalAmount.toLocaleString()}원</div>
                      <div className="text-xs text-gray-500">배달비 {r.deliveryFee.toLocaleString()}원</div>
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
                          disabled={updatingId === r.id || r.status === 'DELIVERED'}
                        >
                          주문 취소
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
            {rows.length === 0 && (
              <div className="py-6 text-center text-gray-500">배달 주문이 없습니다.</div>
            )}
            {rows.map(r => (
              <div key={r.id} className="bg-white border rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-800">#{r.id}</div>
                    <div className="text-xs text-gray-500">예약 {r.reservationCount}건</div>
                  </div>
                  <span className="text-xs text-gray-500">{getStatusLabel(r.status)}</span>
                </div>
                <div className="mt-2 text-base font-semibold text-gray-900">{r.deliveryHour}시 수령 예정</div>
                <div className="mt-2 text-base font-semibold text-gray-900">{r.productSummary} · {r.totalQuantity}개</div>
                <div className="mt-1 text-sm text-gray-700">{r.address1} {r.address2}</div>
                <div className="mt-1 text-sm text-gray-700">{r.postalCode}</div>
                <div className="mt-2 text-base font-semibold text-gray-900">{r.phone}</div>
                <div className="mt-1 text-xs text-gray-500">{r.buyerName}</div>
                <div className="mt-1 text-sm text-gray-700">총 {r.totalAmount.toLocaleString()}원</div>
                <div className="text-xs text-gray-500">배달비 {r.deliveryFee.toLocaleString()}원</div>
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
                    disabled={updatingId === r.id || r.status === 'DELIVERED'}
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
