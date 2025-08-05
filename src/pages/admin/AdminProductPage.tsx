import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  {
    id: 1,
    name: '신선한 토마토 1kg',
    price: 4000,
    stock: 10,
    totalSold: 24,
    status: 'active',
    imageUrl: '/images/image1.png',
  },
  {
    id: 2,
    name: '유기농 감자 2kg',
    price: 3000,
    stock: 5,
    totalSold: 12,
    status: 'inactive',
    imageUrl: '/images/image2.png',
  },
];

export default function AdminProductPage() {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [originalProducts, setOriginalProducts] = useState<Product[]>(initialProducts);
  const navigate = useNavigate();

  const hasChanges = JSON.stringify(products) !== JSON.stringify(originalProducts);

  const toggleStatus = (id: number) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: p.status === 'active' ? 'inactive' : 'active' } : p
      )
    );
  };

  const updateStock = (id: number, value: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stock: Math.max(0, value) } : p))
    );
  };

  const deleteStockOnly = (id: number) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock: 0 } : p)));
  };

  const deleteProduct = (id: number) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleReset = () => {
    setProducts(originalProducts);
  };

  const handleApply = () => {
    // 실제로는 변경된 상품만 PATCH 등으로 API 전송
    setOriginalProducts(products);
    alert('변경 사항이 저장되었습니다.');
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 py-6">
      <div className="max-w-3xl mx-auto flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">📦 상품 관리</h1>
        <button
          onClick={() => navigate('/admin/products/new')}
          className="bg-orange-400 text-white px-4 py-2 rounded hover:bg-orange-500 text-sm"
        >
          + 상품 등록
        </button>
      </div>

      <div className="space-y-6 max-w-3xl mx-auto">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow p-4 space-y-2">
            <div className="flex items-start gap-4">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-32 h-32 object-cover rounded border"
        />
        <div className="flex-1 space-y-1">
          <h2 className="text-lg font-semibold">{product.name}</h2>
          <p className="text-sm text-gray-500">가격: {product.price.toLocaleString()}원</p>
          <p className="text-sm text-gray-500">누적 판매량: {product.totalSold}개</p>
          <p className="text-sm text-gray-500">
            노출:{' '}
            <span className={product.status === 'active' ? 'text-green-600' : 'text-gray-400'}>
              {product.status === 'active' ? '활성화' : '비활성화'}
            </span>
          </p>

          {/* 상태 토글 버튼 */}
          <button
            onClick={() => toggleStatus(product.id)}
            className="mt-2 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
          >
            판매 상태 변경
          </button>

          {/* 재고 조절 */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm">재고:</span>
            <div className="flex items-center border rounded overflow-hidden">
              <button
                onClick={() => updateStock(product.id, product.stock - 1)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                disabled={product.stock <= 0}
              >
                -
              </button>
              <span className="w-10 text-center">{product.stock}</span>
              <button
                onClick={() => updateStock(product.id, product.stock + 1)}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200"
              >
                +
              </button>
            </div>
          </div>

          {/* 삭제 버튼 두 개 수평 정렬 */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => deleteStockOnly(product.id)}
              className="flex-1 px-3 py-1 bg-orange-400 text-white text-sm rounded hover:bg-orange-500"
            >
              재고 삭제
            </button>
            <button
              onClick={() => deleteProduct(product.id)}
              className="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
            >
              상품 삭제
            </button>
          </div>
        </div>
      </div>
    </div>
        ))}
      </div>

      {/* 하단 적용 / 초기화 버튼 */}
      {hasChanges && (
        <div className="max-w-3xl mx-auto mt-6 flex justify-end gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 text-sm"
          >
            초기화
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
          >
            적용
          </button>
        </div>
      )}
    </main>
  );
}
