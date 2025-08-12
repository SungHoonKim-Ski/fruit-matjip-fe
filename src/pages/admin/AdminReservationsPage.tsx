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
  pickupStatus: 'pending' | 'picked'; // 수령 전 / 수령 완료
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
  const [pickupFilter, setPickupFilter] = useState<'all' | 'pending' | 'picked'>('all'); // 기본값을 전체로 변경

  // 데이터 & 변경 상태 - mock 데이터를 현재 날짜 기준으로 동적 생성
  const [rows, setRows] = useState<ReservationRow[]>(() => mockReservations);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmNext, setConfirmNext] = useState<'pending' | 'picked' | null>(null);
  const [applying, setApplying] = useState(false);

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

  // 변경 확인 다이얼로그
  const openConfirmChange = (id: number, current: 'pending' | 'picked') => {
    const next = current === 'pending' ? 'picked' : 'pending';
    setConfirmId(id);
    setConfirmNext(next);
  };
  const closeConfirm = () => { setConfirmId(null); setConfirmNext(null); };
  const applyConfirm = async () => {
    if (confirmId == null || confirmNext == null) return;
    try {
      setApplying(true);
      const target = rows.find(r => r.id === confirmId);
      const productName = target ? target.productName : '';
      const buyerName = target ? target.buyerName : '';
      updateRowStatus(confirmId, confirmNext);
      if (confirmNext === 'picked') {
        show(`${buyerName}님의 "${productName}" 상태가 수령 완료로 변경되었습니다.`);
      } else {
        show(`"${buyerName}님의 ${productName}" 상태가 수령 대기로 변경되었습니다.`, { variant: 'info' });
      }
      closeConfirm();
    } finally {
      setApplying(false);
    }
  };

  return (
  <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 pb-24">
    <div className="max-w-4xl mx-auto flex items-center justify-between mb-4">
      <h1 className="text-2xl font-bold text-gray-800">🧾 예약 확인</h1>
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
              <option value="pending">수령 대기</option>
              <option value="picked">수령 완료</option>
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
                  onClick={() => openConfirmChange(r.id, r.pickupStatus)}
                >
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3">{r.productName}</td>
                  <td className="px-4 py-3">{r.buyerName}</td>
                  <td className="px-4 py-3">{r.quantity.toLocaleString()}개</td>
                  <td className="px-4 py-3 font-medium">{formatKRW(r.amount)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openConfirmChange(r.id, r.pickupStatus)}
                      className={
                        'inline-flex items-center h-9 px-3 rounded-full border text-xs font-medium transition ' +
                        (r.pickupStatus === 'picked'
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100')
                      }
                      aria-pressed={r.pickupStatus === 'picked'}
                    >
                      {r.pickupStatus === 'picked' ? '수령 완료' : '수령 대기'}
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
                      <option value="pending">수령 대기</option>
                      <option value="picked">수령 완료</option>
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
                onClick={() => openConfirmChange(r.id, r.pickupStatus)}
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
                  onClick={(e) => { e.stopPropagation(); openConfirmChange(r.id, r.pickupStatus); }}
                  className={
                    'inline-flex items-center h-8 px-3 rounded-full border text-xs font-medium transition ' +
                    (r.pickupStatus === 'picked'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200')
                  }
                >
                  {r.pickupStatus === 'picked' ? '수령 완료' : '수령 대기'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {confirmId !== null && confirmNext !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeConfirm} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl border p-5">
            <h2 className="text-base font-semibold text-gray-800">상태를 변경할까요?</h2>
            <p className="text-sm text-gray-600 mt-2">
              선택한 항목을 {confirmNext === 'picked' ? '수령 완료' : '수령 대기'}로 변경합니다.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeConfirm}
                className="h-10 px-4 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
                disabled={applying}
                type="button"
              >
                아니오
              </button>
              <button
                onClick={applyConfirm}
                disabled={applying}
                className={`h-10 px-4 rounded text-white ${applying ? 'bg-gray-400' : 'bg-orange-500 hover:bg-orange-600'}`}
                type="button"
              >
                {applying ? '처리 중…' : '네, 변경합니다'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
