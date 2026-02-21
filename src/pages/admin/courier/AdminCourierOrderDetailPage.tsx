import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  getAdminCourierOrder,
  updateAdminCourierOrderStatus,
  shipAdminCourierOrder,
  cancelAdminCourierOrder,
  downloadAdminCourierWaybillExcel,
  type AdminCourierOrderDetailResponse,
  type CourierOrderStatus,
} from '../../../utils/api';

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
    return dateStr || '-';
  }
};

const STATUS_LABELS: Record<CourierOrderStatus, string> = {
  PENDING_PAYMENT: '결제대기',
  PAID: '결제완료',
  PREPARING: '준비중',
  SHIPPED: '발송완료',
  IN_TRANSIT: '배송중',
  DELIVERED: '배송완료',
  CANCELED: '취소',
  FAILED: '결제실패',
};

const STATUS_COLORS: Record<CourierOrderStatus, string> = {
  PENDING_PAYMENT: 'bg-gray-100 text-gray-600 border-gray-300',
  PAID: 'bg-blue-100 text-blue-700 border-blue-300',
  PREPARING: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  SHIPPED: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  IN_TRANSIT: 'bg-purple-100 text-purple-700 border-purple-300',
  DELIVERED: 'bg-green-100 text-green-700 border-green-300',
  CANCELED: 'bg-red-100 text-red-600 border-red-300',
  FAILED: 'bg-red-100 text-red-600 border-red-300',
};

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return IMG_BASE ? `${IMG_BASE}/${url}` : url;
};

