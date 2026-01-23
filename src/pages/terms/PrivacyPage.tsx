import React from 'react';
import { theme } from '../../brand';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl bg-white border rounded-lg p-6 space-y-4 text-sm text-gray-700">
        <h1 className="text-xl font-semibold text-gray-800">개인정보처리방침</h1>
        <p>{theme.companyName}(이하 “회사”)는 관련 법령을 준수하며 개인정보를 안전하게 관리합니다.</p>
        <section>
          <h2 className="font-semibold text-gray-800">1. 수집 항목</h2>
          <p>이름, 연락처, 주문/예약 정보, 배송지 정보</p>
        </section>
        <section>
          <h2 className="font-semibold text-gray-800">2. 이용 목적</h2>
          <p>주문 처리, 배송/수령 안내, 고객 문의 대응</p>
        </section>
        <section>
          <h2 className="font-semibold text-gray-800">3. 보유 기간</h2>
          <p>관계 법령에 따른 보관 기간 종료 후 파기</p>
        </section>
      </div>
    </main>
  );
}
