// src/pages/admin/AdminSalesPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { mockSales } from '../../mocks/sales';
import { USE_MOCKS } from '../../config';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getReservationReports } from '../../utils/api';

const formatKRW = (n: number) =>
  n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function AdminSalesPage() {
  const { show } = useSnackbar();
  // 이번 달의 시작/끝(KST 기준)
  const toKstYMD = (d: Date) => {
    const kstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000); // KST 기준으로 변환
    return kstDate.toISOString().split('T')[0];
  };
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000); // KST 기준 현재 시간
  const monthStart = toKstYMD(new Date(kstNow.getFullYear(), kstNow.getMonth(), 1));
  const monthEnd   = toKstYMD(new Date(kstNow.getFullYear(), kstNow.getMonth() + 1, 0));
  const [from, setFrom] = useState<string>(monthStart);
  const [to, setTo]     = useState<string>(monthEnd);

  // 🔎 필수 필드: 기본값 = 이름(buyerName)
  const [field, setField] = useState<'buyerName' | 'productName'>('productName');
  const [term, setTerm]   = useState('');

  type SalesRow = {
    id: number;
    date: string; // YYYY-MM-DD
    productName: string;
    buyerName: string;
    price: number;
    quantity: number;
    revenue: number;
  };

  const [rows, setRows] = useState<SalesRow[]>([]);

  // 데이터 로드(실데이터 사용)
  const load = async (rangeFrom: string, rangeTo: string) => {
    if (USE_MOCKS) {
      setRows(
        mockSales.map((r, idx) => ({
          id: r.id ?? idx,
          date: r.date,
          productName: r.productName,
          buyerName: r.buyerName,
          price: r.price,
          quantity: r.quantity,
          revenue: r.revenue,
        }))
      );
      return;
    }
    try {
      const res = await getReservationReports(rangeFrom, rangeTo);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return; // 공통 처리 위임
        const err = await res.clone().json().catch(() => ({}));
        throw new Error(err.message || '판매 리포트를 불러오지 못했습니다.');
      }
      const body = await res.json();
      const list = Array.isArray(body) ? body : (body?.response || []);
      if (!Array.isArray(list)) throw new Error('리포트 데이터가 배열이 아닙니다.');

      const mapped: SalesRow[] = list.map((r: any, idx: number) => {
        const qty = Number(r.quantity ?? 0);
        const amt = Number(r.amount ?? 0);
        const unit = qty > 0 ? Math.floor(amt / qty) : Number(r.price ?? 0);
        return {
          id: r.id ?? idx,
          date: r.pickup_date ?? r.pickupDate ?? '',
          productName: r.product_name ?? r.productName ?? '',
          buyerName: r.user_name ?? r.userName ?? '',
          price: unit,
          quantity: qty,
          revenue: amt,
        };
      });
      setRows(mapped);
    } catch (e: any) {
      safeErrorLog(e, 'AdminSalesPage - load');
      show(getSafeErrorMessage(e, '판매 데이터를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  useEffect(() => {
    load(from, to);
  }, [from, to, show]);

  // 날짜/검색 필터는 클라이언트에서 적용
  const filtered = useMemo(() => {
    const f = new Date(from);
    const t = new Date(to);
    return rows.filter(r => {
      const d = new Date(r.date);
      const inRange = (isNaN(+f) || d >= f) && (isNaN(+t) || d <= t);
      const v = term.trim();
      if (!v) return inRange;
      if (field === 'buyerName')   return inRange && r.buyerName.includes(v);
      if (field === 'productName') return inRange && r.productName.includes(v);
      return inRange;
    });
  }, [from, to, field, term, rows]);

  const totalQty = useMemo(() => filtered.reduce((s, r) => s + Number(r.quantity || 0), 0), [filtered]);
  const totalRev = useMemo(() => filtered.reduce((s, r) => s + Number(r.revenue || 0), 0), [filtered]);

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">📈 판매량 확인</h1>
      </div>

      {/* 필터 */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500">시작일 <span className="text-red-500">*</span></label>
            <input type="date" required value={from} onChange={e=>setFrom(e.target.value)} className="mt-1 w-full h-10 border rounded px-2" />
          </div>
          <div>
            <label className="text-xs text-gray-500">종료일 <span className="text-red-500">*</span></label>
            <input type="date" required value={to} onChange={e=>setTo(e.target.value)} className="mt-1 w-full h-10 border rounded px-2" />
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
