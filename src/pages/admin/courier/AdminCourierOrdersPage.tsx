import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  getAdminCourierOrders,
  downloadAdminCourierWaybillExcelByFilter,
  getAdminCourierProducts,
  uploadTracking,
  COURIER_COMPANY_LABELS,
  type AdminCourierOrderSummary,
  type CourierOrderStatus,
  type CourierCompany,
  type TrackingUploadError,
} from '../../../utils/api';

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return dateStr || '-';
  }
};

const STATUS_LABELS: Record<CourierOrderStatus, string> = {
  PENDING_PAYMENT: '결제대기',
  PAID: '결제완료',
  ORDERING: '발주중',
  ORDER_COMPLETED: '발주완료',
  IN_TRANSIT: '배송중',
  DELIVERED: '배송완료',
  CANCELED: '취소',
  FAILED: '결제실패',
};

const STATUS_COLORS: Record<CourierOrderStatus, string> = {
  PENDING_PAYMENT: 'bg-gray-100 text-gray-600 border-gray-300',
  PAID: 'bg-blue-100 text-blue-700 border-blue-300',
  ORDERING: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  ORDER_COMPLETED: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  IN_TRANSIT: 'bg-purple-100 text-purple-700 border-purple-300',
  DELIVERED: 'bg-green-100 text-green-700 border-green-300',
  CANCELED: 'bg-red-100 text-red-600 border-red-300',
  FAILED: 'bg-red-100 text-red-600 border-red-300',
};

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'PAID', label: '결제완료' },
  { value: 'ORDERING', label: '발주중' },
  { value: 'ORDER_COMPLETED', label: '발주완료' },
  { value: 'IN_TRANSIT', label: '배송중' },
  { value: 'DELIVERED', label: '배송완료' },
  { value: 'CANCELED', label: '취소' },
];

