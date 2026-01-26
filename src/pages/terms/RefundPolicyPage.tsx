import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../brand';

export default function RefundPolicyPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl bg-white border rounded-lg p-6 space-y-4 text-sm text-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="뒤로가기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-800">교환/환불 정책</h1>
        </div>
        <section>
          <h2 className="font-semibold text-gray-800">1. 서비스 제공 기간</h2>
          <p>수령일 당일 수령 또는 배달로 제공합니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-gray-800">2. 교환/환불</h2>
          <p>상품 수령 후 7일 이내 요청 가능합니다. 신선식품 특성상 변질/훼손 시 교환/환불이 제한될 수 있습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-gray-800">3. 이의신청 및 문의</h2>
          <p>교환/환불 및 이의신청은 고객센터로 문의해주세요. 문의: {theme.contact.phone}</p>
        </section>
      </div>
    </main>
  );
}