export default function AdminCourierOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { show } = useSnackbar();

  const [order, setOrder] = useState<AdminCourierOrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Ship modal
  const [shipModal, setShipModal] = useState(false);
  const [waybillInput, setWaybillInput] = useState('');

  // Cancel confirm modal
  const [cancelModal, setCancelModal] = useState(false);

  const suppressNextPop = useRef(false);

  const pushDialogState = () => {
    window.history.pushState({ modal: true }, '');
  };

  const programmaticCloseDialog = () => {
    suppressNextPop.current = true;
    window.history.back();
  };

  useEffect(() => {
    const onPop = () => {
      if (suppressNextPop.current) {
        suppressNextPop.current = false;
        return;
      }
      if (shipModal || cancelModal) {
        setShipModal(false);
        setCancelModal(false);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [shipModal, cancelModal]);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getAdminCourierOrder(Number(id));
      setOrder(data);
    } catch (e) {
      safeErrorLog(e, 'AdminCourierOrderDetailPage - fetch');
      show(getSafeErrorMessage(e, '주문 상세를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [id, show]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;
    try {
      setActionLoading(true);
      await updateAdminCourierOrderStatus(order.id, newStatus);
      show('주문 상태가 변경되었습니다.', { variant: 'success' });
      await fetchOrder();
    } catch (e) {
      safeErrorLog(e, 'AdminCourierOrderDetailPage - statusChange');
      show(getSafeErrorMessage(e, '상태 변경에 실패했습니다.'), { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleShip = async () => {
    if (!order) return;
    const trimmed = waybillInput.trim();
    if (!trimmed) {
      show('운송장 번호를 입력해주세요.', { variant: 'error' });
      return;
    }
    try {
      setActionLoading(true);
      await shipAdminCourierOrder(order.id, trimmed);
      show('발송 처리가 완료되었습니다.', { variant: 'success' });
      setShipModal(false);
      programmaticCloseDialog();
      setWaybillInput('');
      await fetchOrder();
    } catch (e) {
      safeErrorLog(e, 'AdminCourierOrderDetailPage - ship');
      show(getSafeErrorMessage(e, '발송 처리에 실패했습니다.'), { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    try {
      setActionLoading(true);
      await cancelAdminCourierOrder(order.id);
      show('주문이 취소되었습니다.', { variant: 'success' });
      setCancelModal(false);
      programmaticCloseDialog();
      await fetchOrder();
    } catch (e) {
      safeErrorLog(e, 'AdminCourierOrderDetailPage - cancel');
      show(getSafeErrorMessage(e, '주문 취소에 실패했습니다.'), { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!order) return;
    try {
      const blob = await downloadAdminCourierWaybillExcel(order.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waybill-${order.id}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      show('Excel 다운로드 완료', { variant: 'success' });
    } catch (e) {
      safeErrorLog(e, 'AdminCourierOrderDetailPage - excel');
      show(getSafeErrorMessage(e, 'Excel 다운로드에 실패했습니다.'), { variant: 'error' });
    }
  };

  // Determine which status transition buttons to show
  const canPrepare = order?.status === 'PAID';
  const canShip = order?.status === 'PREPARING';
  const canInTransit = order?.status === 'SHIPPED';
  const canDeliver = order?.status === 'IN_TRANSIT';
  const canCancel = order?.status === 'PAID' || order?.status === 'PREPARING';

  const trackingUrl = order?.trackingNumber
    ? `https://www.ilogen.com/web/personal/trace/${order.trackingNumber}`
    : null;

  if (loading) {
    return (
      <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto text-center py-20">
          <p className="text-gray-500">주문 정보를 찾을 수 없습니다.</p>
          <button
            type="button"
            onClick={() => navigate('/admin/courier/orders')}
            className="mt-4 h-10 px-6 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
          >
            주문 목록으로 이동
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/courier/orders')}
              className="h-9 px-3 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 transition"
            >
              &larr; 목록
            </button>
            <h1 className="text-xl font-bold text-gray-800">주문 상세</h1>
          </div>
          <AdminCourierHeader />
        </div>

        {/* Order info card */}
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-500">주문번호</span>
              <span className="ml-2 font-mono text-sm text-gray-800">{order.displayCode}</span>
            </div>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium border ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            주문일: {formatDateTime(order.createdAt)}
            {order.paidAt && <span className="ml-4">결제일: {formatDateTime(order.paidAt)}</span>}
          </div>
        </div>

        {/* Recipient info */}
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">수령인 정보</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">이름:</span>
              <span className="ml-2 text-gray-800">{order.recipientName}</span>
            </div>
            <div>
              <span className="text-gray-500">연락처:</span>
              <span className="ml-2 text-gray-800">{order.recipientPhone}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500">주소:</span>
              <span className="ml-2 text-gray-800">({order.postalCode}) {order.address1} {order.address2}</span>
            </div>
            {order.deliveryMemo && (
              <div className="sm:col-span-2">
                <span className="text-gray-500">배송메모:</span>
                <span className="ml-2 text-gray-800">{order.deliveryMemo}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">도서산간:</span>
              <span className={`ml-2 font-medium ${order.isRemoteArea ? 'text-orange-600' : 'text-gray-600'}`}>
                {order.isRemoteArea ? '예' : '아니오'}
              </span>
            </div>
          </div>
        </div>

        {/* Product list */}
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">주문 상품</h2>
          <div className="space-y-3">
            {order.items.map((item, idx) => (
              <div key={`${item.courierProductId}-${idx}`} className="flex gap-3 items-center">
                {item.imageUrl && (
                  <img
                    src={addImgPrefix(item.imageUrl)}
                    alt={item.productName}
                    className="w-14 h-14 object-cover rounded border flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{item.productName}</div>
                  <div className="text-xs text-gray-500">
                    {formatPrice(item.unitPrice)} x {item.quantity}
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-900 flex-shrink-0">
                  {formatPrice(item.subtotal)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment info */}
        <div className="bg-white rounded-lg shadow p-5">
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

        {/* Shipping info */}
        {(order.courierCompany || order.trackingNumber || order.shippedAt || order.deliveredAt) && (
          <div className="bg-white rounded-lg shadow p-5">
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
                  <span className="font-mono">{order.trackingNumber}</span>
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
                  로젠 배송 추적
                </a>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-3">상태 관리</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleStatusChange('PREPARING')}
              disabled={!canPrepare || actionLoading}
              className="h-9 px-4 rounded-lg bg-yellow-500 text-white text-sm font-medium hover:bg-yellow-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              준비중
            </button>
            <button
              type="button"
              onClick={() => {
                setShipModal(true);
                pushDialogState();
              }}
              disabled={!canShip || actionLoading}
              className="h-9 px-4 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              발송처리
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange('IN_TRANSIT')}
              disabled={!canInTransit || actionLoading}
              className="h-9 px-4 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              배송중
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange('DELIVERED')}
              disabled={!canDeliver || actionLoading}
              className="h-9 px-4 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              배송완료
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="h-9 px-4 rounded-lg border border-green-600 text-green-700 text-sm font-medium hover:bg-green-50 transition"
            >
              운송장 Excel
            </button>
            <button
              type="button"
              onClick={() => {
                setCancelModal(true);
                pushDialogState();
              }}
              disabled={!canCancel || actionLoading}
              className="h-9 px-4 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              주문취소
            </button>
          </div>
        </div>
      </div>

      {/* Ship modal */}
      {shipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">발송처리</h3>
            <p className="text-sm text-gray-600 mb-4">운송장 번호를 입력해주세요.</p>
            <input
              type="text"
              value={waybillInput}
              onChange={e => setWaybillInput(e.target.value)}
              placeholder="운송장 번호"
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleShip();
              }}
            />
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => {
                  setShipModal(false);
                  setWaybillInput('');
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleShip}
                disabled={actionLoading || !waybillInput.trim()}
                className="flex-1 h-10 rounded bg-indigo-500 text-white font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? '처리중...' : '발송'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">주문 취소</h3>
            <p className="text-gray-600 mb-2">
              주문번호 <span className="font-mono font-medium">{order.displayCode}</span>
            </p>
            <p className="text-sm text-red-600 mb-6">이 주문을 취소하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCancelModal(false);
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                돌아가기
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={actionLoading}
                className="flex-1 h-10 rounded bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {actionLoading ? '처리중...' : '주문 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
