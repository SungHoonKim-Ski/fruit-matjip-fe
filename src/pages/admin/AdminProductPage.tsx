// AdminProductPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  totalSold: number;
  status: 'active' | 'inactive';
  imageUrl: string;
};

const initialProducts: Product[] = [
  { id: 1, name: '신선한 토마토 1kg', price: 4000, stock: 10, totalSold: 24, status: 'active',   imageUrl: '/images/image1.png' },
  { id: 2, name: '유기농 감자 2kg',   price: 3000, stock: 5,  totalSold: 12, status: 'inactive', imageUrl: '/images/image2.png' },
];

export default function AdminProductPage() {
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

  const updateStock = (id: number, v: number) =>
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, stock: Math.max(0, v) } : p)));

  const deleteStockOnly = (id: number) =>
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, stock: 0 } : p)));

  const deleteProduct = (id: number) =>
    setProducts(prev => prev.filter(p => p.id !== id));

  const handleReset = () => setProducts(originalProducts);

  const handleApply = () => {
    setOriginalProducts(products);
    toast.success('변경 사항이 저장되었습니다.');
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

  const goNewProduct = () => navigate('/admin/products/new');
  const goSales = () => navigate('/admin/sales');     // 라우트 준비 필요
  const goBuyers = () => navigate('/admin/reservations');   // 라우트 준비 필요

  // 숫자 입력 임시 상태
  const [draftStocks, setDraftStocks] = useState<Record<number, string>>({});
  const toSafeNumber = (v: string | number, defaultValue = 0) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isNaN(n) ? defaultValue : Math.max(0, Math.floor(n));
  };
  const handleStockInput = (id: number, raw: string) => {
    const onlyDigits = raw.replace(/[^\d]/g, '');
    setDraftStocks(prev => ({ ...prev, [id]: onlyDigits }));
  };
  const commitStock = (id: number, currentStock: number) => {
    const val = toSafeNumber(draftStocks[id] ?? currentStock);
    updateStock(id, val);
    setDraftStocks(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

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
        {/* md 이상: 버튼 3개 */}
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={goNewProduct}
            className="h-10 px-3 rounded bg-orange-500 text-white hover:bg-orange-600"
          >
            상품 등록
          </button>
          <button
            type="button"
            onClick={goSales}
            className="h-10 px-3 rounded bg-indigo-500 text-white hover:bg-indigo-600"
          >
            판매량 확인
          </button>
          <button
            type="button"
            onClick={goBuyers}
            className="h-10 px-3 rounded bg-sky-500 text-white hover:bg-sky-600"
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
                </div>

                {/* ⬇️ 조작 영역: 세로 간격을 "항상 동일"하게 맞춤 */}
                <div className="mt-3 space-y-3">
                  {/* 1) 판매 상태 변경: 가로 전체 채움 + 상태별 색상 */}
                  <button
                    type="button"
                    onClick={() => toggleStatus(product.id)}
                    className={`w-full h-10 rounded font-medium transition
                      ${product.status === 'active'
                        ? 'bg-green-500 hover:bg-green-600 text-white'
                        : 'bg-red-500 hover:bg-red-600 text-white'}`}
                  >
                    {product.status === 'active' ? '상품 목록 노출 O' : '상품 목록 노출 X'}
                  </button>

                  {/* 2) 재고 조절: 가로 전체 동일 높이 */}
                  <div className="flex w-full h-10 rounded overflow-hidden border">
                    {/* + */}
                    <button
                      type="button"
                      aria-label="재고 증가"
                      onClick={() => {
                        const current = toSafeNumber(draftStocks[product.id] ?? product.stock);
                        const next = current + 1;
                        setDraftStocks(p => ({ ...p, [product.id]: String(next) }));
                        updateStock(product.id, next);
                      }}
                      className="w-12 bg-gray-100 hover:bg-gray-200"
                    >
                      +
                    </button>

                    {/* 입력 */}
                    <input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={0}
                      className="flex-1 border-x text-center outline-none"
                      value={draftStocks[product.id] ?? String(product.stock)}
                      onChange={(e) => handleStockInput(product.id, e.target.value)}
                      onBlur={() => commitStock(product.id, product.stock)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                      }}
                    />

                    {/* - */}
                    <button
                      type="button"
                      aria-label="재고 감소"
                      onClick={() => {
                        const current = toSafeNumber(draftStocks[product.id] ?? product.stock);
                        const next = Math.max(0, current - 1);
                        setDraftStocks(p => ({ ...p, [product.id]: String(next) }));
                        updateStock(product.id, next);
                      }}
                      disabled={toSafeNumber(draftStocks[product.id] ?? product.stock) <= 0}
                      className="w-12 bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                    >
                      -
                    </button>
                  </div>

                  {/* 3) 품절 처리 / 상품 삭제: 동일 높이 + 동일 간격 */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => deleteStockOnly(product.id)}
                      className="h-10 w-full rounded bg-orange-400 text-white hover:bg-orange-500"
                    >
                      품절 처리
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProduct(product.id)}
                      className="h-10 w-full rounded bg-red-500 text-white hover:bg-red-600"
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
