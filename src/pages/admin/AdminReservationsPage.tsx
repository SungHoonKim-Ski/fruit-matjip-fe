// src/pages/admin/AdminReservationsPage.tsx
import React, { useMemo, useState } from 'react';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';

type ReservationRow = {
  id: number;
  date: string;        // YYYY-MM-DD
  productName: string;
  buyerName: string;
  quantity: number;
  amount: number;
  pickupStatus: 'pending' | 'picked'; // 미수령 / 수령
};

const mock: ReservationRow[] = [
  // 오늘 날짜 기준으로 다양한 데이터 생성
  { id: 201, date: '2025-01-15', productName: '신선한 토마토 1kg', buyerName: '홍길동', quantity: 2, amount: 6000, pickupStatus: 'pending' },
  { id: 202, date: '2025-01-15', productName: '햇양파 1.5kg', buyerName: '이민지', quantity: 1, amount: 3000, pickupStatus: 'picked' },
  { id: 203, date: '2025-01-15', productName: '유기농 감자 2kg', buyerName: '박철수', quantity: 3, amount: 9000, pickupStatus: 'pending' },
  { id: 204, date: '2025-01-15', productName: '제주 감귤 3kg', buyerName: '김영희', quantity: 1, amount: 5000, pickupStatus: 'picked' },
  { id: 205, date: '2025-01-15', productName: 'GAP 사과 2kg', buyerName: '최민수', quantity: 2, amount: 14000, pickupStatus: 'pending' },
  
  // 어제 날짜
  { id: 206, date: '2025-01-14', productName: '신선한 토마토 1kg', buyerName: '정수진', quantity: 1, amount: 3000, pickupStatus: 'picked' },
  { id: 207, date: '2025-01-14', productName: '친환경 바나나 1송이', buyerName: '한지민', quantity: 2, amount: 9000, pickupStatus: 'picked' },
  { id: 208, date: '2025-01-14', productName: '햇양파 1.5kg', buyerName: '송민호', quantity: 1, amount: 3000, pickupStatus: 'picked' },
  
  // 그제 날짜
  { id: 209, date: '2025-01-13', productName: '복숭아 6입', buyerName: '윤서연', quantity: 1, amount: 12000, pickupStatus: 'picked' },
  { id: 210, date: '2025-01-13', productName: '귤 2kg', buyerName: '임태현', quantity: 2, amount: 12000, pickupStatus: 'picked' },
  { id: 211, date: '2025-01-13', productName: '샤인머스켓 1송이', buyerName: '오승우', quantity: 1, amount: 25000, pickupStatus: 'picked' },
  
  // 내일 날짜 (예약)
  { id: 212, date: '2025-01-16', productName: '신선한 토마토 1kg', buyerName: '강동원', quantity: 2, amount: 6000, pickupStatus: 'pending' },
  { id: 213, date: '2025-01-16', productName: '유기농 감자 2kg', buyerName: '배두나', quantity: 1, amount: 3000, pickupStatus: 'pending' },
  { id: 214, date: '2025-01-16', productName: 'GAP 사과 2kg', buyerName: '류준열', quantity: 3, amount: 21000, pickupStatus: 'pending' },
  
  // 모레 날짜 (예약)
  { id: 215, date: '2025-01-17', productName: '제주 감귤 3kg', buyerName: '김태희', quantity: 2, amount: 10000, pickupStatus: 'pending' },
  { id: 216, date: '2025-01-17', productName: '친환경 바나나 1송이', buyerName: '원빈', quantity: 1, amount: 4500, pickupStatus: 'pending' },
];

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
  const [rows, setRows] = useState<ReservationRow[]>(() => {
    const today = '2025-08-11';        // 오늘
    const yesterday = '2025-08-10';    // 어제
    const dayBeforeYesterday = '2025-08-09'; // 그제
    const tomorrow = '2025-08-12';     // 내일
    const dayAfterTomorrow = '2025-08-13';   // 모레
    
    return [
      // 오늘 날짜 기준으로 다양한 데이터 생성
      { id: 201, date: today, productName: '신선한 토마토 1kg', buyerName: '홍길동', quantity: 2, amount: 6000, pickupStatus: 'pending' },
      { id: 202, date: today, productName: '햇양파 1.5kg', buyerName: '이민지', quantity: 1, amount: 3000, pickupStatus: 'picked' },
      { id: 203, date: today, productName: '유기농 감자 2kg', buyerName: '박철수', quantity: 3, amount: 9000, pickupStatus: 'pending' },
      { id: 204, date: today, productName: '제주 감귤 3kg', buyerName: '김영희', quantity: 1, amount: 5000, pickupStatus: 'picked' },
      { id: 205, date: today, productName: 'GAP 사과 2kg', buyerName: '최민수', quantity: 2, amount: 14000, pickupStatus: 'pending' },
      
      // 어제 날짜
      { id: 206, date: yesterday, productName: '신선한 토마토 1kg', buyerName: '정수진', quantity: 1, amount: 3000, pickupStatus: 'picked' },
      { id: 207, date: yesterday, productName: '친환경 바나나 1송이', buyerName: '한지민', quantity: 2, amount: 9000, pickupStatus: 'picked' },
      { id: 208, date: yesterday, productName: '햇양파 1.5kg', buyerName: '송민호', quantity: 1, amount: 3000, pickupStatus: 'picked' },
      
      // 그제 날짜
      { id: 209, date: dayBeforeYesterday, productName: '복숭아 6입', buyerName: '윤서연', quantity: 1, amount: 12000, pickupStatus: 'picked' },
      { id: 210, date: dayBeforeYesterday, productName: '귤 2kg', buyerName: '임태현', quantity: 2, amount: 12000, pickupStatus: 'picked' },
      { id: 211, date: dayBeforeYesterday, productName: '샤인머스켓 1송이', buyerName: '오승우', quantity: 1, amount: 25000, pickupStatus: 'picked' },
      
      // 내일 날짜 (예약)
      { id: 212, date: tomorrow, productName: '신선한 토마토 1kg', buyerName: '강동원', quantity: 2, amount: 6000, pickupStatus: 'pending' },
      { id: 213, date: tomorrow, productName: '유기농 감자 2kg', buyerName: '배두나', quantity: 1, amount: 3000, pickupStatus: 'pending' },
      { id: 214, date: tomorrow, productName: 'GAP 사과 2kg', buyerName: '류준열', quantity: 3, amount: 21000, pickupStatus: 'pending' },
      
      // 모레 날짜 (예약)
      { id: 215, date: dayAfterTomorrow, productName: '제주 감귤 3kg', buyerName: '김태희', quantity: 2, amount: 10000, pickupStatus: 'pending' },
      { id: 216, date: dayAfterTomorrow, productName: '친환경 바나나 1송이', buyerName: '원빈', quantity: 1, amount: 4500, pickupStatus: 'pending' },
    ];
  });

  // 🔹 최초 상태 스냅샷: id -> 최초 pickupStatus
  const [baseStatusById, setBaseStatusById] = useState<Record<number, 'pending' | 'picked'>>(
    () => Object.fromEntries(rows.map(r => [r.id, r.pickupStatus]))
  );

  // 🔹 변경 분: id -> 현재 변경된 pickupStatus (최초와 다를 때만 보관)
  const [dirty, setDirty] = useState<Record<number, 'pending' | 'picked'>>({});

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


  // 변경 플래그 계산 유틸: 현재값이 최초값과 같으면 dirty에서 제거, 다르면 기록
  const markDirty = (id: number, current: 'pending' | 'picked') => {
    setDirty(prev => {
      const base = baseStatusById[id];
      if (current === base) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: current };
    });
  };

  // 드롭다운으로 상태 변경
  const updateRowStatus = (id: number, next: 'pending' | 'picked') => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, pickupStatus: next } : r)));
    markDirty(id, next);
  };

  // 행/칩 터치로 토글
  const toggleRowStatus = (id: number) => {
    setRows(prev => {
      let nextStatus: 'pending' | 'picked' = 'pending';
      const nextRows = prev.map(r => {
        if (r.id !== id) return r;
        nextStatus = r.pickupStatus === 'pending' ? 'picked' : 'pending';
        return { ...r, pickupStatus: nextStatus };
      });
      markDirty(id, nextStatus);
      return nextRows;
    });
  };

  // ✅ 저장: 성공 시 현재 상태를 새로운 "기준"으로 반영 → dirty 비움
  const saveChanges = async () => {
    const changed = Object.entries(dirty).map(([id, status]) => ({ id: Number(id), pickupStatus: status }));
    if (changed.length === 0) {
      show('변경된 내용이 없습니다.', { variant: 'info' });
      return;
    }
    try {
      // 실제 API 예시
      // await fetch('/api/admin/reservations/pickup-status', {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ updates: changed }),
      // });
      await new Promise(res => setTimeout(res, 400)); // 데모용
      show('수령 여부가 저장되었습니다.');

      // 현재 rows를 새로운 기준으로 확정
      setBaseStatusById(Object.fromEntries(rows.map(r => [r.id, r.pickupStatus])));
      setDirty({});
    } catch (error) {
      safeErrorLog(error, 'AdminReservationsPage - saveChanges');
      show(getSafeErrorMessage(error, '저장 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  // 🔄 변경 초기화: 변경분을 모두 최초 상태로 되돌림
  const resetChanges = () => {
    setRows(prev => prev.map(r => ({ ...r, pickupStatus: baseStatusById[r.id] })));
    setDirty({});
    
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
              <option value="pending">미수령</option>
              <option value="picked">수령</option>
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
                      {r.pickupStatus === 'picked' ? '수령' : '미수령'}
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
                      <option value="pending">미수령</option>
                      <option value="picked">수령완료</option>
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
                  {r.pickupStatus === 'picked' ? '수령' : '미수령'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 고정 저장 바 (변경이 있을 때만 노출) */}
      {Object.keys(dirty).length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t">
          <div className="mx-auto w-full max-w-4xl flex items-center justify-end gap-3 p-3"
               style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <button
              onClick={resetChanges}
              className="h-12 px-4 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              type="button"
            >
              초기화
            </button>
            <button
              onClick={saveChanges}
              className="h-12 px-5 rounded bg-orange-500 hover:bg-orange-600 text-white font-medium"
              type="button"
            >
              저장
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
