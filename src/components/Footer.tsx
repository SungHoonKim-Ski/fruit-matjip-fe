import React from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../brand';

export default function Footer() {
  return (
    <footer className="w-full bg-white border-t border-gray-200">
      <div className="mx-auto max-w-4xl px-4 py-4 text-xs text-gray-600 space-y-2">
        <div className="font-semibold text-gray-800">{theme.companyName}</div>
        <div className="space-y-1">
          <div>대표자: {theme.contact.representative}</div>
          <div>사업자등록번호: {theme.contact.businessNumber}</div>
          {theme.contact.address && <div>주소: {theme.contact.address}</div>}
          <div>전화번호: {theme.contact.phone}</div>
        </div>
        <div className="flex flex-wrap gap-3 pt-2 text-gray-500">
          <Link to="/terms" className="hover:underline">이용약관</Link>
          <Link to="/privacy" className="hover:underline">개인정보처리방침</Link>
          <Link to="/refund" className="hover:underline">교환/환불 정책</Link>
        </div>
        <div className="text-gray-400">{theme.copyright}</div>
      </div>
    </footer>
  );
}
