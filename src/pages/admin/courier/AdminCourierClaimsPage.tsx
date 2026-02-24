import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  getAdminCourierClaims,
  approveAdminCourierClaim,
  rejectAdminCourierClaim,
  updateClaimOrderStatus,
  type AdminCourierClaimSummary,
  type CourierClaimStatus,
  type CourierClaimType,
} from '../../../utils/api';

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
    return dateStr;
  }
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const CLAIM_TYPE_LABELS: Record<CourierClaimType, string> = {
  QUALITY_ISSUE: '품질문제',
  CHANGE_OF_MIND: '단순변심',
};

const STATUS_LABELS: Record<CourierClaimStatus, string> = {
  REQUESTED: '접수',
  IN_REVIEW: '검토중',
  APPROVED: '승인',
  REJECTED: '거부',
  RESOLVED: '처리완료',
};

const STATUS_COLORS: Record<CourierClaimStatus, string> = {
  REQUESTED: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  IN_REVIEW: 'bg-blue-100 text-blue-700 border-blue-300',
  APPROVED: 'bg-green-100 text-green-700 border-green-300',
  REJECTED: 'bg-red-100 text-red-600 border-red-300',
  RESOLVED: 'bg-gray-100 text-gray-600 border-gray-300',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: '결제대기',
  PAID: '결제완료',
  PREPARING: '상품준비중',
  SHIPPED: '발송완료',
  IN_TRANSIT: '배송중',
  DELIVERED: '배송완료',
  CANCELED: '주문취소',
  FAILED: '결제실패',
};

const ORDER_STATUS_CHANGE_OPTIONS = [
  { value: 'PREPARING', label: '상품준비중' },
  { value: 'SHIPPED', label: '발송완료' },
  { value: 'IN_TRANSIT', label: '배송중' },
  { value: 'DELIVERED', label: '배송완료' },
  { value: 'CANCELED', label: '주문취소' },
];

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'REQUESTED', label: '접수' },
  { value: 'IN_REVIEW', label: '검토중' },
  { value: 'APPROVED', label: '승인' },
  { value: 'REJECTED', label: '거부' },
  { value: 'RESOLVED', label: '처리완료' },
];

const TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'QUALITY_ISSUE', label: '품질문제' },
  { value: 'CHANGE_OF_MIND', label: '단순변심' },
];

type ModalMode = 'approve' | 'reject' | null;

