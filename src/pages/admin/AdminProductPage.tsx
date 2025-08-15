// AdminProductPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { setSoldOut, toggleVisible, deleteAdminProduct, getAdminProducts } from '../../utils/api';

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  totalSold: number;
  status: 'active' | 'inactive';
  imageUrl: string;
  sellDate?: string;
};

export default function AdminProductPage() {
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
  const visibleProducts = useMemo(() => {
    const q = search.trim();
    let filtered = q ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : products;

    // 정렬: 판매 당일 / 판매일 전(오름차순: 가까운 날짜 먼저) / 판매일 후(오름차순: 더 오래된 날짜 먼저)
    filtered.sort((a, b) => {
      if (!a.sellDate || !b.sellDate) return 0;

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const aDate = new Date(a.sellDate + 'T00:00:00');
      const bDate = new Date(b.sellDate + 'T00:00:00');
      const todayDate = new Date(todayStr + 'T00:00:00');

      const aIsToday = aDate.getTime() === todayDate.getTime();
      const bIsToday = bDate.getTime() === todayDate.getTime();

      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;

      if (aIsToday && bIsToday) {
        return a.name.localeCompare(b.name);
      }

      if (aDate > todayDate && bDate > todayDate) {
        return aDate.getTime() - bDate.getTime(); // 미래: 가까운 날짜가 위
      }

      if (aDate < todayDate && bDate < todayDate) {
        return aDate.getTime() - bDate.getTime(); // 과거: 더 오래된 날짜가 위
      }

      if (aDate > todayDate && bDate < todayDate) return -1; // 미래가 위
      if (aDate < todayDate && bDate > todayDate) return 1;  // 미래가 위

      return 0;
    });

    return filtered;
  }, [products, search]);

  // --- 다이얼로그 열기: pushState로 히스토리 한 단계 추가 (뒤로가기 시 다이얼로그만 닫힘) ---
  const pushDialogState = () => {
    // 같은 URL로 state만 추가 (주소창 변경 없음)
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
    setToggleStatusDialog({
      isOpen: true,
      productId: id,
      productName: name,
      newStatus: currentStatus === 'active' ? 'inactive' : 'active'
    });
    pushDialogState();
  };

  // --- 다이얼로그 닫기(취소/확인 공통): 상태 닫고, 우리가 추가한 히스토리 1스텝만 소비 ---
  const programmaticCloseDialog = () => {
    suppressNextPop.current = true;
    window.history.back(); // 우리가 pushState로 추가한 한 단계만 소비 → 실제로는 페이지 이동 없음
  };

  // --- 브라우저/안드로이드 뒤로가기 처리: 다이얼로그만 닫기 ---
  useEffect(() => {
    const onPop = () => {
      if (suppressNextPop.current) {
        suppressNextPop.current = false;
        return;
      }
      // 열린 다이얼로그가 있으면 닫기 (하나만 열리므로 우선순위 불문)
      if (toggleStatusDialog.isOpen || deleteProductDialog.isOpen || deleteStockDialog.isOpen) {
        setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });
        setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' });
        setDeleteStockDialog({ isOpen: false, productId: 0, productName: '' });
        // 여기서 추가 pushState는 하지 않음: 정상적으로 다이얼로그만 닫힘
      } else {
        // 다이얼로그가 열려있지 않은 경우에는 기본 동작(페이지 뒤로가기)을 허용
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
        const res = await setSoldOut(id); // 서버: 품절(재고 0) 처리 API
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
        const res = await toggleVisible(id, newStatus === 'active'); // 서버: 노출 상태 변경 API
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
          const res = await getAdminProducts();
          if (!res.ok) {
            if (res.status === 401 || res.status === 403) return; // 공통 처리에 위임
            throw new Error('상품 목록을 불러오지 못했습니다.');
          }
          const data = await res.json();
          const productsArray = data?.response || [];
          if (!Array.isArray(productsArray)) {
            throw new Error('상품 데이터가 배열 형태가 아닙니다.');
          }
          const mapped: Product[] = productsArray.map((p: any) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            stock: p.stock,
            totalSold: p.total_sold ?? 0,
            status: p.stock > 0 ? 'active' : 'inactive',
            imageUrl: p.product_url ? `${process.env.REACT_APP_IMG_URL}/${p.product_url}` : '',
            sellDate: p.sell_date || '',
          }));
          setProducts(mapped);
        } catch (e: any) {
          safeErrorLog(e, 'AdminProductPage - loadProducts');
          show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
        }
      }
    };
    loadProducts();
  }, [show]);

  const goNewProduct = () => navigate('/admin/products/new');
  const goSales = () => navigate('/admin/sales');
  const goBuyers = () => navigate('/admin/reservations');

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-3xl mx-auto mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-800">📦 상품 관리</h1>

          {/* 데스크탑: 버튼 3개 */}
          <div className="relative">
            <div className="hidden md:grid grid-cols-3 gap-2 items-center">
              <button type="button" onClick={goNewProduct} className="h-10 w-full px-4 rounded bg-orange-500 text-white hover:bg-orange-600 text-sm font-medium">상품 등록</button>
              <button type="button" onClick={goSales} className="h-10 w-full px-4 rounded bg-indigo-500 text-white hover:bg-indigo-600 text-sm font-medium">판매량 확인</button>
              <button type="button" onClick={goBuyers} className="h-10 w-full px-4 rounded bg-sky-500 text-white hover:bg-sky-600 text-sm font-medium">구매자 확인</button>
            </div>
          </div>
        </div>

        {/* 검색 */}
        <div className="mt-3">
          <label className="sr-only">상품명 검색</label>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품명으로 검색"
              className="w-full h-10 pl-9 pr-9 rounded border border-gray-300 outline-none focus:ring-2 focus:ring-orange-500"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="검색어 지우기"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 max-w-3xl mx-auto">
        {visibleProducts.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full sm:w-28 md:w-32 aspect-square object-cover rounded border"
              />
              <div className="flex-1">
                {/* 상단 정보 */}
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold break-keep">{product.name}</h2>
                  <p className="text-sm text-gray-500">가격: {product.price.toLocaleString()}원</p>
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">재고: {product.stock.toLocaleString()}개</span>
                    <span
                      className="ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border"
                      style={{
                        backgroundColor: (() => {
                          if (product.stock === 0) return '#E0F2FE'; // 품절
                          if (product.stock < DANGER_STOCK_THRESHOLD) return '#FECACA'; // 위험
                          if (product.stock < LOW_STOCK_THRESHOLD) return '#FEF3C7'; // 임박
                          return '#DCFCE7'; // 여유
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
                            const today = new Date();
                            const ds = product.sellDate! + 'T00:00:00';
                            const d = new Date(ds);
                            const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                            const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                            if (dd > t) return '#E0F2FE'; // 예정
                            if (dd === t) return '#DCFCE7'; // 당일
                            return '#FEE2E2'; // 종료
                          })(),
                          borderColor: '#e5e7eb',
                          color: '#374151'
                        }}
                      >
                        {(() => {
                          const today = new Date();
                          const ds = product.sellDate! + 'T00:00:00';
                          const d = new Date(ds);
                          const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                          const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                          if (dd > t) return '판매 예정';
                          if (dd === t) return '판매 당일';
                          return '판매 종료';
                        })()}
                      </span>
                    )}
                  </p>
                </div>

                {/* 조작 영역 */}
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
                {/* 조작 영역 끝 */}
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
                  // 먼저 다이얼로그 닫고 히스토리 스텝 제거
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
                  toggleStatusDialog.newStatus === 'active'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}