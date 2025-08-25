import React from 'react';

const Header = ({ storeName }: { storeName: string }) => {
  const now = new Date();
  // 브라우저가 이미 KST 시간대를 인식하고 있으므로 현재 시간을 그대로 사용
  const kstNow = now;
  const today = kstNow.toLocaleDateString('ko-KR', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="sticky top-0 bg-white shadow-md z-10 p-4 flex flex-col">
      <span className="text-sm text-gray-500">{today}</span>
      <h1 className="text-xl font-bold">{storeName}</h1>
    </header>
  );
};

export default Header;