export default function AdminCourierOrdersPage() {
  const navigate = useNavigate();
  const { show } = useSnackbar();

  const [orders, setOrders] = useState<AdminCourierOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [filterEndDate, setFilterEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterStatus, setFilterStatus] = useState<string>('PAID');
  const [filterProductId, setFilterProductId] = useState<number | undefined>(undefined);
  const [filterProducts, setFilterProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [filterDownloading, setFilterDownloading] = useState(false);

  // 운송장 업로드
  const [uploadCourierCompany, setUploadCourierCompany] = useState<CourierCompany>('LOGEN');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<TrackingUploadError[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const isInitialMount = useRef(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getAdminCourierProducts();
        if (!res.ok) return;
        const data = await res.json();
        const arr = Array.isArray(data?.response) ? data.response : (Array.isArray(data) ? data : []);
        setFilterProducts(arr.map((p: any) => ({ id: Number(p.id), name: String(p.name ?? '') })));
      } catch {}
    })();
  }, []);

  const handleFilterDownload = async () => {
    if (!filterStartDate || !filterEndDate) {
      show('시작일과 종료일을 입력해주세요.', { variant: 'error' });
      return;
    }
    try {
      setFilterDownloading(true);
      const blob = await downloadAdminCourierWaybillExcelByFilter(filterStartDate, filterEndDate, filterProductId, filterStatus || undefined);
      triggerDownload(blob, `waybill-filter-${filterStartDate}-${filterEndDate}.xlsx`);
      show('필터 Excel 다운로드 완료', { variant: 'success' });
      fetchOrders(statusFilter, currentPage);
    } catch (err) {
      safeErrorLog(err, 'AdminCourierOrdersPage - filterDownload');
      show(getSafeErrorMessage(err, '필터 Excel 다운로드에 실패했습니다.'), { variant: 'error' });
    } finally {
      setFilterDownloading(false);
    }
  };

  const handleUploadTracking = async () => {
    if (!uploadFile) {
      show('업로드할 파일을 선택해주세요.', { variant: 'error' });
      return;
    }
    try {
      setUploading(true);
      setUploadErrors([]);
      const result = await uploadTracking(uploadFile, uploadCourierCompany);
      show(`${result.updatedCount}건 운송장 업로드 완료`, { variant: 'success' });
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      fetchOrders(statusFilter, currentPage);
    } catch (err: any) {
      if (Array.isArray(err?.uploadErrors) && err.uploadErrors.length > 0) {
        setUploadErrors(err.uploadErrors);
        show(err.message || '일부 행에서 오류가 발생했습니다.', { variant: 'error' });
      } else {
        safeErrorLog(err, 'AdminCourierOrdersPage - uploadTracking');
        show(getSafeErrorMessage(err, '운송장 업로드에 실패했습니다.'), { variant: 'error' });
      }
    } finally {
      setUploading(false);
    }
  };

  const fetchOrders = useCallback(async (status?: string, page = 0) => {
    try {
      setLoading(true);
      const result = await getAdminCourierOrders(status || undefined, page, 50);
      setOrders(result.orders);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);
      setCurrentPage(result.currentPage);
    } catch (e) {
      safeErrorLog(e, 'AdminCourierOrdersPage - fetchOrders');
      show(getSafeErrorMessage(e, '주문 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchOrders(statusFilter, 0);
      return;
    }
    fetchOrders(statusFilter, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handlePageChange = (page: number) => {
    if (page < 0 || page >= totalPages) return;
    fetchOrders(statusFilter, page);
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const renderPageButtons = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(0, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible);
    if (end - start < maxVisible) {
      start = Math.max(0, end - maxVisible);
    }
    for (let i = start; i < end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">택배 주문 관리</h1>
            {!loading && (
              <p className="text-sm text-gray-500 mt-1">총 {totalElements}건</p>
            )}
          </div>
          <AdminCourierHeader />
        </div>

        {/* Status filter */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`h-8 px-3 rounded-full text-sm font-medium border transition ${
                statusFilter === opt.value
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 운송장 Excel 다운로드 */}
        <div className="mb-4 bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">운송장 Excel 다운로드</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">시작일</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">종료일</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">상태</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-[100px]"
              >
                <option value="">전체</option>
                <option value="PAID">결제완료</option>
                <option value="ORDERING">발주중</option>
                <option value="ORDER_COMPLETED">발주완료</option>
                <option value="IN_TRANSIT">배송중</option>
                <option value="DELIVERED">배송완료</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">상품</label>
              <select
                value={filterProductId ?? ''}
                onChange={e => setFilterProductId(e.target.value ? Number(e.target.value) : undefined)}
                className="h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-[140px]"
              >
                <option value="">전체 상품</option>
                {filterProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleFilterDownload}
              disabled={filterDownloading || !filterStartDate || !filterEndDate}
              className="h-9 px-4 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {filterDownloading ? '다운로드 중...' : 'Excel 다운로드'}
            </button>
          </div>
        </div>

        {/* 운송장 Excel 업로드 */}
        <div className="mb-4 bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">운송장 Excel 업로드</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">택배사</label>
              <select
                value={uploadCourierCompany}
                onChange={e => setUploadCourierCompany(e.target.value as CourierCompany)}
                className="h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 min-w-[100px]"
              >
                {(Object.entries(COURIER_COMPANY_LABELS) as [CourierCompany, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">파일 선택</label>
              <input
                ref={uploadInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                className="h-9 text-sm file:mr-3 file:py-1.5 file:px-3 file:border-0 file:rounded file:bg-gray-100 file:text-gray-700 file:text-xs file:font-medium hover:file:bg-gray-200 cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={handleUploadTracking}
              disabled={uploading || !uploadFile}
              className="h-9 px-4 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? '업로드 중...' : '업로드'}
            </button>
          </div>
          {uploadErrors.length > 0 && (
            <div className="mt-3 border border-red-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                업로드 오류 ({uploadErrors.length}건)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-600">
                      <th className="px-3 py-2 text-left whitespace-nowrap">행</th>
                      <th className="px-3 py-2 text-left whitespace-nowrap">주문번호</th>
                      <th className="px-3 py-2 text-left">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadErrors.map((err, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="px-3 py-2 text-gray-500">{err.row}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">{err.displayCode || '-'}</td>
                        <td className="px-3 py-2 text-red-600">{err.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Empty */}
        {!loading && orders.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            주문이 없습니다.
          </div>
        )}

        {/* Order table */}
        {!loading && orders.length > 0 && (
          <>
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-3 py-3 text-left whitespace-nowrap">주문번호</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">상태</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">수령인</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">상품요약</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">수량</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">금액</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">운송장</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">결제일</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">주문일</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr
                      key={order.id}
                      className="border-b hover:bg-gray-50 cursor-pointer transition"
                      onClick={() => navigate(`/admin/courier/orders/${order.id}`)}
                    >
                      <td className="px-3 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {order.displayCode}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{order.recipientName}</td>
                      <td className="px-3 py-3 text-gray-700 max-w-[200px] truncate">{order.itemSummary}</td>
                      <td className="px-3 py-3 text-right text-gray-700">{order.itemCount}</td>
                      <td className="px-3 py-3 text-right text-gray-900 font-medium whitespace-nowrap">
                        {formatPrice(order.totalAmount)}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {order.trackingNumber || '-'}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(order.paidAt)}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-4">
                <button
                  type="button"
                  onClick={() => handlePageChange(0)}
                  disabled={currentPage === 0}
                  className="h-8 w-8 rounded border text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &laquo;
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 0}
                  className="h-8 w-8 rounded border text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &lsaquo;
                </button>
                {renderPageButtons().map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePageChange(p)}
                    className={`h-8 w-8 rounded border text-sm font-medium transition ${
                      p === currentPage
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'text-gray-600 hover:bg-gray-100 border-gray-300'
                    }`}
                  >
                    {p + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages - 1}
                  className="h-8 w-8 rounded border text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &rsaquo;
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(totalPages - 1)}
                  disabled={currentPage >= totalPages - 1}
                  className="h-8 w-8 rounded border text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &raquo;
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
