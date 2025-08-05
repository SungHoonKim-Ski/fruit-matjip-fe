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
  const [products, setProducts] = useState(initialProducts);
  const navigate = useNavigate();

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

return (
  <main className="bg-gray-50 min-h-screen px-4 py-6">
    {/* 상단 헤더 */}
    <div className="max-w-3xl mx-auto flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold text-gray-800">📦 상품 관리</h1>
      <button
        onClick={() => navigate('/admin/products/new')}
        className="bg-orange-400 text-white px-4 py-2 rounded hover:bg-orange-500 text-sm"
      >
        + 상품 등록
      </button>
    </div>

    {/* 상품 목록 */}
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
              <p className="text-sm text-gray-500">재고: {product.stock}개</p>
              <p className="text-sm text-gray-500">누적 판매량: {product.totalSold}개</p>
              <p className="text-sm text-gray-500">
                상태:{' '}
                <span
                  className={
                    product.status === 'active' ? 'text-green-600' : 'text-gray-400'
                  }
                >
                  {product.status === 'active' ? '활성화' : '비활성화'}
                </span>
              </p>

              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={() => toggleStatus(product.id)}
                  className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                >
                  상태 토글
                </button>
                <button
                  onClick={() => updateStock(product.id, product.stock + 1)}
                  className="px-3 py-1 bg-gray-300 text-sm rounded hover:bg-gray-400"
                >
                  재고 +1
                </button>
                <button
                  onClick={() => updateStock(product.id, product.stock - 1)}
                  className="px-3 py-1 bg-gray-300 text-sm rounded hover:bg-gray-400"
                >
                  재고 -1
                </button>
                <button
                  onClick={() => deleteStockOnly(product.id)}
                  className="px-3 py-1 bg-orange-400 text-white text-sm rounded hover:bg-orange-500"
                >
                  재고 삭제
                </button>
                <button
                  onClick={() => deleteProduct(product.id)}
                  className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
                >
                  상품 삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </main>
);

}
