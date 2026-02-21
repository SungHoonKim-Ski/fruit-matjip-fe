import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCart, updateQuantity, removeFromCart, CartItem } from '../../utils/courierCart';
import CourierNav from '../../components/shop/CourierNav';

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function CourierCartPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<CartItem[]>(() => getCart());
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; productId: number; productName: string }>({
    isOpen: false, productId: 0, productName: '',
  });

  const refresh = useCallback(() => {
    setItems(getCart());
  }, []);

  const handleQuantityChange = (productId: number, diff: number) => {
    const item = items.find(c => c.courierProductId === productId);
    if (!item) return;
    const next = item.quantity + diff;
    if (next < 1) return;
    if (next > item.stock) return;
    updateQuantity(productId, next);
    refresh();
  };

  const handleDirectInput = (productId: number, val: string) => {
    const item = items.find(c => c.courierProductId === productId);
    if (!item) return;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) {
      updateQuantity(productId, 1);
      refresh();
      return;
    }
    const clamped = Math.min(num, item.stock);
    updateQuantity(productId, clamped);
    refresh();
  };

  const openDeleteDialog = (productId: number, productName: string) => {
    setDeleteDialog({ isOpen: true, productId, productName });
  };

  const confirmDelete = () => {
    removeFromCart(deleteDialog.productId);
    setDeleteDialog({ isOpen: false, productId: 0, productName: '' });
    refresh();
  };

  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (items.length === 0) {
    return (
      <main className="bg-[#f6f6f6] min-h-screen pt-14">
        <CourierNav title="장바구니" backTo="/shop" showCart={false} />
        <div className="max-w-md mx-auto px-4 mt-20 text-center">
          <svg className="mx-auto mb-4 w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />
          </svg>
          <p className="text-gray-500 font-medium">장바구니가 비어있습니다</p>
          <p className="text-sm text-gray-400 mt-1">마음에 드는 상품을 담아보세요</p>
          <button
            type="button"
            onClick={() => nav('/shop')}
            className="mt-6 h-11 px-6 rounded-lg bg-orange-500 text-white font-medium text-sm hover:bg-orange-600 transition"
          >
            쇼핑하기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-[#f6f6f6] min-h-screen pt-14 pb-40">
      <CourierNav title="장바구니" backTo="/shop" showCart={false} />

      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.courierProductId} className="bg-white rounded-lg shadow p-3">
              <div className="flex gap-3">
                {/* Thumbnail */}
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-20 h-20 object-cover rounded-lg border flex-shrink-0 cursor-pointer"
                  onClick={() => nav(`/shop/${item.courierProductId}`)}
                />
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h3
                      className="text-sm font-medium text-gray-800 leading-tight line-clamp-2 cursor-pointer hover:underline"
                      onClick={() => nav(`/shop/${item.courierProductId}`)}
                    >
                      {item.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => openDeleteDialog(item.courierProductId, item.name)}
                      className="ml-2 flex-shrink-0 text-gray-400 hover:text-red-500 transition"
                      aria-label={`${item.name} 삭제`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-1 text-sm font-bold text-orange-500">
                    {formatPrice(item.price * item.quantity)}
                    {item.quantity > 1 && (
                      <span className="text-[10px] text-gray-400 font-normal ml-1">
                        ({formatPrice(item.price)} x {item.quantity})
                      </span>
                    )}
                  </div>
                  {/* Quantity controls */}
                  <div className="mt-2 flex items-center">
                    <div className="flex items-center border rounded-lg overflow-hidden h-8">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.courierProductId, -1)}
                        disabled={item.quantity <= 1}
                        className="w-8 h-full bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm disabled:opacity-30"
                        aria-label="수량 감소"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => handleDirectInput(item.courierProductId, e.target.value)}
                        className="w-10 h-full text-center text-xs border-x outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        min={1}
                        max={item.stock}
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item.courierProductId, 1)}
                        disabled={item.quantity >= item.stock}
                        className="w-8 h-full bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm disabled:opacity-30"
                        aria-label="수량 증가"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom: Summary + Order button */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">
              총 {items.length}종 {items.reduce((s, i) => s + i.quantity, 0)}개
            </span>
            <span className="text-lg font-bold text-gray-900">{formatPrice(totalPrice)}</span>
          </div>
          <button
            type="button"
            onClick={() => nav('/shop/checkout')}
            className="w-full h-12 rounded-lg bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition"
          >
            주문하기
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteDialog.isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteDialog({ isOpen: false, productId: 0, productName: '' })} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">상품 삭제</h3>
            <p className="text-gray-600 text-sm mb-6">
              <span className="font-medium">"{deleteDialog.productName}"</span>을(를) 장바구니에서 삭제하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteDialog({ isOpen: false, productId: 0, productName: '' })}
                className="flex-1 h-10 rounded-lg border text-gray-700 hover:bg-gray-50 text-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 h-10 rounded-lg bg-red-500 text-white hover:bg-red-600 text-sm font-medium"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
