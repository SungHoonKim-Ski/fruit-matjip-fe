import React from 'react';
import { theme } from '../../brand';

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl bg-white border rounded-lg p-6 space-y-4 text-sm text-gray-700">
        <h1 className="text-xl font-semibold text-gray-800">교환/환불 정책</h1>
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
