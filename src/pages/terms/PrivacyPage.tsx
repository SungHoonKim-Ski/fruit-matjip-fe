import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../brand';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl bg-white border rounded-lg p-6 space-y-6 text-sm text-gray-700">
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
          <h1 className="text-xl font-semibold text-gray-800">개인정보처리방침</h1>
        </div>

        <p className="leading-relaxed">
          {theme.companyName}(이하 "회사")는 「개인정보 보호법」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관련 법령을 준수하며,
          이용자의 개인정보를 안전하게 보호하기 위해 최선을 다하고 있습니다. 본 개인정보처리방침은 회사가 운영하는
          서비스(이하 "서비스")에서 수집하는 개인정보의 처리에 관한 사항을 규정합니다.
        </p>

        {/* Section 1 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">1. 개인정보의 수집 항목 및 수집 방법</h2>
          <p className="leading-relaxed">회사는 서비스 제공을 위해 아래와 같은 개인정보를 수집합니다.</p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mt-2">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">수집 시점</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">수집 조건</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">수집 항목</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">수집 방법</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">카카오 소셜 로그인 시</td>
                  <td className="border border-gray-300 px-3 py-2 font-medium">필수</td>
                  <td className="border border-gray-300 px-3 py-2">카카오 닉네임</td>
                  <td className="border border-gray-300 px-3 py-2">카카오 OAuth 인증</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2">카카오 소셜 로그인 시</td>
                  <td className="border border-gray-300 px-3 py-2 font-medium">선택</td>
                  <td className="border border-gray-300 px-3 py-2">이름, 카카오계정 전화번호, 배송지 정보</td>
                  <td className="border border-gray-300 px-3 py-2">카카오 OAuth 인증 (이용자 동의)</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">택배 주문 시</td>
                  <td className="border border-gray-300 px-3 py-2 font-medium">필수</td>
                  <td className="border border-gray-300 px-3 py-2">수령인명, 전화번호, 배송지 주소</td>
                  <td className="border border-gray-300 px-3 py-2">이용자 직접 입력</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2">상품 예약·주문 시</td>
                  <td className="border border-gray-300 px-3 py-2 font-medium">필수</td>
                  <td className="border border-gray-300 px-3 py-2">주문·예약 정보 (주문 내역, 결제 정보)</td>
                  <td className="border border-gray-300 px-3 py-2">서비스 이용 중 자동 생성</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">관리자 계정 생성 시</td>
                  <td className="border border-gray-300 px-3 py-2 font-medium">필수</td>
                  <td className="border border-gray-300 px-3 py-2">이메일, 비밀번호 (암호화 저장)</td>
                  <td className="border border-gray-300 px-3 py-2">관리자 직접 입력</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2">서비스 이용 시</td>
                  <td className="border border-gray-300 px-3 py-2 font-medium">자동</td>
                  <td className="border border-gray-300 px-3 py-2">접속 로그, 쿠키, 기기 정보</td>
                  <td className="border border-gray-300 px-3 py-2">서비스 이용 과정에서 자동 수집</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">2. 개인정보의 이용 목적</h2>
          <ul className="list-disc list-inside space-y-1 pl-2 leading-relaxed">
            <li>상품 주문·예약 처리 및 이행</li>
            <li>배달 주문의 배송 안내 및 수령 확인</li>
            <li>공동구매 예약 수령 일정 안내</li>
            <li>고객 문의 접수 및 대응</li>
            <li>불만 처리 및 분쟁 해결</li>
            <li>서비스 개선을 위한 통계 분석(Google Analytics)</li>
            <li>부정 이용 방지 및 서비스 보안 유지</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">3. 개인정보의 보유 및 이용 기간</h2>
          <p className="leading-relaxed">
            회사는 원칙적으로 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.
            단, 관계 법령에 의해 보존해야 할 경우 아래 표에 따라 보관합니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mt-2">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">보존 항목</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">보존 기간</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">근거 법령</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">계약 또는 청약철회 기록</td>
                  <td className="border border-gray-300 px-3 py-2">5년</td>
                  <td className="border border-gray-300 px-3 py-2">전자상거래 등에서의 소비자 보호에 관한 법률</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2">대금 결제 및 재화 공급 기록</td>
                  <td className="border border-gray-300 px-3 py-2">5년</td>
                  <td className="border border-gray-300 px-3 py-2">전자상거래 등에서의 소비자 보호에 관한 법률</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">소비자 불만 또는 분쟁 처리 기록</td>
                  <td className="border border-gray-300 px-3 py-2">3년</td>
                  <td className="border border-gray-300 px-3 py-2">전자상거래 등에서의 소비자 보호에 관한 법률</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2">서비스 접속 로그</td>
                  <td className="border border-gray-300 px-3 py-2">3개월</td>
                  <td className="border border-gray-300 px-3 py-2">통신비밀보호법</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">회원 탈퇴 시 개인정보</td>
                  <td className="border border-gray-300 px-3 py-2">즉시 파기</td>
                  <td className="border border-gray-300 px-3 py-2">개인정보 보호법</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">4. 개인정보 처리 위탁</h2>
          <p className="leading-relaxed">
            회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하고 있습니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mt-2">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">수탁 업체</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">위탁 업무</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">보유 기간</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">주식회사 카카오(Kakao Corp.)</td>
                  <td className="border border-gray-300 px-3 py-2">카카오 소셜 로그인 인증, 사용자 식별</td>
                  <td className="border border-gray-300 px-3 py-2">위탁 계약 종료 시 또는 카카오 정책에 따름</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2">주식회사 카카오페이(Kakao Pay Corp.)</td>
                  <td className="border border-gray-300 px-3 py-2">결제 처리 및 결제 정보 관리</td>
                  <td className="border border-gray-300 px-3 py-2">위탁 계약 종료 시 또는 카카오페이 정책에 따름</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 5 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">5. 개인정보의 제3자 제공</h2>
          <p className="leading-relaxed">
            회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 아래의 경우에는 서비스 제공을 위해 필요한 최소한의 정보를 제공합니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mt-2">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">제공 대상</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">제공 목적</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">제공 항목</th>
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">보유 기간</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">Google LLC</td>
                  <td className="border border-gray-300 px-3 py-2">서비스 이용 통계 분석 (Google Analytics)</td>
                  <td className="border border-gray-300 px-3 py-2">서비스 접속 기록, 행동 데이터 (비식별)</td>
                  <td className="border border-gray-300 px-3 py-2">Google 정책에 따름</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="leading-relaxed text-xs text-gray-500 mt-1">
            각 제3자의 개인정보 처리방침은 해당 서비스의 공식 홈페이지에서 확인하실 수 있습니다.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">6. 개인정보의 파기 절차 및 방법</h2>
          <p className="leading-relaxed">
            회사는 개인정보 보유 기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 해당 개인정보를 파기합니다.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2 leading-relaxed">
            <li>
              <span className="font-medium">전자적 파일 형태:</span> 복구·재생이 불가능한 기술적 방법(데이터 완전 삭제)으로 영구 삭제
            </li>
            <li>
              <span className="font-medium">종이 문서 형태:</span> 분쇄기로 분쇄하거나 소각하여 파기
            </li>
          </ul>
        </section>

        {/* Section 7 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">7. 개인정보 보호책임자</h2>
          <p className="leading-relaxed">
            이용자의 개인정보를 보호하고 개인정보 관련 불만을 처리하기 위해 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
          </p>
          <div className="bg-gray-50 rounded-md p-4 space-y-1 text-sm">
            <p><span className="font-medium">책임자:</span> {theme.contact.representative}</p>
            <p><span className="font-medium">연락처:</span> {theme.contact.phone}</p>
            <p><span className="font-medium">주소:</span> {theme.contact.address}</p>
            <p><span className="font-medium">사업자등록번호:</span> {theme.contact.businessNumber}</p>
          </div>
          <p className="leading-relaxed text-xs text-gray-500">
            개인정보 관련 문의, 불만 처리, 피해 구제 등의 요청은 위 연락처로 접수하시면 빠르게 처리하겠습니다.
            기타 개인정보 침해 신고는 개인정보보호위원회(privacy.go.kr, 국번없이 182) 또는 한국인터넷진흥원(kisa.or.kr, 국번없이 118)에 문의하실 수 있습니다.
          </p>
        </section>

        {/* Section 8 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">8. 이용자의 권리와 행사 방법</h2>
          <p className="leading-relaxed">
            이용자는 언제든지 자신의 개인정보에 대해 아래 권리를 행사할 수 있습니다.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2 leading-relaxed">
            <li>개인정보 열람 요청</li>
            <li>개인정보 정정·수정 요청</li>
            <li>개인정보 삭제(회원 탈퇴) 요청</li>
            <li>개인정보 처리 정지 요청</li>
          </ul>
          <p className="leading-relaxed">
            권리 행사는 카카오톡 채널 문의 또는 전화({theme.contact.phone})를 통해 요청하실 수 있으며,
            회사는 지체 없이 조치하겠습니다. 단, 법령에 따라 보존 의무가 있는 정보는 삭제가 제한될 수 있습니다.
          </p>
        </section>

        {/* Section 9 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">9. 쿠키 및 자동 수집 장치</h2>
          <p className="leading-relaxed">
            회사는 서비스 이용 과정에서 아래 목적으로 쿠키를 사용합니다.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2 leading-relaxed">
            <li>로그인 인증 유지</li>
            <li>관리자 세션 유지</li>
            <li>서비스 이용 통계 분석 (Google Analytics)</li>
          </ul>
          <p className="leading-relaxed">
            이용자는 웹 브라우저 설정에서 쿠키 저장을 거부할 수 있습니다.
            단, 쿠키를 거부하는 경우 로그인 등 일부 기능이 정상적으로 동작하지 않을 수 있습니다.
          </p>
        </section>

        {/* Section 10 */}
        <section className="space-y-2">
          <h2 className="font-semibold text-gray-800 text-base">10. 개인정보처리방침 변경</h2>
          <p className="leading-relaxed">
            본 개인정보처리방침은 법령 개정 또는 서비스 변경에 따라 내용이 추가·변경·삭제될 수 있습니다.
            변경 사항이 발생할 경우 서비스 내 공지사항을 통해 변경 내용과 시행일을 사전에 안내하겠습니다.
            중요한 권리·의무 변경이 있을 경우 서비스 접속 시 팝업 또는 별도 알림으로 고지합니다.
          </p>
        </section>

        {/* Effective date */}
        <section className="border-t pt-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            본 개인정보처리방침은 <span className="font-medium">2026년 2월 23일</span>부터 시행됩니다.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            회사명: {theme.companyName} &nbsp;|&nbsp; 대표자: {theme.contact.representative} &nbsp;|&nbsp; 사업자등록번호: {theme.contact.businessNumber}
          </p>
        </section>
      </div>
    </main>
  );
}
