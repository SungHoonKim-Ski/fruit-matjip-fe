// AdminProductPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
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

const initialProducts: Product[] = [
  { id: 1, name: '신선한 토마토 1kg', price: 4000, stock: 10, totalSold: 24, status: 'active',   imageUrl: '/images/image1.png' },
  { id: 2, name: '유기농 감자 2kg',   price: 3000, stock: 5,  totalSold: 12, status: 'inactive', imageUrl: '/images/image2.png' },
];

export default function AdminProductPage() {
  const { show } = useSnackbar(); 
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [originalProducts, setOriginalProducts] = useState<Product[]>(initialProducts);
  const navigate = useNavigate();

  const hasChanges = JSON.stringify(products) !== JSON.stringify(originalProducts);

  const toggleStatus = (id: number) =>
    setProducts(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, status: p.status === 'active' ? 'inactive' : 'active' }
          : p
      )
    );

  const deleteStockOnly = (id: number) =>
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, stock: 0 } : p)));

  const deleteProduct = (id: number) =>
    setProducts(prev => prev.filter(p => p.id !== id));

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
    if (!USE_MOCKS) return;
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
  }, []);

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
    <div className="max-w-3xl mx-auto flex justify-between items-center mb-6">
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
            구매자 확인
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
      <div className="space-y-6 max-w-3xl mx-auto">
        {products.map((product) => (
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
                          if (dd > t) return '판매일 전';
                          if (dd === t) return '판매 당일';
                          return '판매일 지남';
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
                      onClick={() => toggleStatus(product.id)}
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
                      onClick={() => deleteStockOnly(product.id)}
                      className="h-10 w-full rounded bg-amber-500 text-white hover:bg-amber-600"
                    >
                      품절 처리
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProduct(product.id)}
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
    </main>
  );
}
