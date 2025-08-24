import React from 'react';

const Header = ({ storeName }: { storeName: string }) => {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // KST 기준 현재 시간
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
