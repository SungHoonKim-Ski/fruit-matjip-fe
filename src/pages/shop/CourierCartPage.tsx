import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCart, updateQuantity, removeFromCart, CartItem, SelectedOption } from '../../utils/courierCart';
import { getCourierShippingFee, type ShippingFeeResponse } from '../../utils/api';
import { safeErrorLog } from '../../utils/environment';
import CourierBottomNav from '../../components/shop/CourierBottomNav';

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const getItemUnitPrice = (item: CartItem): number => {
  const optionExtra = (item.selectedOptions || []).reduce((s, o) => s + o.additionalPrice, 0);
  return item.price + optionExtra;
};

export default function CourierCartPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<CartItem[]>(() => getCart());
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    productId: number;
    productName: string;
    selectedOptions?: SelectedOption[];
  }>({
    isOpen: false, productId: 0, productName: '',
  });
  const [shippingFee, setShippingFee] = useState<ShippingFeeResponse | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);

  const refresh = useCallback(() => {
    setItems(getCart());
  }, []);

  const handleQuantityChange = (item: CartItem, diff: number) => {
    const next = item.quantity + diff;
    if (next < 1) return;
    if (next > item.stock) return;
    updateQuantity(item.courierProductId, next, item.selectedOptions);
    refresh();
  };

  const handleDirectInput = (item: CartItem, val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) {
      updateQuantity(item.courierProductId, 1, item.selectedOptions);
      refresh();
      return;
    }
    const clamped = Math.min(num, item.stock);
    updateQuantity(item.courierProductId, clamped, item.selectedOptions);
    refresh();
  };

  const openDeleteDialog = (item: CartItem) => {
    setDeleteDialog({ isOpen: true, productId: item.courierProductId, productName: item.name, selectedOptions: item.selectedOptions });
  };

  const confirmDelete = () => {
    removeFromCart(deleteDialog.productId, deleteDialog.selectedOptions);
    setDeleteDialog({ isOpen: false, productId: 0, productName: '' });
    refresh();
  };

  const totalPrice = items.reduce((sum, item) => sum + getItemUnitPrice(item) * item.quantity, 0);
  const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);

  // Fetch base shipping fee (no postal code)
  useEffect(() => {
    if (items.length === 0) {
      setShippingFee(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        setShippingLoading(true);
        const feeItems = items.map(i => ({ courierProductId: i.courierProductId, quantity: i.quantity }));
        const fee = await getCourierShippingFee(feeItems);
        if (alive) setShippingFee(fee);
      } catch (e) {
        safeErrorLog(e, 'CourierCartPage - getCourierShippingFee');
        if (alive) setShippingFee(null);
      } finally {
        if (alive) setShippingLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [items]);

  const handleCheckout = () => {
    const token = localStorage.getItem('access');
    if (!token) {
      localStorage.setItem('redirect-after-login', '/shop/checkout');
      nav('/login');
      return;
    }
    nav('/shop/checkout');
  };

  if (items.length === 0) {
    return (
      <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-24">
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
        <CourierBottomNav />
      </main>
    );
  }

  return (
    <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-40">

      <section className="max-w-md mx-auto px-4 mt-3">
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={`${item.courierProductId}:${(item.selectedOptions || []).map(o => o.optionId).sort().join(',')}-${idx}`} className="bg-white rounded-lg shadow p-3">
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
                      onClick={() => openDeleteDialog(item)}
                      className="ml-2 flex-shrink-0 text-gray-400 hover:text-red-500 transition"
                      aria-label={`${item.name} 삭제`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  {/* Selected options */}
                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {item.selectedOptions.map(o => o.optionName).join(', ')}
                      {item.selectedOptions.some(o => o.additionalPrice > 0) && (
                        <span className="ml-1">
                          (+{item.selectedOptions.reduce((s, o) => s + o.additionalPrice, 0).toLocaleString()}원)
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 text-sm font-bold text-orange-500">
                    {formatPrice(getItemUnitPrice(item) * item.quantity)}
                    {item.quantity > 1 && (
                      <span className="text-[10px] text-gray-400 font-normal ml-1">
                        ({formatPrice(getItemUnitPrice(item))} x {item.quantity})
                      </span>
                    )}
                  </div>
                  {/* Quantity controls */}
                  <div className="mt-2 flex items-center">
                    <div className="flex items-center border rounded-lg overflow-hidden h-8">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item, -1)}
                        disabled={item.quantity <= 1}
                        className="w-8 h-full bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm disabled:opacity-30"
                        aria-label="수량 감소"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => handleDirectInput(item, e.target.value)}
                        className="w-10 h-full text-center text-xs border-x outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        min={1}
                        max={item.stock}
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item, 1)}
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
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="space-y-1 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                총 {items.length}종 {totalQuantity}개
              </span>
              <span className="text-sm text-gray-700">{formatPrice(totalPrice)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>배송비 (예상)</span>
              <span>
                {shippingLoading ? '계산 중...' : shippingFee ? formatPrice(shippingFee.totalFee) : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-1">
              <span className="text-sm font-semibold text-gray-800">결제 예상액</span>
              <span className="text-lg font-bold text-orange-500">
                {formatPrice(totalPrice + (shippingFee?.totalFee ?? 0))}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCheckout}
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
      <CourierBottomNav />
    </main>
  );
}
