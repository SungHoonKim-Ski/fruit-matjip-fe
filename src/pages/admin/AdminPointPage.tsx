import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSnackbar } from '../../components/snackbar';
import AdminCourierHeader from '../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import {
  getAdminPointUsers,
  getAdminPointUserHistory,
  issueAdminPoints,
  deductAdminPoints,
  bulkIssueAdminPoints,
  type AdminPointUserResponse,
  type PointTransactionResponse,
  type PointTransactionType,
} from '../../utils/api';

const formatDateTime = (dateStr: string) => {
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

const formatAmount = (amount: number) =>
  amount.toLocaleString('ko-KR') + '원';

const POINT_TYPE_LABELS: Record<PointTransactionType, string> = {
  EARN_CS: 'CS 적립',
  EARN_ADMIN: '관리자 적립',
  USE_COURIER: '택배 사용',
  USE_STORE: '매장 사용',
  CANCEL_EARN: '적립 취소',
  CANCEL_USE: '사용 취소',
};

const POINT_TYPE_COLORS: Record<PointTransactionType, string> = {
  EARN_CS: 'text-blue-600',
  EARN_ADMIN: 'text-green-600',
  USE_COURIER: 'text-red-600',
  USE_STORE: 'text-red-600',
  CANCEL_EARN: 'text-gray-500',
  CANCEL_USE: 'text-gray-500',
};

type UserRow = AdminPointUserResponse & {
  selected: boolean;
  expanded: boolean;
  history: PointTransactionResponse[];
  historyPage: number;
  historyTotalPages: number;
  historyLoading: boolean;
};

type BulkModalState = {
  open: boolean;
  target: 'all' | 'selected';
  amount: string;
  description: string;
  loading: boolean;
  result: { successCount: number; failCount: number; totalAmount: number } | null;
};

type IndividualForm = {
  amount: string;
  description: string;
};

export default function AdminPointPage() {
  const { show } = useSnackbar();
  const initialized = useRef(false);

  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [issueForms, setIssueForms] = useState<Record<string, IndividualForm>>({});
  const [deductForms, setDeductForms] = useState<Record<string, IndividualForm>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const [bulkModal, setBulkModal] = useState<BulkModalState>({
    open: false,
    target: 'all',
    amount: '',
    description: '',
    loading: false,
    result: null,
  });

  const fetchUsers = useCallback(async (kw: string) => {
    setLoading(true);
    try {
      const data = await getAdminPointUsers(kw);
      setUsers(data.map((u) => ({
        ...u,
        selected: false,
        expanded: false,
        history: [],
        historyPage: 0,
        historyTotalPages: 1,
        historyLoading: false,
      })));
    } catch (e) {
      safeErrorLog(e);
      show(getSafeErrorMessage(e, '사용자 목록을 불러오는데 실패했습니다.'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchUsers('');
  }, [fetchUsers]);

  const handleSearch = () => {
    setKeyword(searchInput);
    fetchUsers(searchInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  const allSelected = users.length > 0 && users.every((u) => u.selected);
  const someSelected = users.some((u) => u.selected);
  const selectedUids = users.filter((u) => u.selected).map((u) => u.uid);

  const toggleSelectAll = () => {
    setUsers((prev) => prev.map((u) => ({ ...u, selected: !allSelected })));
  };

  const toggleSelect = (uid: string) => {
    setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, selected: !u.selected } : u));
  };

  const fetchHistory = useCallback(async (uid: string, page: number) => {
    setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, historyLoading: true } : u));
    try {
      const data = await getAdminPointUserHistory(uid, page, 10);
      setUsers((prev) => prev.map((u) =>
        u.uid === uid
          ? { ...u, history: data.transactions, historyPage: data.currentPage, historyTotalPages: data.totalPages, historyLoading: false }
          : u
      ));
    } catch (e) {
      safeErrorLog(e);
      show(getSafeErrorMessage(e, '포인트 내역을 불러오는데 실패했습니다.'), { variant: 'error' });
      setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, historyLoading: false } : u));
    }
  }, [show]);

  const toggleExpand = (uid: string) => {
    setUsers((prev) => {
      const updated = prev.map((u) => {
        if (u.uid !== uid) return u;
        const willExpand = !u.expanded;
        return { ...u, expanded: willExpand };
      });
      const user = updated.find((u) => u.uid === uid);
      if (user && user.expanded && user.history.length === 0) {
        fetchHistory(uid, 0);
      }
      return updated;
    });
  };

  const getIssueForm = (uid: string): IndividualForm =>
    issueForms[uid] ?? { amount: '', description: '' };

  const getDeductForm = (uid: string): IndividualForm =>
    deductForms[uid] ?? { amount: '', description: '' };

  const updateIssueForm = (uid: string, field: keyof IndividualForm, value: string) => {
    setIssueForms((prev) => ({ ...prev, [uid]: { ...getIssueForm(uid), [field]: value } }));
  };

  const updateDeductForm = (uid: string, field: keyof IndividualForm, value: string) => {
    setDeductForms((prev) => ({ ...prev, [uid]: { ...getDeductForm(uid), [field]: value } }));
  };

  const handleIssue = async (uid: string) => {
    const form = getIssueForm(uid);
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { show('유효한 금액을 입력해주세요.', { variant: 'error' }); return; }
    if (!form.description.trim()) { show('사유를 입력해주세요.', { variant: 'error' }); return; }

    setActionLoading((prev) => ({ ...prev, [`issue_${uid}`]: true }));
    try {
      await issueAdminPoints(uid, amount, form.description.trim());
      show('포인트가 적립되었습니다.', { variant: 'success' });
      setIssueForms((prev) => ({ ...prev, [uid]: { amount: '', description: '' } }));
      // 잔액 갱신
      const updated = await getAdminPointUsers(keyword);
      setUsers((prev) => prev.map((u) => {
        const found = updated.find((r) => r.uid === u.uid);
        return found ? { ...u, pointBalance: found.pointBalance } : u;
      }));
      // 내역 갱신
      fetchHistory(uid, 0);
    } catch (e) {
      safeErrorLog(e);
      show(getSafeErrorMessage(e, '포인트 적립에 실패했습니다.'), { variant: 'error' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`issue_${uid}`]: false }));
    }
  };

  const handleDeduct = async (uid: string) => {
    const form = getDeductForm(uid);
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { show('유효한 금액을 입력해주세요.', { variant: 'error' }); return; }
    if (!form.description.trim()) { show('사유를 입력해주세요.', { variant: 'error' }); return; }

    setActionLoading((prev) => ({ ...prev, [`deduct_${uid}`]: true }));
    try {
      await deductAdminPoints(uid, amount, form.description.trim());
      show('포인트가 차감되었습니다.', { variant: 'success' });
      setDeductForms((prev) => ({ ...prev, [uid]: { amount: '', description: '' } }));
      const updated = await getAdminPointUsers(keyword);
      setUsers((prev) => prev.map((u) => {
        const found = updated.find((r) => r.uid === u.uid);
        return found ? { ...u, pointBalance: found.pointBalance } : u;
      }));
      fetchHistory(uid, 0);
    } catch (e) {
      safeErrorLog(e);
      show(getSafeErrorMessage(e, '포인트 차감에 실패했습니다.'), { variant: 'error' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`deduct_${uid}`]: false }));
    }
  };

  const openBulkModal = () => {
    setBulkModal({
      open: true,
      target: someSelected ? 'selected' : 'all',
      amount: '',
      description: '',
      loading: false,
      result: null,
    });
  };

  const closeBulkModal = () => {
    setBulkModal((prev) => ({ ...prev, open: false, result: null }));
  };

  const handleBulkIssue = async () => {
    const amount = Number(bulkModal.amount);
    if (!amount || amount <= 0) { show('유효한 금액을 입력해주세요.', { variant: 'error' }); return; }
    if (!bulkModal.description.trim()) { show('사유를 입력해주세요.', { variant: 'error' }); return; }
    if (bulkModal.target === 'selected' && selectedUids.length === 0) {
      show('선택된 사용자가 없습니다.', { variant: 'error' }); return;
    }

    setBulkModal((prev) => ({ ...prev, loading: true }));
    try {
      const result = await bulkIssueAdminPoints(
        bulkModal.target === 'selected' ? selectedUids : [],
        bulkModal.target === 'all',
        amount,
        bulkModal.description.trim(),
      );
      setBulkModal((prev) => ({ ...prev, loading: false, result }));
      // 잔액 갱신
      const updated = await getAdminPointUsers(keyword);
      setUsers((prev) => prev.map((u) => {
        const found = updated.find((r) => r.uid === u.uid);
        return found ? { ...u, pointBalance: found.pointBalance } : u;
      }));
    } catch (e) {
      safeErrorLog(e);
      show(getSafeErrorMessage(e, '일괄 포인트 지급에 실패했습니다.'), { variant: 'error' });
      setBulkModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminCourierHeader />
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">포인트 관리</h1>
          <button
            onClick={openBulkModal}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            포인트 지급
          </button>
        </div>

        {/* 검색 */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="이름 또는 UID 검색"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-700 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            검색
          </button>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* 테이블 헤더 */}
          <div className="grid grid-cols-[40px_1fr_140px_160px] gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 cursor-pointer"
              />
            </div>
            <div>이름</div>
            <div className="text-right">포인트 잔액</div>
            <div className="text-center">작업</div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">검색 결과가 없습니다.</div>
          ) : (
            users.map((user) => (
              <div key={user.uid} className="border-b border-gray-100 last:border-b-0">
                {/* 사용자 행 */}
                <div className="grid grid-cols-[40px_1fr_140px_160px] gap-2 px-4 py-3 items-center hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={user.selected}
                      onChange={() => toggleSelect(user.uid)}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </div>
                  <div>
                    <button
                      onClick={() => toggleExpand(user.uid)}
                      className="text-sm font-medium text-gray-800 hover:text-blue-600 transition-colors text-left"
                    >
                      {user.name}
                      <span className="ml-1 text-gray-400 text-xs">{user.expanded ? '▲' : '▼'}</span>
                    </button>
                    <div className="text-xs text-gray-400 mt-0.5 font-mono">{user.uid}</div>
                  </div>
                  <div className="text-right text-sm font-semibold text-gray-700">
                    {formatAmount(user.pointBalance)}
                  </div>
                  <div className="flex gap-1 justify-center">
                    <button
                      onClick={() => toggleExpand(user.uid)}
                      className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors"
                    >
                      적립
                    </button>
                    <button
                      onClick={() => toggleExpand(user.uid)}
                      className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
                    >
                      차감
                    </button>
                  </div>
                </div>

                {/* 펼쳐진 패널 */}
                {user.expanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 space-y-4">
                    {/* 적립/차감 폼 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* 적립 */}
                      <div className="bg-white rounded-lg border border-green-200 p-3">
                        <h3 className="text-xs font-semibold text-green-700 mb-2">포인트 적립</h3>
                        <div className="space-y-2">
                          <input
                            type="number"
                            min="1"
                            placeholder="금액 (원)"
                            value={getIssueForm(user.uid).amount}
                            onChange={(e) => updateIssueForm(user.uid, 'amount', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-400"
                          />
                          <input
                            type="text"
                            placeholder="사유"
                            value={getIssueForm(user.uid).description}
                            onChange={(e) => updateIssueForm(user.uid, 'description', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-400"
                          />
                          <button
                            onClick={() => handleIssue(user.uid)}
                            disabled={actionLoading[`issue_${user.uid}`]}
                            className="w-full py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading[`issue_${user.uid}`] ? '처리 중...' : '적립하기'}
                          </button>
                        </div>
                      </div>

                      {/* 차감 */}
                      <div className="bg-white rounded-lg border border-red-200 p-3">
                        <h3 className="text-xs font-semibold text-red-600 mb-2">포인트 차감</h3>
                        <div className="space-y-2">
                          <input
                            type="number"
                            min="1"
                            placeholder="금액 (원)"
                            value={getDeductForm(user.uid).amount}
                            onChange={(e) => updateDeductForm(user.uid, 'amount', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
                          />
                          <input
                            type="text"
                            placeholder="사유"
                            value={getDeductForm(user.uid).description}
                            onChange={(e) => updateDeductForm(user.uid, 'description', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-400"
                          />
                          <button
                            onClick={() => handleDeduct(user.uid)}
                            disabled={actionLoading[`deduct_${user.uid}`]}
                            className="w-full py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading[`deduct_${user.uid}`] ? '처리 중...' : '차감하기'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 포인트 내역 */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 mb-2">포인트 내역</h3>
                      {user.historyLoading ? (
                        <div className="text-center py-4 text-sm text-gray-400">불러오는 중...</div>
                      ) : user.history.length === 0 ? (
                        <div className="text-center py-4 text-sm text-gray-400">내역이 없습니다.</div>
                      ) : (
                        <>
                          <div className="overflow-x-auto rounded border border-gray-200">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-100 text-gray-500">
                                  <th className="px-3 py-2 text-left font-semibold">유형</th>
                                  <th className="px-3 py-2 text-right font-semibold">금액</th>
                                  <th className="px-3 py-2 text-right font-semibold">잔액</th>
                                  <th className="px-3 py-2 text-left font-semibold">사유</th>
                                  <th className="px-3 py-2 text-left font-semibold">일시</th>
                                </tr>
                              </thead>
                              <tbody>
                                {user.history.map((tx) => (
                                  <tr key={tx.id} className="border-t border-gray-100 hover:bg-white transition-colors">
                                    <td className={`px-3 py-2 font-medium ${POINT_TYPE_COLORS[tx.type] ?? 'text-gray-600'}`}>
                                      {POINT_TYPE_LABELS[tx.type] ?? tx.type}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-semibold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {tx.amount >= 0 ? '+' : ''}{formatAmount(tx.amount)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-600">{formatAmount(tx.balanceAfter)}</td>
                                    <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate">{tx.description}</td>
                                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{formatDateTime(tx.createdAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* 페이지네이션 */}
                          {user.historyTotalPages > 1 && (
                            <div className="flex justify-center gap-2 mt-2">
                              <button
                                onClick={() => fetchHistory(user.uid, user.historyPage - 1)}
                                disabled={user.historyPage === 0}
                                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100 transition-colors"
                              >
                                이전
                              </button>
                              <span className="px-2 py-1 text-xs text-gray-500">
                                {user.historyPage + 1} / {user.historyTotalPages}
                              </span>
                              <button
                                onClick={() => fetchHistory(user.uid, user.historyPage + 1)}
                                disabled={user.historyPage >= user.historyTotalPages - 1}
                                className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100 transition-colors"
                              >
                                다음
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 선택 정보 */}
        {someSelected && (
          <div className="mt-3 text-sm text-gray-500">
            {selectedUids.length}명 선택됨
          </div>
        )}
      </div>

      {/* 일괄 포인트 지급 모달 */}
      {bulkModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">포인트 일괄 지급</h2>

            {bulkModal.result ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                  <div className="font-semibold mb-1">지급 완료</div>
                  <div>성공: {bulkModal.result.successCount}명</div>
                  <div>실패: {bulkModal.result.failCount}명</div>
                  <div>총 지급액: {formatAmount(bulkModal.result.totalAmount)}</div>
                </div>
                <button
                  onClick={closeBulkModal}
                  className="w-full py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
                >
                  닫기
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 대상 선택 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">지급 대상</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        checked={bulkModal.target === 'all'}
                        onChange={() => setBulkModal((prev) => ({ ...prev, target: 'all' }))}
                        className="w-4 h-4"
                      />
                      전체 고객
                    </label>
                    <label className={`flex items-center gap-2 text-sm cursor-pointer ${!someSelected ? 'opacity-40' : ''}`}>
                      <input
                        type="radio"
                        checked={bulkModal.target === 'selected'}
                        onChange={() => setBulkModal((prev) => ({ ...prev, target: 'selected' }))}
                        disabled={!someSelected}
                        className="w-4 h-4"
                      />
                      선택 고객 ({selectedUids.length}명)
                    </label>
                  </div>
                </div>

                {/* 금액 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">금액 (원)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="포인트 금액"
                    value={bulkModal.amount}
                    onChange={(e) => setBulkModal((prev) => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>

                {/* 사유 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">사유</label>
                  <input
                    type="text"
                    placeholder="포인트 지급 사유"
                    value={bulkModal.description}
                    onChange={(e) => setBulkModal((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>

                {/* 버튼 */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={closeBulkModal}
                    className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleBulkIssue}
                    disabled={bulkModal.loading}
                    className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {bulkModal.loading ? '처리 중...' : '지급하기'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
