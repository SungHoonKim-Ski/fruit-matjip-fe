import React, { useState } from 'react';

type Product = {
  id: number;
  name: string;
  quantity: number;
  price: number;
  stock: number;
  sellTime: number;
  imageUrl: string;
};

const formatTime = (hour: number) => {
  const isAM = hour < 12;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${isAM ? '오전' : '오후'} ${displayHour}시`;
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const initialProducts: Product[] = [
  {
    id: 1,
    name: '신선한 토마토 1kg',
    quantity: 0,
    price: 3000,
    stock: 8,
    sellTime: 10,
    imageUrl: '/images/image1.png',
  },
  {
    id: 2,
    name: '유기농 감자 2kg',
    quantity: 0,
    price: 3000,
    stock: 0,
    sellTime: 12,
    imageUrl: '/images/image2.png',
  },
  {
    id: 3,
    name: '햇양파 1.5kg',
    quantity: 0,
    price: 3000,
    stock: 12,
    sellTime: 21,
    imageUrl: '/images/image3.png',
  },
];

export default function MainPage() {
  const [products, setProducts] = useState(initialProducts);

  const handleQuantity = (id: number, diff: number) => {
    setProducts(prev =>
      prev.map(p =>
        p.id === id
          ? {
              ...p,
              quantity: Math.max(0, Math.min(p.stock, p.quantity + diff)),
            }
          : p
      )
    );
  };

  const handleReserve = (product: Product) => {
    if (product.quantity > 0) {
      alert(`${product.name} ${product.quantity}개 예약 완료`);
    } else {
      alert('1개 이상 선택해주세요.');
    }
  };

  return (
    <main className="bg-[#f6f6f6] min-h-screen flex justify-center px-4 py-6">
      <section className="w-full max-w-md">
        {/* 안내문구 */}
        <div className="bg-white p-5 rounded-xl shadow mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">🛒 오늘장보기</h1>
          <p className="text-sm text-gray-600">
            이웃과 함께하는 공동구매 플랫폼<br />
            합리적인 가격으로 신선한 식재료를 만나보세요!
          </p>
        </div>

        {/* 상품 목록 */}
        <div className="space-y-4">
          {products.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow-md overflow-hidden"
            >
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-48 object-cover"
              />
              <div className="p-4">
                <h2 className="text-lg font-semibold">{item.name}</h2>
                <p className="text-sm text-gray-500">판매 예정 시간: {formatTime(item.sellTime)}</p>
                <p className="text-sm text-gray-500">재고: {item.stock}개</p>
                <p className="text-sm text-orange-500 font-semibold">{formatPrice(item.price)}</p>

                <div className="flex items-center justify-between mt-3 gap-2">
                  <div className="flex items-center border rounded overflow-hidden">
                    <button
                      onClick={() => handleQuantity(item.id, -1)}
                      className="w-8 h-8 bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                      disabled={item.quantity <= 0}
                    >
                      -
                    </button>
                    <span className="w-10 text-center">{item.quantity}</span>
                    <button
                      onClick={() => handleQuantity(item.id, 1)}
                      className="w-8 h-8 bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                      disabled={item.quantity >= item.stock}
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => handleReserve(item)}
                    disabled={item.stock === 0}
                    className={`flex-1 text-white py-2 rounded text-sm transition ${
                      item.stock === 0
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-orange-400 hover:bg-orange-500'
                    }`}
                  >
                    {item.stock === 0 ? '품절' : '예약하기'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
