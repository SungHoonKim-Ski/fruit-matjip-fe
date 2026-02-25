import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSnackbar } from '../../components/snackbar';
import AdminCourierHeader from '../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import {
  getAdminPointUsers,
  issueAdminPoints,
  deductAdminPoints,
  bulkIssueAdminPoints,
  type AdminPointUserResponse,
} from '../../utils/api';

const formatAmount = (amount: number) =>
  amount.toLocaleString('ko-KR') + '원';

type UserRow = AdminPointUserResponse & {
  selected: boolean;
};

type BulkModalState = {
  open: boolean;
  target: 'all' | 'selected';
  amount: string;
  description: string;
  loading: boolean;
  result: { successCount: number; failCount: number; totalAmount: number } | null;
};

type PointActionDialog = {
  open: boolean;
  type: 'issue' | 'deduct';
  uid: string;
  name: string;
  amount: string;
  description: string;
  loading: boolean;
};

export default function AdminPointPage() {
  const { show } = useSnackbar();
  const initialized = useRef(false);

  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  const [bulkModal, setBulkModal] = useState<BulkModalState>({
    open: false,
    target: 'all',
    amount: '',
    description: '',
    loading: false,
    result: null,
  });

  const [pointDialog, setPointDialog] = useState<PointActionDialog>({
    open: false, type: 'issue', uid: '', name: '', amount: '', description: '', loading: false,
  });

  const fetchUsers = useCallback(async (kw: string, reset = true) => {
    if (!reset) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setHasMore(true);
    }
    try {
      const offset = reset ? 0 : users.length;
      const data = await getAdminPointUsers(kw, offset, PAGE_SIZE);
      if (reset) {
        setUsers(data.map((u) => ({ ...u, selected: false })));
      } else {
        setUsers(prev => [...prev, ...data.map((u) => ({ ...u, selected: false }))]);
      }
      setHasMore(data.length >= PAGE_SIZE);
    } catch (e) {
      safeErrorLog(e);
      show(getSafeErrorMessage(e, '사용자 목록을 불러오는데 실패했습니다.'), { variant: 'error' });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [show, users.length]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    fetchUsers('');
  }, [fetchUsers]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading && !loadingMore) {
          fetchUsers(keyword, false);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, keyword, fetchUsers]);

  const handleSearch = () => {
    setKeyword(searchInput);
    fetchUsers(searchInput, true);
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

  const openIssueDialog = (uid: string, name: string) => {
    setPointDialog({ open: true, type: 'issue', uid, name, amount: '', description: '', loading: false });
  };

  const openDeductDialog = (uid: string, name: string) => {
    setPointDialog({ open: true, type: 'deduct', uid, name, amount: '', description: '', loading: false });
  };

  const closePointDialog = () => {
    setPointDialog(prev => ({ ...prev, open: false }));
  };

  const handlePointAction = async () => {
    const amount = Number(pointDialog.amount);
    if (!amount || amount <= 0) { show('유효한 금액을 입력해주세요.', { variant: 'error' }); return; }
    if (!pointDialog.description.trim()) { show('사유를 입력해주세요.', { variant: 'error' }); return; }

    setPointDialog(prev => ({ ...prev, loading: true }));
    try {
      if (pointDialog.type === 'issue') {
        await issueAdminPoints(pointDialog.uid, amount, pointDialog.description.trim());
        show('포인트가 적립되었습니다.', { variant: 'success' });
      } else {
        await deductAdminPoints(pointDialog.uid, amount, pointDialog.description.trim());
        show('포인트가 차감되었습니다.', { variant: 'success' });
      }
      closePointDialog();
      fetchUsers(keyword, true);
    } catch (e) {
      safeErrorLog(e);
      show(getSafeErrorMessage(e, pointDialog.type === 'issue' ? '포인트 적립에 실패했습니다.' : '포인트 차감에 실패했습니다.'), { variant: 'error' });
      setPointDialog(prev => ({ ...prev, loading: false }));
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
      fetchUsers(keyword, true);
    } catch (e) {
      safeErrorLog(e);
      show(getSafeErrorMessage(e, '일괄 포인트 지급에 실패했습니다.'), { variant: 'error' });
      setBulkModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">포인트 관리</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={openBulkModal}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              포인트 지급
            </button>
            <AdminCourierHeader />
          </div>
        </div>

        {/* 검색 */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="이름 검색"
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
                    <span className="text-sm font-medium text-gray-800">{user.name}</span>
                  </div>
                  <div className="text-right text-sm font-semibold text-gray-700">
                    {formatAmount(user.pointBalance)}
                  </div>
                  <div className="flex gap-1 justify-center">
                    <button
                      onClick={() => openIssueDialog(user.uid, user.name)}
                      className="px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors"
                    >
                      적립
                    </button>
                    <button
                      onClick={() => openDeductDialog(user.uid, user.name)}
                      className="px-2 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 transition-colors"
                    >
                      차감
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Infinite scroll sentinel */}
        {hasMore && !loading && (
          <div ref={sentinelRef} className="h-4" />
        )}
        {loadingMore && (
          <div className="py-4 text-center text-gray-400 text-sm">불러오는 중...</div>
        )}

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

      {/* 개별 포인트 적립/차감 모달 */}
      {pointDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {pointDialog.type === 'issue' ? '포인트 적립' : '포인트 차감'}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              대상: <span className="font-semibold">{pointDialog.name}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">금액 (원)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="포인트 금액"
                  value={pointDialog.amount}
                  onChange={(e) => setPointDialog(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">사유</label>
                <input
                  type="text"
                  placeholder="사유를 입력해주세요"
                  value={pointDialog.description}
                  onChange={(e) => setPointDialog(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={closePointDialog}
                  className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handlePointAction}
                  disabled={pointDialog.loading}
                  className={`flex-1 py-2 text-sm text-white rounded-lg disabled:opacity-50 transition-colors ${
                    pointDialog.type === 'issue'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {pointDialog.loading ? '처리 중...' : pointDialog.type === 'issue' ? '적립하기' : '차감하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
