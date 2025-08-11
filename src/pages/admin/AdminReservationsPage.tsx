// src/pages/admin/AdminReservationsPage.tsx
import React, { useMemo, useState } from 'react';
import { useSnackbar } from '../../components/snackbar';
import { mockReservations } from '../../mocks/reservations';

type ReservationRow = {
  id: number;
  date: string;        // YYYY-MM-DD
  productName: string;
  buyerName: string;
  quantity: number;
  amount: number;
  pickupStatus: 'pending' | 'picked'; // 대기 / 수령
};

const formatKRW = (n: number) =>
  n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function AdminReservationsPage() {

  const { show } = useSnackbar();
  
  // 오늘 날짜를 기본값으로 설정
  const today = new Date().toISOString().split('T')[0];
  
  // 필터 (기본값)
  const [selectedDate, setSelectedDate] = useState(today);
  const [field, setField] = useState<'buyerName' | 'productName'>('buyerName'); // 기본값을 이름으로 변경
  const [term, setTerm]   = useState('');
  const [pickupFilter, setPickupFilter] = useState<'all' | 'pending' | 'picked'>('pending'); // 기본값을 미수령으로 변경

  // 데이터 & 변경 상태 - mock 데이터를 현재 날짜 기준으로 동적 생성
  const [rows, setRows] = useState<ReservationRow[]>(() => mockReservations);

  const filtered = useMemo(() => {
    const v = term.trim();

    return rows.filter(r => {
      const dateMatch = r.date === selectedDate;
      const fieldHit = !v
        ? true  // 검색값이 없으면 모든 사용자 표시
        : field === 'buyerName'
        ? r.buyerName.includes(v)
        : r.productName.includes(v);
      const pickupHit = pickupFilter === 'all' ? true : r.pickupStatus === pickupFilter;
      return dateMatch && fieldHit && pickupHit;
    });
  }, [rows, selectedDate, term, field, pickupFilter]);

  // 드롭다운으로 상태 변경
  const updateRowStatus = (id: number, next: 'pending' | 'picked') => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, pickupStatus: next } : r)));
    // dirty 관련 코드 제거
  };

  // 행/칩 터치로 토글
  const toggleRowStatus = (id: number) => {
    let toggledStatus: 'pending' | 'picked' = 'pending';
    setRows(prev => {
      const nextRows = prev.map(r => {
        if (r.id !== id) return r;
        toggledStatus = r.pickupStatus === 'pending' ? 'picked' : 'pending';
        return { ...r, pickupStatus: toggledStatus };
      });
      if (toggledStatus === 'picked') {
        show(`상태가 수령 O 로 변경되었습니다.`);
      } else {
        show(`상태가 수령 X 로 변경되었습니다.`, { variant: 'error' });
      }
      return nextRows;
    });
  };

  return (
  <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 pb-24">
    <div className="max-w-4xl mx-auto flex items-center justify-between mb-4">
      <h1 className="text-2xl font-bold text-gray-800">🧾 구매자 확인</h1>
    </div>

      {/* 필터 */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500">조회 날짜</label>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
              className="mt-1 w-full h-10 border rounded px-2" 
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">검색 속성 *</label>
            <select
              value={field}
              onChange={e=>setField(e.target.value as any)}
              required
              className="mt-1 w-full h-10 border rounded px-2"
            >
              <option value="productName">상품명</option>
              <option value="buyerName">이름</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500">검색 값</label>
            <input
              value={term}
              onChange={e=>setTerm(e.target.value)}
              placeholder={field === 'productName' ? '예) 토마토' : '예) 홍길동'}
              className="mt-1 w-full h-10 border rounded px-3"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">수령 여부</label>
            <select
              value={pickupFilter}
              onChange={e=>setPickupFilter(e.target.value as any)}
              className="mt-1 w-full h-10 border rounded px-2"
            >
              <option value="all">전체</option>
              <option value="pending">수령 X</option>
              <option value="picked">수령 O</option>
            </select>
          </div>
        </div>
        
        {/* 선택된 날짜 정보 표시 */}
        <div className="mt-3 text-sm text-gray-600">
          📅 {selectedDate} ({filtered.length}건)
        </div>
      </div>

      {/* 데스크톱 테이블 */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm text-gray-500">
                <th className="px-4 py-3">일자</th>
                <th className="px-4 py-3">상품명</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">수량</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">수령 여부</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  className="border-t text-sm hover:bg-orange-50 cursor-pointer"
                  onClick={() => toggleRowStatus(r.id)}  // 행 전체 터치로 토글
                >
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3">{r.productName}</td>
                  <td className="px-4 py-3">{r.buyerName}</td>
                  <td className="px-4 py-3">{r.quantity.toLocaleString()}개</td>
                  <td className="px-4 py-3 font-medium">{formatKRW(r.amount)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => toggleRowStatus(r.id)}
                      className={
                        'inline-flex items-center h-9 px-3 rounded-full border text-xs font-medium transition ' +
                        (r.pickupStatus === 'picked'
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100')
                      }
                      aria-pressed={r.pickupStatus === 'picked'}
                    >
                      {r.pickupStatus === 'picked' ? '수령 O' : '수령 X'}
                    </button>

                    {/* 접근성용 select (시각적으로 숨김) */}
                    <label className="sr-only" htmlFor={`pickup-${r.id}`}>수령 여부</label>
                    <select
                      id={`pickup-${r.id}`}
                      value={r.pickupStatus}
                      onChange={(e) => updateRowStatus(r.id, e.target.value as 'pending'|'picked')}
                      className="sr-only"
                      aria-hidden="true"
                      tabIndex={-1}
                    >
                      <option value="pending">수령 X</option>
                      <option value="picked">수령 O</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="sm:hidden divide-y">
          {filtered.map(r => (
            <div
              key={r.id}
              className="p-4 active:bg-orange-50"
              onClick={() => toggleRowStatus(r.id)}  // 카드 전체 탭으로 토글
            >
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{r.date}</span>
                <span className="font-medium">{formatKRW(r.amount)}</span>
              </div>
              <div className="mt-1 text-sm">{r.productName}</div>
              <div className="mt-1 text-xs text-gray-500">{r.buyerName} · {r.quantity}개</div>

              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleRowStatus(r.id); }}
                  className={
                    'inline-flex items-center h-8 px-3 rounded-full border text-xs font-medium transition ' +
                    (r.pickupStatus === 'picked'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200')
                  }
                >
                  {r.pickupStatus === 'picked' ? '픽업O' : '픽업X'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
