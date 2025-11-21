import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useSnackbar } from '../../components/snackbar';
import BottomNav from '../../components/BottomNav';

export default function CartPage() {
    const { cartItems, removeFromCart, updateQuantity, totalPrice, clearCart } = useCart();
    const navigate = useNavigate();
    const { show } = useSnackbar();

    const handleQuantityChange = (id: number, newQty: number) => {
        if (newQty < 1) return;
        updateQuantity(id, newQty);
    };

    const handleCheckout = () => {
        if (cartItems.length === 0) {
            show('장바구니가 비어있습니다.', { variant: 'error' });
            return;
        }
        navigate('/order/checkout');
    };

    if (cartItems.length === 0) {
        return (
            <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
                <p className="text-gray-500 text-lg mb-4">장바구니에 담긴 상품이 없습니다.</p>
                <button
                    onClick={() => navigate('/products')}
                    className="bg-orange-500 text-white px-6 py-2 rounded-lg font-bold hover:bg-orange-600 transition-colors"
                >
                    상품 보러가기
                </button>
            </div>
        );
    }

    return (
        <div className="pb-40 pt-16 max-w-3xl mx-auto min-h-screen bg-gray-50">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b z-50 flex items-center px-4">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-lg font-bold ml-2">장바구니</h1>
            </header>

            <div className="p-4 space-y-4">
                {cartItems.map(item => (
                    <div key={item.id} className="bg-white p-4 rounded-lg shadow flex gap-4">
                        <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-24 h-24 object-cover rounded-md bg-gray-100"
                        />
                        <div className="flex-1 flex flex-col justify-between">
                            <div>
                                <h3 className="font-bold text-lg">{item.name}</h3>
                                <p className="text-gray-500 text-sm">{item.sellDate} 수령</p>
                                <p className="font-bold text-orange-600 mt-1">
                                    {item.price.toLocaleString()}원
                                </p>
                            </div>

                            <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center border rounded-lg">
                                    <button
                                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                        className="px-3 py-1 hover:bg-gray-100 text-gray-600"
                                    >
                                        -
                                    </button>
                                    <span className="px-2 font-medium min-w-[2rem] text-center">
                                        {item.quantity}
                                    </span>
                                    <button
                                        onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                        className="px-3 py-1 hover:bg-gray-100 text-gray-600"
                                    >
                                        +
                                    </button>
                                </div>

                                <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="text-gray-400 hover:text-red-500 text-sm underline"
                                >
                                    삭제
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="fixed bottom-16 left-0 right-0 bg-white border-t p-4 safe-area-bottom z-30">
                <div className="max-w-3xl mx-auto">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-gray-600">총 결제금액</span>
                        <span className="text-xl font-bold text-orange-600">
                            {totalPrice.toLocaleString()}원
                        </span>
                    </div>
                    <button
                        onClick={handleCheckout}
                        className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold text-lg hover:bg-orange-600 transition-colors shadow-lg"
                    >
                        주문하기
                    </button>
                </div>
            </div>
            <BottomNav />
        </div>
    );
}
