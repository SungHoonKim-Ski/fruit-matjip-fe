// src/pages/admin/AdminSalesPage.tsx
import React, { useMemo, useState } from 'react';
import { mockSales } from '../../mocks/sales';

const formatKRW = (n: number) =>
  n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function AdminSalesPage() {
  const [from, setFrom] = useState('2025-08-01');
  const [to, setTo]     = useState('2025-08-31');

  // 🔎 필수 필드: 기본값 = 이름(buyerName)
  const [field, setField] = useState<'buyerName' | 'productName'>('buyerName');
  const [term, setTerm]   = useState('');

  // 데모용 클라이언트 필터(실서비스는 서버에 field,term 전달)
  const filtered = useMemo(() => {
    const f = new Date(from);
    const t = new Date(to);
    return mockSales.filter(r => {
      const d = new Date(r.date);
      const inRange = (isNaN(+f) || d >= f) && (isNaN(+t) || d <= t);

      const v = term.trim();
      if (!v) return inRange; // 값이 없으면 날짜만 적용(필드는 선택되어 있음)
      if (field === 'buyerName')   return inRange && r.buyerName.includes(v);
      if (field === 'productName') return inRange && r.productName.includes(v);
      return inRange;
    });
  }, [from, to, field, term]);

  const totalQty = useMemo(() => filtered.reduce((s, r) => s + r.quantity, 0), [filtered]);
  const totalRev = useMemo(() => filtered.reduce((s, r) => s + r.revenue, 0), [filtered]);

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">📈 판매량 확인</h1>
      </div>

      {/* 필터 */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500">시작일</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mt-1 w-full h-10 border rounded px-2" />
          </div>
          <div>
            <label className="text-xs text-gray-500">종료일</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mt-1 w-full h-10 border rounded px-2" />
          </div>

          {/* 필수 필드 */}
          <div>
            <label className="text-xs text-gray-500">검색 필터 *</label>
            <select
              value={field}
              onChange={e=>setField(e.target.value as any)}
              required
              className="mt-1 w-full h-10 border rounded px-2"
            >
              <option value="buyerName">닉네임</option>
              <option value="productName">상품명</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500">검색 값</label>
            <input
              value={term}
              onChange={e=>setTerm(e.target.value)}
              placeholder={field === 'buyerName' ? '예) 홍길동' : '예) 토마토'}
              className="mt-1 w-full h-10 border rounded px-3"
            />
          </div>
        </div>
      </div>

      {/* 요약 */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">총 판매 수량</p>
          <p className="text-xl font-bold">{totalQty.toLocaleString()}개</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">총 매출</p>
          <p className="text-xl font-bold text-orange-500">{formatKRW(totalRev)}</p>
        </div>
      </div>

      {/* 테이블 */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm text-gray-500">
                <th className="px-4 py-3">일자</th>
                <th className="px-4 py-3">상품명</th>
                <th className="px-4 py-3">닉네임</th>
                <th className="px-4 py-3">단가</th>
                <th className="px-4 py-3">수량</th>
                <th className="px-4 py-3">매출</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t text-sm">
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3">{r.productName}</td>
                  <td className="px-4 py-3">{r.buyerName}</td>
                  <td className="px-4 py-3">{formatKRW(r.price)}</td>
                  <td className="px-4 py-3">{r.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium">{formatKRW(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="sm:hidden divide-y">
          {filtered.map(r => (
            <div key={r.id} className="p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{r.date}</span>
                <span className="font-medium">{formatKRW(r.revenue)}</span>
              </div>
              <div className="mt-1 text-sm">{r.productName}</div>
              <div className="mt-1 text-xs text-gray-500">{r.buyerName} · {r.quantity}개 · 단가 {formatKRW(r.price)}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