export default function AdminCourierClaimsPage() {
  const { show } = useSnackbar();

  const [claims, setClaims] = useState<AdminCourierClaimSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);

  // Detail expand
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Order status change per expanded row
  const [orderStatusSelections, setOrderStatusSelections] = useState<Record<number, string>>({});
  const [orderStatusSubmitting, setOrderStatusSubmitting] = useState<number | null>(null);

  // Action modal
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalClaim, setModalClaim] = useState<AdminCourierClaimSummary | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const isInitialMount = useRef(true);

  const fetchClaims = useCallback(async (status?: string, page = 0) => {
    try {
      setLoading(true);
      const result = await getAdminCourierClaims(status || undefined, page, 50);
      setClaims(result.claims);
      setTotalPages(result.totalPages);
      setTotalElements(result.totalElements);
      setCurrentPage(result.currentPage);
    } catch (e) {
      safeErrorLog(e, 'AdminCourierClaimsPage - fetchClaims');
      show(getSafeErrorMessage(e, '클레임 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchClaims(statusFilter, 0);
      return;
    }
    fetchClaims(statusFilter, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handlePageChange = (page: number) => {
    if (page < 0 || page >= totalPages) return;
    fetchClaims(statusFilter, page);
  };

  const openModal = (claim: AdminCourierClaimSummary, mode: ModalMode) => {
    setModalClaim(claim);
    setModalMode(mode);
    setAdminNote('');
    setRefundAmount('');
  };

  const closeModal = () => {
    setModalMode(null);
    setModalClaim(null);
    setAdminNote('');
    setRefundAmount('');
  };

  const handleApprove = async () => {
    if (!modalClaim) return;
    if (!adminNote.trim()) {
      show('관리자 메모를 입력해주세요.', { variant: 'error' });
      return;
    }
    try {
      setActionSubmitting(true);
      await approveAdminCourierClaim(modalClaim.id, {
        action: 'REFUND',
        adminNote: adminNote.trim(),
        refundAmount: refundAmount ? Number(refundAmount) : undefined,
      });
      show('클레임이 승인(환불) 처리되었습니다.', { variant: 'success' });
      closeModal();
      fetchClaims(statusFilter, currentPage);
    } catch (err) {
      safeErrorLog(err, 'AdminCourierClaimsPage - approveAdminCourierClaim');
      show(getSafeErrorMessage(err, '클레임 승인에 실패했습니다.'), { variant: 'error' });
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!modalClaim) return;
    if (!adminNote.trim()) {
      show('관리자 메모를 입력해주세요.', { variant: 'error' });
      return;
    }
    try {
      setActionSubmitting(true);
      await rejectAdminCourierClaim(modalClaim.id, adminNote.trim());
      show('클레임이 거부 처리되었습니다.', { variant: 'success' });
      closeModal();
      fetchClaims(statusFilter, currentPage);
    } catch (err) {
      safeErrorLog(err, 'AdminCourierClaimsPage - rejectAdminCourierClaim');
      show(getSafeErrorMessage(err, '클레임 거부에 실패했습니다.'), { variant: 'error' });
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleOrderStatusChange = async (claim: AdminCourierClaimSummary) => {
    const selectedStatus = orderStatusSelections[claim.id];
    if (!selectedStatus) {
      show('변경할 상태를 선택해주세요.', { variant: 'error' });
      return;
    }
    try {
      setOrderStatusSubmitting(claim.id);
      await updateClaimOrderStatus(claim.id, selectedStatus);
      show('주문 상태가 변경되었습니다.', { variant: 'success' });
      fetchClaims(statusFilter, currentPage);
    } catch (err) {
      safeErrorLog(err, 'AdminCourierClaimsPage - updateClaimOrderStatus');
      show(getSafeErrorMessage(err, '주문 상태 변경에 실패했습니다.'), { variant: 'error' });
    } finally {
      setOrderStatusSubmitting(null);
    }
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

  const canTakeAction = (status: CourierClaimStatus) =>
    status === 'REQUESTED' || status === 'IN_REVIEW';

  const filteredClaims = claims.filter(c => !typeFilter || c.claimType === typeFilter);

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">CS/클레임 관리</h1>
            {!loading && (
              <p className="text-sm text-gray-500 mt-1">총 {totalElements}건</p>
            )}
          </div>
          <AdminCourierHeader />
        </div>

        {/* Status filter */}
        <div className="mb-2 flex items-center gap-2 flex-wrap">
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

        {/* Claim type filter */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {TYPE_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTypeFilter(opt.value)}
              className={`h-8 px-3 rounded-full text-sm font-medium border transition ${
                typeFilter === opt.value
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Empty */}
        {!loading && filteredClaims.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            클레임이 없습니다.
          </div>
        )}

        {/* Claims table */}
        {!loading && filteredClaims.length > 0 && (
          <>
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-3 py-3 text-left whitespace-nowrap">ID</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">주문번호</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">상품명</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">유형</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">상태</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">접수일</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">처리일</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">주문상태</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.map(claim => (
                    <React.Fragment key={claim.id}>
                      <tr
                        className="border-b hover:bg-gray-50 cursor-pointer transition"
                        onClick={() => setExpandedId(expandedId === claim.id ? null : claim.id)}
                      >
                        <td className="px-3 py-3 text-gray-700">{claim.id}</td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                          {claim.displayCode}
                        </td>
                        <td className="px-3 py-3 text-gray-700 max-w-[180px] truncate">
                          {claim.productName || '-'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium ${
                            claim.claimType === 'QUALITY_ISSUE' ? 'text-red-600' : 'text-blue-600'
                          }`}>
                            {CLAIM_TYPE_LABELS[claim.claimType] || claim.claimType}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${STATUS_COLORS[claim.status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                            {STATUS_LABELS[claim.status] || claim.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(claim.createdAt)}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(claim.resolvedAt)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {claim.orderStatus ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-indigo-50 text-indigo-700 border-indigo-200">
                              {ORDER_STATUS_LABELS[claim.orderStatus] || claim.orderStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          {canTakeAction(claim.status) && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => openModal(claim, 'approve')}
                                className="h-7 px-2 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition"
                              >
                                승인
                              </button>
                              <button
                                type="button"
                                onClick={() => openModal(claim, 'reject')}
                                className="h-7 px-2 rounded text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition"
                              >
                                거부
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {/* Expanded detail row */}
                      {expandedId === claim.id && (
                        <tr className="bg-gray-50">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="space-y-2 text-sm">
                              <div className="flex gap-2">
                                <span className="text-gray-500 w-20 flex-shrink-0">사유</span>
                                <span className="text-gray-800 whitespace-pre-wrap">{claim.reason}</span>
                              </div>
                              {claim.adminNote && (
                                <div className="flex gap-2">
                                  <span className="text-gray-500 w-20 flex-shrink-0">관리자 메모</span>
                                  <span className="text-gray-800 whitespace-pre-wrap">{claim.adminNote}</span>
                                </div>
                              )}
                              {claim.action && (
                                <div className="flex gap-2">
                                  <span className="text-gray-500 w-20 flex-shrink-0">처리 방법</span>
                                  <span className="text-gray-800">
                                    {claim.action === 'REFUND' ? '환불' : claim.action === 'RESHIP' ? '재발송' : claim.action}
                                  </span>
                                </div>
                              )}
                              {claim.refundAmount != null && (
                                <div className="flex gap-2">
                                  <span className="text-gray-500 w-20 flex-shrink-0">환불 금액</span>
                                  <span className="text-gray-800 font-medium">{formatPrice(claim.refundAmount)}</span>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <span className="text-gray-500 w-20 flex-shrink-0">접수 일시</span>
                                <span className="text-gray-800">{formatDateTime(claim.createdAt)}</span>
                              </div>
                              {claim.resolvedAt && (
                                <div className="flex gap-2">
                                  <span className="text-gray-500 w-20 flex-shrink-0">처리 일시</span>
                                  <span className="text-gray-800">{formatDateTime(claim.resolvedAt)}</span>
                                </div>
                              )}

                              {/* Order status change */}
                              <div className="pt-2 border-t border-gray-200">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500 w-20 flex-shrink-0">주문 상태 변경</span>
                                  <select
                                    value={orderStatusSelections[claim.id] ?? ''}
                                    onChange={e => setOrderStatusSelections(prev => ({ ...prev, [claim.id]: e.target.value }))}
                                    className="h-8 border border-gray-300 rounded px-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <option value="">상태 선택</option>
                                    {ORDER_STATUS_CHANGE_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); handleOrderStatusChange(claim); }}
                                    disabled={orderStatusSubmitting === claim.id || !orderStatusSelections[claim.id]}
                                    className="h-8 px-3 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {orderStatusSubmitting === claim.id ? '변경 중...' : '상태 변경'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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

      {/* Action Modal */}
      {modalMode && modalClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              {modalMode === 'approve' ? '클레임 승인 (환불)' : '클레임 거부'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              주문 {modalClaim.displayCode} - {CLAIM_TYPE_LABELS[modalClaim.claimType]}
            </p>

            {/* Claim reason preview */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <div className="text-xs text-gray-500 mb-1">고객 사유</div>
              <div className="text-gray-800 whitespace-pre-wrap">{modalClaim.reason}</div>
            </div>

            {/* Refund amount (approve only) */}
            {modalMode === 'approve' && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  환불 금액 (선택)
                </label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder="미입력 시 전액 환불"
                  className="w-full h-10 border border-gray-300 rounded-lg px-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                />
              </div>
            )}

            {/* Admin note */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                관리자 메모 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder={modalMode === 'approve' ? '승인 사유를 입력해주세요.' : '거부 사유를 입력해주세요.'}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={actionSubmitting}
                className="flex-1 h-10 rounded-lg border border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={modalMode === 'approve' ? handleApprove : handleReject}
                disabled={actionSubmitting || !adminNote.trim()}
                className={`flex-1 h-10 rounded-lg text-sm font-medium text-white transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  modalMode === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {actionSubmitting
                  ? '처리 중...'
                  : modalMode === 'approve' ? '승인 처리' : '거부 처리'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
