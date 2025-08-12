// AdminProductPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';

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
  const { show } = useSnackbar(); 
  const [products, setProducts] = useState<Product[]>([]);
  const [originalProducts, setOriginalProducts] = useState<Product[]>([]);
  const navigate = useNavigate();

  const hasChanges = JSON.stringify(products) !== JSON.stringify(originalProducts);

  // Dialog 상태들
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

  // 검색어 (상품명)
  const [search, setSearch] = useState('');
  const visibleProducts = useMemo(() => {
    const q = search.trim();
    let filtered = q ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : products;
    
    // 정렬: 판매 당일 / 판매일 전(내림차순) / 판매일 후(오름차순)
    filtered.sort((a, b) => {
      if (!a.sellDate || !b.sellDate) return 0;
      
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      
      const aDate = new Date(a.sellDate + 'T00:00:00');
      const bDate = new Date(b.sellDate + 'T00:00:00');
      const todayDate = new Date(todayStr + 'T00:00:00');
      
      // 판매 당일인지 확인
      const aIsToday = aDate.getTime() === todayDate.getTime();
      const bIsToday = bDate.getTime() === todayDate.getTime();
      
      // 판매 당일이 가장 위에
      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;
      
      // 둘 다 판매 당일이거나 둘 다 아닌 경우
      if (aIsToday && bIsToday) {
        // 판매 당일은 이름순 정렬
        return a.name.localeCompare(b.name);
      }
      
      // 판매일 전(내림차순) - 가까운 날짜가 위에
      if (aDate > todayDate && bDate > todayDate) {
        return aDate.getTime() - bDate.getTime();
      }
      
      // 판매일 후(오름차순) - 먼저 지난 날짜가 위에
      if (aDate < todayDate && bDate < todayDate) {
        return aDate.getTime() - bDate.getTime();
      }
      
      // 판매일 전과 후가 섞여있는 경우, 전이 위에
      if (aDate > todayDate && bDate < todayDate) return -1;
      if (aDate < todayDate && bDate > todayDate) return 1;
      
      return 0;
    });
    
    return filtered;
  }, [products, search]);

  // Dialog 열기 함수들
  const openDeleteStockDialog = (id: number, name: string) => {
    setDeleteStockDialog({ isOpen: true, productId: id, productName: name });
  };

  const openDeleteProductDialog = (id: number, name: string) => {
    setDeleteProductDialog({ isOpen: true, productId: id, productName: name });
  };

  const openToggleStatusDialog = (id: number, name: string, currentStatus: 'active' | 'inactive') => {
    setToggleStatusDialog({ 
      isOpen: true, 
      productId: id, 
      productName: name, 
      newStatus: currentStatus === 'active' ? 'inactive' : 'active' 
    });
  };

  // 실제 실행 함수들
  const handleDeleteStock = async (id: number) => {
    try {
      if (USE_MOCKS) {
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, stock: 0 } : p)));
        show('품절 처리되었습니다.', { variant: 'success' });
      } else {
        const res = await fetch(`/api/admin/products/${id}/stock`, { 
          method: 'PUT', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock: 0 })
        });
        if (!res.ok) throw new Error('품절 처리에 실패했습니다.');
        
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, stock: 0 } : p)));
        show('품절 처리되었습니다.', { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleDeleteStock');
      show(getSafeErrorMessage(e, '품절 처리 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setDeleteStockDialog({ isOpen: false, productId: 0, productName: '' });
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      if (USE_MOCKS) {
        setProducts(prev => prev.filter(p => p.id !== id));
        show('상품이 삭제되었습니다.', { variant: 'success' });
      } else {
        const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('상품 삭제에 실패했습니다.');
        
        setProducts(prev => prev.filter(p => p.id !== id));
        show('상품이 삭제되었습니다.', { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleDeleteProduct');
      show(getSafeErrorMessage(e, '상품 삭제 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' });
    }
  };

  const handleToggleStatus = async (id: number, newStatus: 'active' | 'inactive') => {
    try {
      if (USE_MOCKS) {
        setProducts(prev =>
          prev.map(p =>
            p.id === id ? { ...p, status: newStatus } : p
          )
        );
        show(`상품이 ${newStatus === 'active' ? '노출' : '숨김'} 처리되었습니다.`, { variant: 'success' });
      } else {
        const res = await fetch(`/api/admin/products/${id}/status`, { 
          method: 'PUT', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error('상태 변경에 실패했습니다.');
        
        setProducts(prev =>
          prev.map(p =>
            p.id === id ? { ...p, status: newStatus } : p
          )
        );
        show(`상품이 ${newStatus === 'active' ? '노출' : '숨김'} 처리되었습니다.`, { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleToggleStatus');
      show(getSafeErrorMessage(e, '상태 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });
    }
  };

  const handleReset = () => setProducts(originalProducts);

  const handleApply = () => {
    setOriginalProducts(products);
    show('변경 사항이 저장되었습니다.');
  };

  // 우측 상단 메뉴 (모바일: 햄버거 / 데스크탑: 버튼 3개 노출)
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭/ESC로 닫기
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  // Load from mocks for admin list as well (to reflect sellDate/totalSold etc.)
  useEffect(() => {
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
      setOriginalProducts(mapped);
    }
  }, []); // Empty dependency array to run once on mount

  const goNewProduct = () => navigate('/admin/products/new');
  const goSales = () => navigate('/admin/sales');     // 라우트 준비 필요
  const goBuyers = () => navigate('/admin/reservations');   // 라우트 준비 필요

  // 재고 수량 직접 변경 기능은 제거됨

  return (
    <main
      className={`bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 ${
        hasChanges ? 'pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-6' : ''
      }`}
    >
    <div className="max-w-3xl mx-auto mb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">📦 상품 관리</h1>

        {/* 데스크탑: 버튼 3개 나열 / 모바일: 햄버거 */}
        <div className="relative" ref={menuRef}>
        {/* md 이상: 버튼 3개 (그리드로 균등 분배) */}
        <div className="hidden md:grid grid-cols-3 gap-2 items-center">
          <button
            type="button"
            onClick={goNewProduct}
            className="h-10 w-full px-4 rounded bg-orange-500 text-white hover:bg-orange-600 text-sm font-medium"
          >
            상품 등록
          </button>
          <button
            type="button"
            onClick={goSales}
            className="h-10 w-full px-4 rounded bg-indigo-500 text-white hover:bg-indigo-600 text-sm font-medium"
          >
            판매량 확인
          </button>
          <button
            type="button"
            onClick={goBuyers}
            className="h-10 w-full px-4 rounded bg-sky-500 text-white hover:bg-sky-600 text-sm font-medium"
          >
            예약 확인
          </button>
        </div>

        {/* 모바일: 햄버거 → 드롭다운 */}
        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded bg-white border border-gray-300 shadow-sm hover:shadow active:scale-[0.98]"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="관리 메뉴"
          onClick={() => setMenuOpen(v => !v)}
        >
          ☰
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-44 rounded-lg border bg-white shadow-lg overflow-hidden z-50"
          >
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => { setMenuOpen(false); goNewProduct(); }}
            >
              ➕ 상품 등록
            </button>
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => { setMenuOpen(false); goSales(); }}
            >
              📈 판매량 확인
            </button>
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => { setMenuOpen(false); goBuyers(); }}
            >
              🧾 예약 확인
            </button>
          </div>
        )}
        </div>
      </div>

      {/* 검색: 상품명 (리스트 위에 단일 노출) */}
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
                  <p className="text-sm text-gray-500">누적 판매량: {product.totalSold}개</p>
                  <p className="text-sm text-gray-500">
                    판매일: {product.sellDate ?? '미설정'}
                    {product.sellDate && (
                      <span className="ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border "
                        style={{
                          backgroundColor: (() => {
                            const today = new Date();
                            const ds = product.sellDate! + 'T00:00:00';
                            const d = new Date(ds);
                            const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                            const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                            if (dd > t) return '#E0F2FE'; // before - light sky
                            if (dd === t) return '#DCFCE7'; // today - light green
                            return '#FEE2E2'; // after - light red
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

                {/* ⬇️ 조작 영역 */}
                <div className="mt-3 space-y-3">
                  {/* 1) 상세 정보 수정 / 상품 목록 노출 */}
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

                  {/* 2) 품절 처리 / 상품 삭제 */}
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
                {/* ⬆️ 조작 영역 끝 */}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasChanges && (
        <div className="md:max-w-3xl md:mx-auto">
                  <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t">
          <div className="mx-auto w-full max-w-4xl flex items-center justify-end gap-3 p-3"
               style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <button
              onClick={handleReset}
              className="h-12 px-4 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              type="button"
            >
              초기화
            </button>
            <button
              onClick={handleApply}
              className="h-12 px-5 rounded bg-orange-500 hover:bg-orange-600 text-white font-medium"
              type="button"
            >
              저장
            </button>
          </div>
          </div>
        </div>
      )}

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
                onClick={() => setDeleteStockDialog({ isOpen: false, productId: 0, productName: '' })}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => handleDeleteStock(deleteStockDialog.productId)}
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
                onClick={() => setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' })}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => handleDeleteProduct(deleteProductDialog.productId)}
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
                onClick={() => setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' })}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => handleToggleStatus(toggleStatusDialog.productId, toggleStatusDialog.newStatus)}
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
