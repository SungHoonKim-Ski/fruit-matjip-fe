// src/pages/MainPage.tsx

import React from 'react';

export default function MainPage() {
  return (
    <main className="flex flex-col items-center bg-[#F6F6F6] min-h-screen px-4 py-6">
      <section className="w-full max-w-md">
        {/* 상단 안내문구 */}
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <h1 className="text-xl font-bold text-gray-800">오늘장보기</h1>
          <p className="text-sm text-gray-600">우리 동네에서 이웃들과 함께하는 공동구매 플랫폼</p>
        </div>

        {/* 재고 리스트 예시 */}
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:ring-2 ring-orange-400 transition"
            >
              <img
                src={`/images/image${item}.png`}
                alt={`상품 이미지 ${item}`}
                className="w-full h-48 object-cover"
              />
              <div className="p-4">
                <h2 className="text-lg font-semibold">신선한 토마토 {item}kg</h2>
                <p className="text-sm text-gray-500 mt-1">판매 예정 시간: 오전 9시</p>
                <button className="mt-2 w-full bg-orange-400 text-white py-2 rounded hover:bg-orange-500">
                  예약하기
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
