import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

type Product = {
  id: number;
  name: string;
  quantity: number;
  price: number;
  stock: number;
  imageUrl: string;
};
type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  stock: number;
  imageUrl: string; 
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const initialProducts: Product[] = [
  { id: 1, name: '신선한 토마토 1kg', quantity: 0, price: 3000, stock: 8, imageUrl: '/images/image1.png' },
  { id: 2, name: '유기농 감자 2kg', quantity: 0, price: 3000, stock: 0, imageUrl: '/images/image2.png' },
  { id: 3, name: '햇양파 1.5kg',   quantity: 0, price: 3000, stock: 12, imageUrl: '/images/image3.png' },
];

export default function MainPage() {
  const [products, setProducts] = useState(initialProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [nickname] = useState('과일러'); // 우상단 표시용 닉네임
  const navigate = useNavigate();

  // 1) 첫 로드 시 복원
  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) setCart(JSON.parse(savedCart));
  }, []);

  // 2) cart 변경될 때 저장
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const handleQuantity = (id: number, diff: number) => {
    setProducts(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, quantity: Math.max(0, Math.min(p.stock, p.quantity + diff)) }
          : p
      )
    );
  };

  const handleReserve = (product: Product) => {
      if (product.quantity <= 0) {
        toast.error('1개 이상 선택해주세요.');
        return;
      }
      if (product.quantity > product.stock) {
        toast.error('재고보다 많이 담을 수 없어요.');
        return;
      }

      setCart(prev => {
        const idx = prev.findIndex(i => i.id === product.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            quantity: next[idx].quantity + product.quantity,
          };
          return next;
        }
        return [
          ...prev,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: product.quantity,
            imageUrl: product.imageUrl,
            stock: product.stock,
          },
        ];
      });
      toast.success(`${product.name} ${product.quantity}개 장바구니에 담겼어요!`);
      // 담은 뒤 UI 수량 초기화(선택)
      setProducts(prev =>
        prev.map(p => (p.id === product.id ? { ...p, quantity: 0 } : p))
      );
  };


  return (
    <main className="bg-[#f6f6f6] min-h-screen flex justify-center px-4 py-6 sm:px-6 lg:px-8 pt-16">
     {/* 상단 바: 과일맛집 / 닉네임 / 장바구니 */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        {/* 내부를 메인과 같은 폭으로 고정(max-w-md) + 기존 패딩/간격 유지 */}
        <div className="mx-auto w-full max-w-md h-14 flex items-center justify-between px-4">
          {/* 좌측: 쇼핑몰명 — 기존 여백 유지(ml-1) */}
          <div className="ml-1 text-lg font-bold text-gray-800">
            과일맛집 1955
          </div>

          {/* 우측 묶음: 닉네임 + 장바구니 — 기존 간격 유지(gap-2) + 오른쪽 여백(mr-1) */}
          <div className="flex items-center gap-2 mr-1">
            <div className="text-sm text-gray-700 truncate max-w-[100px] text-center">
              {nickname}가나다라님
            </div>
            <button
              type="button"
              onClick={() => navigate('/cart')}
              className="relative grid place-items-center h-10 w-10 rounded-full bg-white border border-gray-300 shadow-sm hover:shadow-md active:scale-[0.97] transition"
              aria-label="장바구니"
              title="장바구니"
            >
              🛒
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
      <section className="w-full max-w-md">
        <div className="bg-white p-5 rounded-xl shadow mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">🛒 과일맛집 🛒</h1>
          <p className="text-sm text-gray-600">
            🎁과일맛집1995 현장예약<br />
            더욱 혜택넘치는 가격으로<br />
            우리들끼리 예약하고 먹자구요🤣
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {products.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="p-4">
                <h2 className="text-lg font-semibold">{item.name}</h2>            
                <div className="flex justify-between text-sm text-gray-500">
                  <span>재고: {item.stock}개</span>
                  <span className="text-sm text-orange-500 font-semibold">{formatPrice(item.price)}</span>
                </div>                    

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {/* 카운터: 모바일에서 auto-width로 중앙 또는 좌측에 딱 맞게 */}
                {/* 카운터: 전체 폭 사용, - 왼쪽 / + 오른쪽 */}
                <div className="flex items-center border rounded overflow-hidden w-full sm:w-40 h-10">
                  {/* - 버튼 (왼쪽) */}
                  <button
                    onClick={() => handleQuantity(item.id, -1)}
                    
                    className="w-1/6 h-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                    disabled={item.quantity <= 0}
                    aria-label="수량 감소"
                  >
                    -
                  </button>

                  {/* 수량 표시 (가운데) */}
                  <span className="w-2/3 text-center">{item.quantity}</span>

                  {/* + 버튼 (오른쪽) */}
                  <button
                    onClick={() => handleQuantity(item.id, 1)}
                    className="w-1/6 h-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                    disabled={item.quantity >= item.stock}
                    aria-label="수량 증가"
                  >
                    +
                  </button>
                </div>

                  {/* CTA: 모바일은 꽉, sm 이상은 고정폭으로 통일 */}
                  <button
                    onClick={() => handleReserve(item)}
                    disabled={item.stock === 0}
                    className={`btn btn-cta ${item.stock === 0 ? 'btn-disabled' : 'btn-primary'} w-full sm:w-28`}
                  >
                    {item.stock === 0 ? '품절' : '예약하기'}
                  </button>
                </div>

              </div>
            </div>
          ))}
        </div>

        <footer className="mt-10 text-center text-gray-400 text-xs sm:text-sm space-y-1">
          <p className="font-semibold text-gray-500">과일맛집</p>
          <p>대표: 김지훈</p>
          <p>사업자등록번호: 131-47-00411</p>
          <p>문의: 02-2666-7412</p>
          <p className="mt-1">&copy; 2025 All rights reserved.</p>
        </footer>

        <div className="text-center mt-8">
          <button
            onClick={() => navigate('/admin/login')}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
            type="button"
          >
            관리자 페이지로 이동 →
          </button>
        </div>
      </section>
    </main>
  );
}
