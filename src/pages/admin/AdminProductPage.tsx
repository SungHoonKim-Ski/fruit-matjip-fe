// AdminProductPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { setSoldOut, toggleVisible, deleteAdminProduct, getAdminProductsMapped, AdminProductListItem } from '../../utils/api';
import { useLocation } from 'react-router-dom';
import AdminHeader from '../../components/AdminHeader';

type Product = AdminProductListItem;

export default function AdminProductPage() {
  const location = useLocation() as any;
  // 재고 상태 기준값 (UI 배지 표시용)
  const LOW_STOCK_THRESHOLD = 10;    // 품절임박 기준
  const DANGER_STOCK_THRESHOLD = 5;  // 위험 재고 기준

  const { show } = useSnackbar();
  const [products, setProducts] = useState<Product[]>([]);
  const navigate = useNavigate();


  // --- Dialog 상태들 ---
  const [deleteStockDialog, setDeleteStockDialog] = useState<{
    isOpen: boolean;
    productId: number;
    productName: string;
  }>({ isOpen: false, productId: 0, productName: '' });

  const [deleteProductDialog, setDeleteProductDialog] = useState<{
    isOpen: boolean;
    productId: number;
    productName: string;
  }>({ isOpen: false, productId: 0, productName: '' });

  const [toggleStatusDialog, setToggleStatusDialog] = useState<{
    isOpen: boolean;
    productId: number;
    productName: string;
    newStatus: 'active' | 'inactive';
  }>({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });

  // 뒤로가기 처리 제어용 플래그 (프로그램적으로 back() 했을 때 popstate 중복 처리 방지)
  const suppressNextPop = useRef(false);

  // 검색어 (상품명)
  const [search, setSearch] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [tempSearch, setTempSearch] = useState('');
  
  const visibleProducts = useMemo(() => {
    const q = search.trim();
    return q ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : products;
  }, [products, search]);

  // 검색 관련 함수들
  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 px-1 rounded">{part}</mark>
      ) : part
    );
  };

  const openSearchModal = () => {
    setTempSearch(search);
    setSearchModalOpen(true);
  };

  const closeSearchModal = () => {
    setSearchModalOpen(false);
    setTempSearch('');
  };

  const applySearch = () => {
    setSearch(tempSearch);
    setSearchModalOpen(false);
  };

  const clearSearch = () => {
    setSearch('');
    setTempSearch('');
  };

  // --- 다이얼로그 열기: pushState로 히스토리 한 단계 추가 (뒤로가기 시 다이얼로그만 닫힘) ---
  const pushDialogState = () => {
    window.history.pushState({ modal: true }, '');
  };

  const openDeleteStockDialog = (id: number, name: string) => {
    setDeleteStockDialog({ isOpen: true, productId: id, productName: name });
    pushDialogState();
  };

  const openDeleteProductDialog = (id: number, name: string) => {
    setDeleteProductDialog({ isOpen: true, productId: id, productName: name });
    pushDialogState();
  };

  const openToggleStatusDialog = (id: number, name: string, currentStatus: 'active' | 'inactive') => {
    setToggleStatusDialog({ isOpen: true, productId: id, productName: name, newStatus: currentStatus === 'active' ? 'inactive' : 'active' });
    pushDialogState();
  };

  // --- 다이얼로그 닫기(취소/확인 공통): 상태 닫고, 우리가 추가한 히스토리 1스텝만 소비 ---
  const programmaticCloseDialog = () => {
    suppressNextPop.current = true;
    window.history.back();
  };

  // --- 브라우저/안드로이드 뒤로가기 처리: 다이얼로그만 닫기 ---
  useEffect(() => {
    const onPop = () => {
      if (suppressNextPop.current) {
        suppressNextPop.current = false;
        return;
      }
      if (toggleStatusDialog.isOpen || deleteProductDialog.isOpen || deleteStockDialog.isOpen) {
        setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });
        setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' });
        setDeleteStockDialog({ isOpen: false, productId: 0, productName: '' });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [toggleStatusDialog.isOpen, deleteProductDialog.isOpen, deleteStockDialog.isOpen]);



  // --- API 실행 핸들러들 (Confirm에서 즉시 호출) ---
  const handleDeleteStock = async (id: number) => {
    try {
      if (USE_MOCKS) {
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, stock: 0, status: 'inactive' } : p)));
        show('품절 처리되었습니다.', { variant: 'success' });
      } else {
        const res = await setSoldOut(id);
        if (!res.ok) throw new Error('품절 처리에 실패했습니다.');
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, stock: 0, status: 'inactive' } : p)));
        show('품절 처리되었습니다.', { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleDeleteStock');
      show(getSafeErrorMessage(e, '품절 처리 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      if (USE_MOCKS) {
        setProducts(prev => prev.filter(p => p.id !== id));
        show('상품이 삭제되었습니다.', { variant: 'success' });
      } else {
        const res = await deleteAdminProduct(id);
        if (!res.ok) throw new Error('상품 삭제에 실패했습니다.');
        setProducts(prev => prev.filter(p => p.id !== id));
        show('상품이 삭제되었습니다.', { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleDeleteProduct');
      show(getSafeErrorMessage(e, '상품 삭제 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  const handleToggleStatus = async (id: number, newStatus: 'active' | 'inactive') => {
    try {
      if (USE_MOCKS) {
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, status: newStatus } : p)));
        show(`상품이 ${newStatus === 'active' ? '노출' : '숨김'} 처리되었습니다.`, { variant: 'success' });
      } else {
        const res = await toggleVisible(id, newStatus === 'active');
        if (!res.ok) throw new Error('상태 변경에 실패했습니다.');
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, status: newStatus } : p)));
        show(`상품이 ${newStatus === 'active' ? '노출' : '숨김'} 처리되었습니다.`, { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleToggleStatus');
      show(getSafeErrorMessage(e, '상태 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  // --- 상품 목록 조회 ---
  useEffect(() => {
    const loadProducts = async () => {
      if (USE_MOCKS) {
        const mocked = listProducts();
        const mapped: Product[] = mocked.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          stock: p.stock,
          totalSold: p.totalSold ?? 0,
          status: p.stock > 0 ? 'active' : 'inactive',
          imageUrl: p.imageUrl,
          sellDate: p.sellDate,
        }));
        setProducts(mapped);
      } else {
        try {
          const forceTs = location?.state?.bustTs as number | undefined;
          const mapped = await getAdminProductsMapped(forceTs);
          setProducts(mapped);
        } catch (e: any) {
          safeErrorLog(e, 'AdminProductPage - loadProducts');
          show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
        }
      }
    };
    loadProducts();
  }, [show, location?.state?.bustTs]);



  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📦 상품 관리</h1>
          <div className="flex justify-end">
            <AdminHeader />
          </div>
        </div>

      </div>

      <div className="space-y-6 max-w-3xl mx-auto">
        {visibleProducts.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-row items-stretch gap-4">
              <img
                src={(() => {
                  const url = product.imageUrl || '';
                  const ts = location?.state?.bustTs;
                  if (!ts) return url;
                  return url.includes('?') ? `${url}&ts=${ts}` : `${url}?ts=${ts}`;
                })()}
                alt={product.name}
                className="w-28 h-28 sm:w-28 sm:h-auto sm:aspect-square md:w-32 object-cover rounded border flex-shrink-0"
              />
              <div className="flex-1 flex flex-col justify-between min-h-[6rem]">
                {/* 상단 정보 */}
                <div className="space-y-1 flex-1">
                  <h2 className="text-lg font-semibold break-keep">{highlightSearchTerm(product.name, search)}</h2>
                  <p className="text-sm text-gray-500">가격: {product.price.toLocaleString()}원</p>
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">재고: {product.stock.toLocaleString()}개</span>
                    <span
                      className="ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border"
                      style={{
                        backgroundColor: (() => {
                          if (product.stock === 0) return '#E0F2FE';
                          if (product.stock < DANGER_STOCK_THRESHOLD) return '#FECACA';
                          if (product.stock < LOW_STOCK_THRESHOLD) return '#FEF3C7';
                          return '#DCFCE7';
                        })(),
                        borderColor: '#e5e7eb',
                        color: '#374151'
                      }}
                    >
                      {(() => {
                        if (product.stock === 0) return '품절';
                        if (product.stock < DANGER_STOCK_THRESHOLD) return '위험';
                        if (product.stock < LOW_STOCK_THRESHOLD) return '품절임박';
                        return '여유';
                      })()}
                    </span>
                  </p>
                  <p className="text-sm text-gray-500">누적 판매량: {product.totalSold}개</p>
                  <p className="text-sm text-gray-500">
                    판매일: {product.sellDate ?? '미설정'}
                    {product.sellDate && (
                      <span
                        className="ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border "
                        style={{
                          backgroundColor: (() => {
                            const now = new Date();
                            // KST 시간대로 현재 시간 계산 (UTC+9)
                            const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                            // 오늘 날짜를 YYYY-MM-DD 형식으로
                            const todayStr = kstNow.toISOString().split('T')[0];
                            const ds = product.sellDate! + 'T00:00:00';
                            const d = new Date(ds);
                            const t = new Date(todayStr).getTime();
                            const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                            if (dd > t) return '#E0F2FE';
                            if (dd === t) return '#DCFCE7';
                            return '#FEE2E2';
                          })(),
                          borderColor: '#e5e7eb',
                          color: '#374151'
                        }}
                      >
                        {(() => {
                          // KST 기준으로 오늘 날짜 계산
                          const now = new Date();
                          // KST 시간대로 현재 시간 계산 (UTC+9)
                          const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                          // 오늘 날짜를 YYYY-MM-DD 형식으로
                          const todayStr = kstNow.toISOString().split('T')[0];
                          // 판매일과 비교
                          if (product.sellDate! > todayStr) return '예정';
                          if (product.sellDate! === todayStr) return '당일';
                          return '종료';
                        })()}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            {/* 조작 영역: 이미지/텍스트 행 아래 전체 너비 사용 */}
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/admin/products/${product.id}/edit`)}
                  className="h-10 w-full rounded border border-gray-300 hover:bg-gray-50"
                >
                  상세 정보 수정
                </button>
                <button
                  type="button"
                  onClick={() => openToggleStatusDialog(product.id, product.name, product.status)}
                  className={`h-10 w-full rounded font-medium transition
                    ${product.status === 'active'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-rose-500 hover:bg-rose-600 text-white'}`}
                >
                  {product.status === 'active' ? '상품 목록 노출 O' : '상품 목록 노출 X'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => openDeleteStockDialog(product.id, product.name)}
                  className="h-10 w-full rounded bg-amber-500 text-white hover:bg-amber-600"
                >
                  품절 처리
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteProductDialog(product.id, product.name)}
                  className="h-10 w-full rounded bg-gray-700 text-white hover:bg-gray-800"
                >
                  상품 삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* === 다이얼로그 3종 === */}

      {/* 품절 처리 확인 Dialog */}
      {deleteStockDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">품절 처리</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{deleteStockDialog.productName}"</span> 상품을 품절 처리합니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteStockDialog({ isOpen: false, productId: 0, productName: '' });
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setDeleteStockDialog({ isOpen: false, productId: 0, productName: '' });
                  programmaticCloseDialog();
                  await handleDeleteStock(deleteStockDialog.productId);
                }}
                className="flex-1 h-10 rounded bg-amber-500 text-white hover:bg-amber-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상품 삭제 확인 Dialog */}
      {deleteProductDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">상품 삭제</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{deleteProductDialog.productName}"</span> 상품을 삭제합니다.
              <br />
              <span className="text-sm text-red-600">이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' });
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' });
                  programmaticCloseDialog();
                  await handleDeleteProduct(deleteProductDialog.productId);
                }}
                className="flex-1 h-10 rounded bg-red-500 text-white hover:bg-red-600"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상품 목록 노출 상태 변경 확인 Dialog */}
      {toggleStatusDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">상품 노출 상태 변경</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{toggleStatusDialog.productName}"</span> 상품을
              {toggleStatusDialog.newStatus === 'active' ? ' 목록에 노출' : ' 목록에서 숨김'} 처리합니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const { productId, newStatus } = toggleStatusDialog;
                  setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });
                  programmaticCloseDialog();
                  await handleToggleStatus(productId, newStatus);
                }}
                className={`flex-1 h-10 rounded text-white font-medium ${
                  toggleStatusDialog.newStatus === 'active' ? 'bg-green-500 hover:bg-green-600' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB 검색 버튼 */}
      <button
        onClick={search ? clearSearch : openSearchModal}
        className={`fixed bottom-4 right-4 z-30 bg-white text-gray-800 rounded-full shadow-lg flex items-center gap-2 px-4 py-3 transition-all duration-200 hover:scale-105 active:scale-95 ${
          search ? 'border border-blue-500' : 'border-2 border-blue-500'
        }`}
        aria-label={search ? "필터 초기화" : "상품 검색"}
      >
        {search ? (
          // 필터 초기화 아이콘 (필터)
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3"/>
          </svg>
        ) : (
          // 검색 아이콘 (돋보기)
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        )}
        <span className="text-sm font-bold text-gray-900">
          {search ? '초기화' : ''}
        </span>
      </button>

      {/* 검색 모달 */}
      {searchModalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          aria-modal="true"
          role="dialog"
        >
          <div className="absolute inset-0 bg-black/40" onClick={closeSearchModal} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl border">
            {/* 검색 헤더 */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">상품 검색</h2>
              <button
                onClick={closeSearchModal}
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-gray-50"
                aria-label="검색창 닫기"
              >
                ✕
              </button>
            </div>
            
            {/* 검색 입력 */}
            <div className="p-4">
              <div className="relative">
                <input
                  type="text"
                  value={tempSearch}
                  onChange={e => setTempSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      applySearch();
                    }
                  }}
                  placeholder="상품명을 입력하세요 (예: 토마토, 사과)"
                  className="w-full h-12 pl-10 pr-10 rounded-lg border-2 border-gray-300 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm bg-white"
                  autoFocus
                />
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔎</span>
                {tempSearch && (
                  <button
                    type="button"
                    onClick={() => setTempSearch('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm w-6 h-6 flex items-center justify-center"
                    aria-label="검색어 지우기"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            
            {/* 검색 결과 요약 */}
            {tempSearch && (
              <div className="px-4 pb-4">
                <div className="p-3 bg-orange-50 rounded-lg">
                  <div className="text-sm text-orange-800">
                    <span className="font-medium">"{tempSearch}"</span> 검색 결과: <span className="font-semibold">{products.filter(p => p.name.toLowerCase().includes(tempSearch.toLowerCase())).length}개</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* 버튼 영역 */}
            <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={closeSearchModal}
                className="flex-1 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={applySearch}
                className="flex-1 h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors"
              >
                검색 적용
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}