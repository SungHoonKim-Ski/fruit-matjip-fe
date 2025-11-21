import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useSnackbar } from '../../components/snackbar';
import { requestPayment } from '../../utils/payment';
import { createOrder } from '../../utils/api';
import BottomNav from '../../components/BottomNav';

// Daum Postcode API type declaration
declare global {
    interface Window {
        daum: any;
    }
}

type DeliveryMethod = 'delivery' | 'parcel' | 'walkin';

export default function OrderCheckoutPage() {
    const { cartItems, totalPrice, clearCart } = useCart();
    const navigate = useNavigate();
    const { show } = useSnackbar();

    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('walkin');
    const [address, setAddress] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [detailAddress, setDetailAddress] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (cartItems.length === 0) {
            navigate('/products', { replace: true });
        }
        // Load saved user info if available
        const savedNick = localStorage.getItem('nickname');
        if (savedNick && savedNick !== '신규 고객') {
            setRecipientName(savedNick);
        }
    }, [cartItems, navigate]);

    // 배달비/택배비 설정 로드 (관리자 설정 시뮬레이션)
    const [deliveryFee, setDeliveryFee] = useState(0);
    useEffect(() => {
        const fees = JSON.parse(localStorage.getItem('admin_fees') || '{"delivery": 3000, "parcel": 3000}');
        if (deliveryMethod === 'delivery') {
            setDeliveryFee(Number(fees.delivery) || 0);
        } else if (deliveryMethod === 'parcel') {
            setDeliveryFee(Number(fees.parcel) || 0);
        } else {
            setDeliveryFee(0);
        }
    }, [deliveryMethod]);

    const finalAmount = totalPrice + deliveryFee;

    const handleAddressSearch = () => {
        new window.daum.Postcode({
            oncomplete: function (data: any) {
                // 도로명 주소 또는 지번 주소를 선택
                const fullAddress = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
                setAddress(fullAddress);
                setPostalCode(data.zonecode); // 우편번호 저장

                // 건물명이 있으면 상세주소에 포함
                if (data.buildingName) {
                    setDetailAddress(`(${data.buildingName}) `);
                } else {
                    setDetailAddress('');
                }
            }
        }).open();
    };

    const handlePayment = async () => {
        // 매장 수령이 아닐 경우에만 필수값 체크
        if (deliveryMethod !== 'walkin') {
            if (!recipientName.trim()) {
                show('수령인 이름을 입력해주세요.', { variant: 'error' });
                return;
            }
            if (!recipientPhone.trim()) {
                show('휴대폰 번호를 입력해주세요.', { variant: 'error' });
                return;
            }
            if (!address.trim()) {
                show('주소를 입력해주세요.', { variant: 'error' });
                return;
            }
        }

        setIsProcessing(true);

        try {
            // 1. Request Payment
            const paymentData = {
                pg: 'kakaopay', // or 'html5_inicis' for card
                pay_method: 'card',
                merchant_uid: `mid_${Date.now()}`,
                name: cartItems.length > 1
                    ? `${cartItems[0].name} 외 ${cartItems.length - 1}건`
                    : cartItems[0].name,
                amount: finalAmount,
                buyer_email: '',
                buyer_name: recipientName,
                buyer_tel: recipientPhone,
                buyer_addr: deliveryMethod !== 'walkin' ? `${address} ${detailAddress}` : '',
                buyer_postcode: '',
            };

            const paymentResponse = await requestPayment(paymentData);

            if (!paymentResponse.success) {
                show(paymentResponse.error_msg || '결제에 실패했습니다.', { variant: 'error' });
                setIsProcessing(false);
                return;
            }

            // 2. Create Order on Backend
            const orderData = {
                imp_uid: paymentResponse.imp_uid,
                merchant_uid: paymentResponse.merchant_uid,
                items: cartItems.map(item => ({
                    product_id: item.id,
                    quantity: item.quantity,
                    price: item.price
                })),
                delivery_info: {
                    method: deliveryMethod,
                    recipient_name: recipientName,
                    recipient_phone: recipientPhone,
                    address: deliveryMethod !== 'walkin' ? `${address} ${detailAddress}` : null
                },
                total_amount: finalAmount
            };

            await createOrder(orderData);

            clearCart();
            show('주문이 완료되었습니다!', { variant: 'success' });
            navigate('/me/orders', { replace: true });

        } catch (e: any) {
            console.error(e);
            show('주문 처리 중 오류가 발생했습니다.', { variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="pb-40 pt-16 max-w-3xl mx-auto min-h-screen bg-gray-50">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b z-50 flex items-center px-4">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <h1 className="text-lg font-bold ml-2">주문서 작성</h1>
            </header>

            <div className="p-4 space-y-6">
                {/* 수령 방법 */}
                <section className="bg-white p-4 rounded-lg shadow space-y-4">
                    <h2 className="font-bold text-lg">수령 방법</h2>
                    <div className="grid grid-cols-3 gap-3">
                        <div
                            onClick={() => setDeliveryMethod('walkin')}
                            className={`border rounded-xl p-3 text-center cursor-pointer transition-all ${deliveryMethod === 'walkin'
                                ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-200'
                                : 'border-gray-200 hover:border-orange-300'
                                }`}
                        >
                            <div className="font-bold">매장 수령</div>
                        </div>
                        <div
                            onClick={() => setDeliveryMethod('delivery')}
                            className={`border rounded-xl p-3 text-center cursor-pointer transition-all ${deliveryMethod === 'delivery'
                                ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-200'
                                : 'border-gray-200 hover:border-orange-300'
                                }`}
                        >
                            <div className="font-bold">배달</div>
                        </div>
                        <div
                            onClick={() => setDeliveryMethod('parcel')}
                            className={`border rounded-xl p-3 text-center cursor-pointer transition-all ${deliveryMethod === 'parcel'
                                ? 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-200'
                                : 'border-gray-200 hover:border-orange-300'
                                }`}
                        >
                            <div className="font-bold">택배</div>
                        </div>
                    </div>


                </section>

                {/* 주문 상품 정보 */}
                <section className="bg-white p-4 rounded-lg shadow">
                    <h2 className="font-bold text-lg mb-4">주문 상품</h2>
                    <div className="space-y-2">
                        {cartItems.map(item => (
                            <div key={item.id} className="flex justify-between text-sm">
                                <span className="text-gray-600">
                                    {item.name} <span className="text-gray-400">x{item.quantity}</span>
                                </span>
                                <span className="font-medium">
                                    {(item.price * item.quantity).toLocaleString()}원
                                </span>
                            </div>
                        ))}
                        <div className="flex justify-between text-sm text-gray-600 pt-2 border-t">
                            <span>배송비 ({deliveryMethod === 'walkin' ? '매장수령' : deliveryMethod === 'delivery' ? '배달' : '택배'})</span>
                            <span>{deliveryFee.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg pt-2">
                            <span>총 결제금액</span>
                            <span className="text-orange-600">{finalAmount.toLocaleString()}원</span>
                        </div>
                    </div>
                </section>

                {/* 배송 정보 (매장 수령 시 숨김) */}
                {deliveryMethod !== 'walkin' && (
                    <section className="bg-white p-4 rounded-lg shadow space-y-4">
                        <h2 className="font-bold text-lg">배송 정보</h2>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                            <input
                                type="text"
                                value={recipientName}
                                onChange={e => setRecipientName(e.target.value)}
                                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-orange-500 outline-none"
                                placeholder="수령인 이름을 입력하세요"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">휴대폰 번호</label>
                            <input
                                type="tel"
                                value={recipientPhone}
                                onChange={e => setRecipientPhone(e.target.value)}
                                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-orange-500 outline-none"
                                placeholder="010-0000-0000"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                            <div className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    value={postalCode}
                                    className="w-24 border rounded-lg p-2 bg-gray-50 text-gray-600 outline-none"
                                    placeholder="우편번호"
                                    readOnly
                                />
                                <button
                                    type="button"
                                    onClick={handleAddressSearch}
                                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 whitespace-nowrap font-medium"
                                >
                                    주소 검색
                                </button>
                            </div>
                            <input
                                type="text"
                                value={address}
                                className="w-full border rounded-lg p-2 bg-gray-50 text-gray-600 outline-none mb-2"
                                placeholder="기본 주소"
                                readOnly
                            />
                            <input
                                type="text"
                                value={detailAddress}
                                onChange={e => setDetailAddress(e.target.value)}
                                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-orange-500 outline-none"
                                placeholder="상세 주소 (동/호수 등)"
                            />
                        </div>
                    </section>
                )}


            </div>



            <div className="fixed bottom-16 left-0 right-0 bg-white border-t p-4 safe-area-bottom z-30">
                <div className="max-w-3xl mx-auto">
                    <button
                        onClick={handlePayment}
                        disabled={isProcessing}
                        className={`w-full py-3 rounded-xl font-bold text-lg text-white shadow-lg transition-colors
              ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-500 text-black'}
            `}
                    >
                        {isProcessing ? '결제 처리 중...' : '카카오페이로 결제하기'}
                    </button>
                </div>
            </div>
            <BottomNav />
        </div >
    );
}
