import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type OrderItem = {
  id: number;
  name: string;
  quantity: number;
  price: number;
  imageUrl?: string;
};

type OrderRow = {
  id: number;
  date: string;           // YYYY-MM-DD
  status: 'reserved' | 'picked' | 'canceled';
  items: OrderItem[];
};

const KRW = (n: number) => n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const mock: OrderRow[] = [
  {
    id: 101,
    date: '2025-08-13',
    status: 'reserved',
    items: [
      { id: 1, name: '신선한 토마토 1kg', quantity: 2, price: 3000, imageUrl: '/images/image1.png' },
    ],
  },
  {
    id: 102,
    date: '2025-08-12',
    status: 'picked',
    items: [
      { id: 2, name: '유기농 감자 2kg', quantity: 1, price: 3000, imageUrl: '/images/image2.png' },
      { id: 3, name: '햇양파 1.5kg', quantity: 1, price: 3000, imageUrl: '/images/image3.png' },
    ],
  },
];

export default function OrdersPage() {
  const nav = useNavigate();

  // 필터
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'all' | 'reserved' | 'picked' | 'canceled'>('all');

  // 데이터
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);         // “더 보기” 용
  const [hasMore, setHasMore] = useState(false);

  // 초기 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        // 실제 API 형태에 맞게 수정
        const res = await fetch(`/api/my/orders?page=${page}`);
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as { rows: OrderRow[]; hasMore: boolean };
        if (!alive) return;
        setOrders(prev => (page === 1 ? data.rows : [...prev, ...data.rows]));
        setHasMore(data.hasMore);
      } catch {
        // 폴백(데모)
        if (!alive) return;
        setOrders(mock);
        setHasMore(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [page]);

  const filtered = useMemo(() => {
    const f = from ? new Date(from) : null;
    const t = to ? new Date(to) : null;
    return orders.filter(o => {
      const d = new Date(o.date);
      const inFrom = f ? d >= f : true;
      const inTo = t ? d <= t : true;
      const s = status === 'all' ? true : o.status === status;
      return inFrom && inTo && s;
    });
  }, [orders, from, to, status]);

  const totalPrice = (o: OrderRow) =>
    o.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const statusBadge = (s: OrderRow['status']) => {
    const base = 'inline-flex items-center h-7 px-2.5 rounded-full text-xs font-medium';
    if (s === 'reserved') return `${base} bg-orange-50 text-orange-600 border border-orange-200`;
    if (s === 'picked')   return `${base} bg-green-50 text-green-700 border border-green-200`;
    return `${base} bg-gray-100 text-gray-600 border border-gray-200`;
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 pt-16 pb-24">
      {/* 상단 바 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="mx-auto w-full max-w-4xl h-14 flex items-center justify-between px-4">
          <button onClick={() => nav(-1)} className="text-sm text-gray-600 hover:text-gray-800">← 뒤로</button>
          <div className="font-bold text-gray-800">주문 내역</div>
          <div className="w-8" />
        </div>
      </header>

      {/* 필터 */}
      <section className="max-w-4xl mx-auto bg-white rounded-lg shadow p-4 mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500">시작일</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="mt-1 w-full h-10 border rounded px-2" />
          </div>
          <div>
            <label className="text-xs text-gray-500">종료일</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="mt-1 w-full h-10 border rounded px-2" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500">상태</label>
            <select
              value={status}
              onChange={e=>setStatus(e.target.value as any)}
              className="mt-1 w-full h-10 border rounded px-2"
            >
              <option value="all">전체</option>
              <option value="reserved">예약완료</option>
              <option value="picked">수령완료</option>
              <option value="canceled">취소</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => { setFrom(''); setTo(''); setStatus('all'); }}
              className="w-full h-10 rounded border hover:bg-gray-50"
            >
              초기화
            </button>
          </div>
        </div>
      </section>

      {/* 데스크톱 테이블 */}
      <section className="max-w-4xl mx-auto mt-4 bg-white rounded-lg shadow overflow-hidden hidden sm:block">
        {loading && <div className="p-6 text-center text-gray-500">불러오는 중…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center text-gray-500">주문 내역이 없습니다.</div>
        )}
        {filtered.length > 0 && (
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm text-gray-500">
                <th className="px-4 py-3">주문일</th>
                <th className="px-4 py-3">내역</th>
                <th className="px-4 py-3">금액</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-t text-sm">
                  <td className="px-4 py-3">{o.date}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {o.items.map(it => (
                        <div key={it.id} className="flex items-center gap-2">
                          {it.imageUrl ? (
                            <img src={it.imageUrl} alt={it.name} className="w-8 h-8 rounded object-cover border" />
                          ) : <div className="w-8 h-8 rounded bg-gray-100 border" />}
                          <span className="text-gray-800">{it.name}</span>
                          <span className="text-gray-500">× {it.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{KRW(totalPrice(o))}</td>
                  <td className="px-4 py-3">
                    <span className={statusBadge(o.status)}>
                      {o.status === 'reserved' ? '예약완료' : o.status === 'picked' ? '수령완료' : '취소'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 모바일 카드 */}
      <section className="max-w-4xl mx-auto sm:hidden">
        {loading && <div className="bg-white rounded-lg shadow p-6 mt-4 text-center text-gray-500">불러오는 중…</div>}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 mt-4 text-center text-gray-500">주문 내역이 없습니다.</div>
        )}
        <div className="space-y-3 mt-4">
          {filtered.map(o => (
            <div key={o.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">{o.date}</div>
                <span className={statusBadge(o.status)}>
                  {o.status === 'reserved' ? '예약완료' : o.status === 'picked' ? '수령완료' : '취소'}
                </span>
              </div>
              <div className="mt-2 space-y-2">
                {o.items.map(it => (
                  <div key={it.id} className="flex items-center gap-3">
                    {it.imageUrl ? (
                      <img src={it.imageUrl} className="w-12 h-12 rounded object-cover border" alt={it.name} />
                    ) : <div className="w-12 h-12 rounded bg-gray-100 border" />}
                    <div className="flex-1">
                      <div className="text-sm">{it.name}</div>
                      <div className="text-xs text-gray-500">× {it.quantity}</div>
                    </div>
                    <div className="text-sm font-medium">{KRW(it.price * it.quantity)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end text-sm">
                <span className="font-semibold">합계&nbsp;</span>
                <span className="text-orange-500 font-semibold">{KRW(totalPrice(o))}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 더 보기 */}
      {!loading && hasMore && (
        <div className="max-w-4xl mx-auto mt-4">
          <button
            onClick={() => setPage(p => p + 1)}
            className="w-full h-11 rounded border bg-white hover:bg-gray-50 shadow-sm"
          >
            더 보기
          </button>
        </div>
      )}
    </main>
  );
}
