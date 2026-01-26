import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../brand';

export default function TermsPage() {
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
          <h1 className="text-xl font-semibold text-gray-800">이용약관</h1>
        </div>
        <p>본 약관은 {theme.companyName}(이하 "회사")가 제공하는 과일 예약/구매 서비스 이용과 관련한 권리·의무를 규정합니다.</p>

        <section>
          <h2 className="font-semibold text-gray-800">1. 판매자 정보</h2>
          <ul className="mt-1 space-y-1">
            <li>상호명: {theme.companyName}</li>
            <li>대표자: {theme.contact.representative}</li>
            <li>사업자등록번호: {theme.contact.businessNumber}</li>
            {theme.contact.address && <li>사업장 주소: {theme.contact.address}</li>}
            <li>전화번호: {theme.contact.phone}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-gray-800">2. 서비스 제공 기간(배송/수령)</h2>
          <p>예약/결제 완료 후 지정된 수령일 기준으로 당일 수령 또는 배달이 진행됩니다.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-800">3. 결제 및 주문</h2>
          <p>결제 완료 시 주문이 확정됩니다. 결제 수단 및 절차는 서비스 화면에 안내됩니다.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-800">4. 정기결제</h2>
          <p>현재 정기결제를 제공하지 않습니다.</p>
        </section>
      </div>
    </main>
  );
}
