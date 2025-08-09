import React, { useState } from 'react';
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
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, status: p.status === 'active' ? 'inactive' : 'active' } : p)));

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

  // AdminProductPage.tsx

  const [draftStocks, setDraftStocks] = useState<Record<number, string>>({});

  const handleStockInput = (id: number, raw: string) => {
    const onlyDigits = raw.replace(/[^\d]/g, '');
    setDraftStocks((prev) => ({ ...prev, [id]: onlyDigits }));
  };

    const commitStock = (id: number, currentStock: number) => {
      const val = toSafeNumber(draftStocks[id] ?? currentStock);
      updateStock(id, val);
      setDraftStocks((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

  const toSafeNumber = (v: string | number, defaultValue = 0) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isNaN(n) ? defaultValue : Math.max(0, n);
  };

  return (
    <main
        className={`bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 ${
          hasChanges ? 'pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-6' : ''
        }`}
      >
      <div className="max-w-3xl mx-auto flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">📦 상품 관리</h1>
        <button
          type="button"
          onClick={() => navigate('/admin/products/new')}
          className="bg-orange-400 text-white px-4 py-2 rounded hover:bg-orange-500 text-sm"
        >
          + 상품 등록
        </button>
      </div>

      <div className="space-y-6 max-w-3xl mx-auto">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full sm:w-28 md:w-32 aspect-square object-cover rounded border"
              />
              <div className="flex-1 space-y-1">
                <h2 className="text-lg font-semibold break-keep">{product.name}</h2>
                <p className="text-sm text-gray-500">가격: {product.price.toLocaleString()}원</p>
                <p className="text-sm text-gray-500">누적 판매량: {product.totalSold}개</p>
                <p className="text-sm text-gray-500">
                  노출:{' '}
                  <span className={product.status === 'active' ? 'text-green-600' : 'text-gray-400'}>
                    {product.status === 'active' ? '활성화' : '비활성화'}
                  </span>
                </p>
              {/* 재고 (라벨 줄 + 컨트롤 줄) */}
              <div className="w-full pt-2 space-y-1 h-15 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => toggleStatus(product.id)}
                    className="btn btn-cta btn-secondary"
                  >
                    판매 상태 변경
                  </button>
                </div>
              <div className="w-full pt-2 space-y-1 flex flex-col items-center">
                <div className="flex w-full h-10">
                  {/* + 버튼 (왼쪽) */}
                  <button
                    type="button"
                    aria-label="재고 증가"
                    onClick={() => {
                      const current = toSafeNumber(draftStocks[product.id] ?? product.stock);
                      const next = current + 1;
                      setDraftStocks((p) => ({ ...p, [product.id]: String(next) }));
                      updateStock(product.id, next);
                    }}
                    className="w-1/6 h-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                  >
                    +
                  </button>

                  {/* 숫자 입력 (가운데, 남는 폭 전부 차지) */}
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={0}
                    className="w-2/3 text-center"
                    value={draftStocks[product.id] ?? String(product.stock)}
                    onChange={(e) => handleStockInput(product.id, e.target.value)}
                    onBlur={() => commitStock(product.id, product.stock)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                  />

                  {/* - 버튼 (오른쪽) */}
                  <button
                    type="button"
                    aria-label="재고 감소"
                    onClick={() => {
                      const current = toSafeNumber(draftStocks[product.id] ?? product.stock);
                      const next = Math.max(0, current - 1);
                      setDraftStocks((p) => ({ ...p, [product.id]: String(next) }));
                      updateStock(product.id, next);
                    }}
                    disabled={toSafeNumber(draftStocks[product.id] ?? product.stock) <= 0}
                    className="w-1/6 h-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                  >
                    -
                  </button>
                </div>
              </div>


                {/* 삭제 버튼 두 개 */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <button
                    type="button"
                    onClick={() => deleteStockOnly(product.id)}
                    className="btn btn-cta btn-muted w-full"
                  >
                    품절 처리
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProduct(product.id)}
                    className="btn btn-cta btn-danger w-full"
                  >
                    상품 삭제
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasChanges && (
        <div className="md:max-w-3xl md:mx-auto">
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t p-3 md:static md:border-0 md:bg-transparent md:p-0 mt-6">
            <div className="max-w-3xl mx-auto flex justify-end gap-3">
              <button type="button" onClick={handleReset} className="btn btn-cta btn-muted">초기화</button>
              <button type="button" onClick={handleApply} className="btn btn-cta btn-primary">적용</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
