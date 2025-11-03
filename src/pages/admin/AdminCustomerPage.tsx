// src/pages/admin/AdminCustomerPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { getMockCustomers, updateMockCustomerWarnCount } from '../../mocks/customers';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getCustomers, addCustomerWarn, resetCustomerWarn, CustomerListItem, CustomerSortKey } from '../../utils/api';
import AdminHeader from '../../components/AdminHeader';

const LIMIT = 20;

export default function AdminCustomerPage() {
  const { show } = useSnackbar();

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string>('');

  // 필터 및 정렬 상태
  const [sortKey, setSortKey] = useState<CustomerSortKey>('TOTAL_REVENUE');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // 고객 상세 Dialog
  const [customerDialog, setCustomerDialog] = useState<{
    isOpen: boolean;
    customer: CustomerListItem | null;
  }>({ isOpen: false, customer: null });

  // 노쇼 경고 확인 Dialog
  const [warnDialog, setWarnDialog] = useState<{
    isOpen: boolean;
    customer: CustomerListItem | null;
  }>({ isOpen: false, customer: null });

  // 무한 스크롤 감지를 위한 ref
  const observerTarget = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const sortKeyRef = useRef(sortKey);
  const sortOrderRef = useRef(sortOrder);
  const appliedSearchRef = useRef(appliedSearch);

  // ref 업데이트
  useEffect(() => {
    sortKeyRef.current = sortKey;
    sortOrderRef.current = sortOrder;
    appliedSearchRef.current = appliedSearch;
  }, [sortKey, sortOrder, appliedSearch]);

  // 고객 목록 로드
  const loadCustomers = async (reset: boolean = false) => {
    if (loadingRef.current) return;

    try {
      loadingRef.current = true;
      setLoading(true);

      let data: { users: CustomerListItem[]; cursor: string | null };
      if (USE_MOCKS) {
        // Mock은 offset 기반으로 동작 (cursor 문자열을 숫자로 변환)
        const offset = reset ? 0 : (cursor ? parseInt(cursor, 10) : 0);
        const mockData = getMockCustomers(offset, 'total_revenue', 'desc', LIMIT, appliedSearchRef.current);
        // Mock 데이터를 실제 API 응답 형식으로 변환
        const nextOffset = mockData.hasMore ? (offset + LIMIT).toString() : '';
        data = { 
          users: mockData.users.map(u => ({ ...u, id: String(u.id) })), 
          cursor: nextOffset || null 
        };
      } else {
        const currentCursor = reset ? '' : cursor;
        data = await getCustomers(currentCursor, sortKeyRef.current, sortOrderRef.current, LIMIT, appliedSearchRef.current);
      }

      if (reset) {
        setCustomers(data.users);
        setCursor(data.cursor || '');
      } else {
        setCustomers(prev => [...prev, ...data.users]);
        setCursor(data.cursor || '');
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminCustomerPage - loadCustomers');
      show(getSafeErrorMessage(e, '고객 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // 필터/정렬/검색 적용 시 재로드
  useEffect(() => {
    setCustomers([]);
    setCursor('');
    loadCustomers(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortOrder, appliedSearch]);

  // 무한 스크롤
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && cursor && !loadingRef.current) {
          loadCustomers(false);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  // 고객 상세 Dialog 열기
  const openCustomerDialog = (customer: CustomerListItem) => {
    setCustomerDialog({ isOpen: true, customer });
  };

  // 고객 Dialog 닫기
  const closeCustomerDialog = () => {
    setCustomerDialog({ isOpen: false, customer: null });
  };

  // 노쇼 경고 확인 Dialog 열기
  const openWarnDialog = (customer: CustomerListItem) => {
    setWarnDialog({ isOpen: true, customer });
  };

  // 노쇼 경고 확인 Dialog 닫기
  const closeWarnDialog = () => {
    setWarnDialog({ isOpen: false, customer: null });
  };

  // 이번 달 이용 제한 해제
  const handleResetWarn = async () => {
    if (!customerDialog.customer) return;

    try {
      const customer = customerDialog.customer;

      if (USE_MOCKS) {
        const updated = updateMockCustomerWarnCount(Number(customer.id), -1);
        if (updated) {
          // 목 데이터 업데이트 후 목록 새로고침
          setCustomers([]);
          setCursor('');
          await loadCustomers(true);
          show('이번 달 이용 제한이 해제되었습니다.');
        }
      } else {
        await resetCustomerWarn(customer.id);
        // 목록 새로고침
        setCustomers([]);
        setCursor('');
        await loadCustomers(true);
        show('이번 달 이용 제한이 해제되었습니다.');
      }

      // Dialog 닫기
      closeCustomerDialog();
    } catch (e: any) {
      safeErrorLog(e, 'AdminCustomerPage - handleResetWarn');
      show(getSafeErrorMessage(e, '이용 제한 해제 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  // 가격 포맷팅
  const formatPrice = (price: number) => {
    return price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 pb-24">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">👥 고객 관리</h1>
          <div className="flex justify-end">
            <AdminHeader />
          </div>
        </div>
      </div>

      <section className="max-w-4xl mx-auto">
        {/* 필터 및 정렬 */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg shadow-lg border border-orange-100 p-4 mb-4">
          {/* 검색 */}
          <div className="mb-3">
            <label className="text-sm font-medium text-orange-700 mb-2 block">고객 검색</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setAppliedSearch(search);
                  }
                }}
                placeholder="고객명을 입력하세요"
                className="flex-1 h-10 border border-orange-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              />
              <button
                onClick={() => setAppliedSearch(search)}
                className="px-4 h-10 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                검색
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* 필터 선택 */}
            <div>
              <label className="text-sm font-medium text-orange-700 mb-2 block">정렬 기준</label>
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as CustomerSortKey)}
                className="w-full h-10 border border-orange-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              >
                <option value="TOTAL_REVENUE">누적 매출</option>
                <option value="WARN_COUNT">이번 달 경고순</option>
                <option value="TOTAL_WARN_COUNT">누적 경고순</option>
              </select>
            </div>

            {/* 정렬 순서 */}
            <div>
              <label className="text-sm font-medium text-orange-700 mb-2 block">정렬 순서</label>
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as 'ASC' | 'DESC')}
                className="w-full h-10 border border-orange-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              >
                <option value="DESC">내림차순</option>
                <option value="ASC">오름차순</option>
              </select>
            </div>
          </div>
        </div>

        {/* 고객 목록 */}
        <div className="space-y-3">
          {customers.map(customer => (
            <div
              key={customer.id}
              onClick={() => openCustomerDialog(customer)}
              className="bg-white rounded-lg shadow-md border-l-4 border-orange-200 p-4 cursor-pointer hover:shadow-lg hover:border-orange-600 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-gray-900">{customer.name}</h3>
                    {customer.isFirstTimeBuyer && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                        신규
                      </span>
                    )}
                    {customer.monthlyWarnCount > 2 && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                        이용제한
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center gap-4 text-xs">
                    <div className="flex-1">
                      <span className="text-gray-500 block">이번 달 경고</span>
                      <div className="font-semibold text-orange-600">{customer.monthlyWarnCount}</div>
                    </div>
                    <div className="flex-1">
                      <span className="text-gray-500 block">누적 매출</span>
                      <div className="font-semibold text-gray-900">{formatPrice(customer.totalRevenue)}</div>
                    </div>
                  </div>
                </div>

                <div className="ml-2 flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openWarnDialog(customer);
                    }}
                    className="px-3 py-1 text-xs font-medium bg-red-400 hover:bg-red-600 text-white rounded transition-colors"
                  >
                    경고 등록
                  </button>
                  <div className="text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 무한 스크롤 타겟 */}
        {cursor && (
          <div ref={observerTarget} className="h-10 flex items-center justify-center">
            {loading && <div className="text-gray-500 text-sm">로딩 중...</div>}
          </div>
        )}

        {!cursor && customers.length > 0 && (
          <div className="text-center text-gray-500 text-sm py-8">모든 고객을 불러왔습니다.</div>
        )}

        {!loading && customers.length === 0 && (
          <div className="text-center text-gray-500 py-16">고객 데이터가 없습니다.</div>
        )}
      </section>

      {/* 노쇼 경고 확인 Dialog */}
      {warnDialog.isOpen && warnDialog.customer && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={closeWarnDialog} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <h3 className="text-xl font-bold text-orange-900 mb-4">경고 등록</h3>
            <p className="text-gray-700 mb-6">
              <strong>{warnDialog.customer.name}</strong> 고객에게 경고를 1회 등록합니다(노쇼 경고 메시지가 전송됩니다.)
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={closeWarnDialog}
                className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const customer = warnDialog.customer!;
                  closeWarnDialog();
                  
                  try {
                    if (USE_MOCKS) {
                      const updated = updateMockCustomerWarnCount(Number(customer.id), 1);
                      if (updated) {
                        setCustomers([]);
                        setCursor('');
                        await loadCustomers(true);
                      }
                    } else {
                      await addCustomerWarn(customer.id);
                      setCustomers([]);
                      setCursor('');
                      await loadCustomers(true);
                    }
                    show('노쇼 경고가 등록되었습니다.');
                  } catch (e: any) {
                    safeErrorLog(e, 'AdminCustomerPage - registerWarn');
                    show(getSafeErrorMessage(e, '경고 등록 중 오류가 발생했습니다.'), { variant: 'error' });
                  }
                }}
                className="px-6 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium"
              >
                등록
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 고객 상세 Dialog */}
      {customerDialog.isOpen && customerDialog.customer && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={closeCustomerDialog} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <h3 className="text-xl font-bold text-orange-900 mb-4 flex items-center">
              <span className="mr-2">👤</span>
              {customerDialog.customer.name}
              {customerDialog.customer.isFirstTimeBuyer && (
                <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                  신규
                </span>
              )}
              {customerDialog.customer.monthlyWarnCount > 2 && (
                <span className="ml-2 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
                  이용제한
                </span>
              )}
            </h3>

            {/* 고객 정보 */}
            <div className="space-y-3 mb-6">
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-3 border border-orange-100">
                <div className="text-sm text-orange-700 mb-1 font-medium">누적 매출</div>
                <div className="text-xl font-bold text-orange-900">{formatPrice(customerDialog.customer.totalRevenue)}</div>
              </div>
              <div className="flex items-center justify-between gap-3">
              <div className="bg-red-50 rounded-lg p-3 border border-red-100 flex-1">
                <div className="text-sm text-red-700 mb-1 font-medium">누적 경고</div>
                <div className="text-xl font-bold text-red-600 text-right">{customerDialog.customer.totalWarnCount}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-100 flex-1">
                <div className="text-sm text-orange-700 mb-1 font-medium">이번 달 경고</div>
                <div className="text-xl font-bold text-orange-600 text-right">{customerDialog.customer.monthlyWarnCount}</div>
              </div>
              </div>

              
            </div>

            {/* 경고 수 조정 UI */}
            <div className="border-t-2 border-orange-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-orange-700">이번 달 이용 제한 해제</div>
                <button
                  onClick={handleResetWarn}
                  disabled={customerDialog.customer.monthlyWarnCount <= 0}
                  className="px-4 py-2 rounded-lg bg-orange-400 hover:bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium transition-colors"
                >
                  적용
                </button>
              </div>
              <div className="text-sm font-medium text-gray-500">* 셀프 수령 가능</div>
            </div>

            {/* 닫기 버튼 */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={closeCustomerDialog}
                className="px-6 py-2 rounded-lg border border-orange-300 hover:bg-orange-50 text-orange-700 font-medium transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

