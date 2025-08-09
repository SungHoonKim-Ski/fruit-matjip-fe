import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
const { show } = useSnackbar(); 

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  stock: number;
};

const formatPrice = (n: number) =>
  n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function CartPage() {
    const [cart, setCart] = useState<CartItem[]>(() => {
    try {
        const saved = localStorage.getItem('cart');
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
  });
  const navigate = useNavigate();

  // 로컬에서 장바구니 복원
  useEffect(() => {
  try {
      localStorage.setItem('cart', JSON.stringify(cart));
    } catch {

    }}, [cart]
  );
  // 저장 동기화
// useEffect(() => {
//   localStorage.setItem('cart', JSON.stringify(cart));
// }, [cart]);

  const totalQty = useMemo(() => cart.reduce((s, c) => s + c.quantity, 0), [cart]);
  const totalPrice = useMemo(() => cart.reduce((s, c) => s + c.price * c.quantity, 0), [cart]);

  const inc = (id: number) =>
  setCart(prev =>
      prev.map(c => {
      if (c.id !== id) return c;
      const max = c.stock ?? Number.POSITIVE_INFINITY;
      if (c.quantity >= max) {
          show(`재고를 초과할 수 없습니다. (최대 ${max}개)`, { variant: 'error' });
          return c;
      }
      return { ...c, quantity: c.quantity + 1 };
      })
  );

  const dec = (id: number) =>
    setCart(prev => prev.map(c => c.id === id ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c));
  const remove = (id: number) =>
    setCart(prev => prev.filter(c => c.id !== id));
  const clear = () => setCart([]);

  const handleConfirm = async () => {
    if (cart.length === 0) {
      show('장바구니가 비어있어요.', { variant: 'error' });
      return;
    }
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(c => ({ id: c.id, qty: c.quantity })),
          totalQty,
          totalPrice,
        }),
      });
      if (!res.ok) throw new Error('예약 생성 실패');

      show('예약이 확정되었습니다!');
      clear();
      navigate('/'); // 메인으로 이동(원하면 완료 페이지로 라우팅)
    } catch (e) {
      show('예약 중 오류가 발생했습니다.', { variant: 'error' });
    }
  };

  return (
    <main className="bg-[#f6f6f6] min-h-screen flex justify-center px-4 pt-16 pb-[calc(64px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
      {/* 상단바는 MainPage와 동일 컨벤션이라면 재사용 컴포넌트로 추출 추천 */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto w-full max-w-md h-14 flex items-center justify-between px-4">
          <button onClick={() => navigate(-1)} className="text-sm text-gray-600">← 뒤로</button>
          <div className="font-bold text-gray-800">장바구니</div>
          <div className="w-8" />
        </div>
      </div>

      <section className="w-full max-w-md">
        {/* 비었을 때 */}
        {cart.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-6 mt-4 text-center text-gray-500">
            장바구니가 비어있어요 😅
            <div className="mt-3">
              <button
                className="h-10 px-4 rounded bg-orange-400 text-white hover:bg-orange-500"
                onClick={() => navigate('/')}
              >
                상품 보러가기
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 리스트 */}
            <div className="space-y-3 mt-4">
              {cart.map(item => (
                <div key={item.id} className="bg-white rounded-lg shadow p-4 flex gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded object-cover border" />
                  ) : (
                    <div className="w-16 h-16 rounded bg-gray-100 border grid place-items-center text-gray-400">IMG</div>
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <h3 className="font-medium">{item.name}</h3>
                      <button
                        onClick={() => remove(item.id)}
                        className="text-xs text-gray-400 hover:text-red-500"
                      >
                        삭제
                      </button>
                    </div>

                    <div className="mt-1 flex justify-between text-sm text-gray-500">
                      <span>단가: {formatPrice(item.price)}</span>
                      <span>소계: {formatPrice(item.price * item.quantity)}</span>
                    </div>
<div className="mt-2 flex justify-end">
  <div className="inline-flex items-center border rounded overflow-hidden h-10">
    <button onClick={() => dec(item.id)} className="w-10 h-10 bg-gray-100 hover:bg-gray-200">-</button>
    {item.stock !== undefined && (
      <div className="px-2 text-xs text-gray-400 whitespace-nowrap">
        최대 {item.stock}개
      </div>
    )}                      
    <span className="w-12 text-center">{item.quantity}</span>
    <button
      onClick={() => inc(item.id)}
      className="w-10 h-10 bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
      disabled={item.stock !== undefined && item.quantity >= item.stock}
    >
      +
    </button>
  </div>
</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 합계 카드 */}
            <div className="bg-white rounded-lg shadow p-4 mt-4">
              <div className="flex justify-between text-sm text-gray-600">
                <span>총 수량</span>
                <span>{totalQty}개</span>
              </div>
              <div className="flex justify-between text-base font-semibold mt-1">
                <span>결제 예정 금액</span>
                <span className="text-orange-500">{formatPrice(totalPrice)}</span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* 하단 예약 확정 바 (고정) */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t">
          <div className="mx-auto w-full max-w-md flex items-center justify-between gap-3 p-3"
               style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <button
              onClick={clear}
              className="h-12 px-4 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
              type="button"
            >
              비우기
            </button>
            <button
              onClick={handleConfirm}
              className="h-12 flex-1 rounded bg-orange-500 hover:bg-orange-600 text-white font-medium"
              type="button"
            >
              예약 확정
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
