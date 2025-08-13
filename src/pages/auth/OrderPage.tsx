import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { listOrders, type OrderRow } from '../../mocks/orders';
import { getReservations, cancelReservation } from '../../utils/api';

// 취소 확인 dialog 타입
interface CancelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  productName: string;
}

const KRW = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function OrdersPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();
  function formatDateKR(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  
  // ✅ 오늘 ~ 이번 달 말일 (로컬 기준)
  const now = new Date();
  const today = formatDateKR(now);
  const endOfMonth = formatDateKR(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  // 필터 - 기본값: 오늘 ~ 이번 달 말일
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(endOfMonth);
  const [status, setStatus] = useState<'all' | 'pending' | 'picked' | 'canceled'>('all');

  // 데이터
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);         // “더 보기” 용
  const [hasMore, setHasMore] = useState(false);
  
  // 취소 dialog 상태
  const [cancelDialog, setCancelDialog] = useState<{
    isOpen: boolean;
    orderId: number;
    productName: string;
  }>({
    isOpen: false,
    orderId: 0,
    productName: ''
  });

  // 초기 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (USE_MOCKS) {
          // Mock 데이터 사용
          await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 지연
          if (alive) {
            const mockData = await listOrders(page);
            setOrders(mockData.rows);
            setHasMore(mockData.hasMore);
          }
        } else {
          try {
            // 한국 시간 기준으로 오늘 날짜 계산
            const now = new Date();
            const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC+9
            
            // 오늘 날짜 (YYYY-MM-DD)
            const fromStr = koreaTime.toISOString().split('T')[0];
            
            // 2일 후 날짜 (YYYY-MM-DD)
            const toDate = new Date(koreaTime);
            toDate.setDate(koreaTime.getDate() + 2);
            const toStr = toDate.toISOString().split('T')[0];
            
            
            const res = await getReservations(fromStr, toStr);
            if (!res.ok) {
              // 401, 403 에러는 통합 에러 처리로 위임
              if (res.status === 401 || res.status === 403) {
                return; // userFetch에서 이미 처리됨
              }
              throw new Error('주문 목록을 불러오지 못했습니다.');
            }
            const data = await res.json();
            
            
            // ReservationListResponse 구조에서 response 필드 추출
            let reservationsArray = data;
            if (data && typeof data === 'object' && data.response && Array.isArray(data.response)) {
              reservationsArray = data.response;
            }
            
            if (!Array.isArray(reservationsArray)) {
              throw new Error('주문 데이터가 배열 형태가 아닙니다.');
            }
            
            // ReservationResponse를 OrderRow로 변환
            const orderRows = reservationsArray.map((r: any) => {
              // ReservationStatus를 OrderRow status로 매핑
              let orderStatus: 'pending' | 'picked' | 'canceled';
              switch (r.status?.toLowerCase()) {
                case 'pending':
                  orderStatus = 'pending';
                  break;
                case 'picked':
                case 'completed':
                  orderStatus = 'picked';
                  break;
                case 'canceled':
                case 'cancelled':
                  orderStatus = 'canceled';
                  break;
                default:
                  orderStatus = 'pending';
              }
              
              return {
                id: r.id,
                date: r.orderDate,
                status: orderStatus,
                items: [{
                  id: r.id,
                  name: r.productName,
                  quantity: 1,
                  price: r.amount,
                  imageUrl: r.productImage
                }]
              };
            });
            
            setOrders(orderRows);
          } catch (e: any) {
            safeErrorLog(e, 'OrderPage - loadOrders');
            show(getSafeErrorMessage(e, '주문 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
          }
        }
      } catch (e: any) {
        safeErrorLog(e, 'OrderPage - loadOrders');
        show(getSafeErrorMessage(e, '주문 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [page, show]);

  const filtered = useMemo(() => {
    const f = from ? new Date(from) : null;
    const t = to ? new Date(to) : null;
    let filtered = orders.filter(o => {
      const d = new Date(o.date);
      const inFrom = f ? d >= f : true;
      const inTo = t ? d <= t : true;
      const s = status === 'all' ? true : o.status === status;
      return inFrom && inTo && s;
    });
    
    // 날짜 오름차순 정렬 (과거 → 최신)
    filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return filtered;
  }, [orders, from, to, status]);

  const totalPrice = (o: OrderRow) =>
    o.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const statusBadge = (s: OrderRow['status']) => {
    const base = 'inline-flex items-center h-7 px-2.5 rounded-full text-xs font-medium';
    if (s === 'pending') return `${base} bg-orange-50 text-orange-600 border border-orange-200`;
    if (s === 'picked')   return `${base} bg-green-50 text-green-700 border border-green-200`;
    return `${base} bg-gray-100 text-gray-600 border border-gray-200`;
  };

  // 취소 dialog 열기
  const openCancelDialog = (orderId: number, productName: string) => {
    setCancelDialog({
      isOpen: true,
      orderId,
      productName
    });
  };

  // 주문 취소 처리
  const handleCancelOrder = async () => {
    if (!cancelDialog.isOpen) return;
    
    try {
      if (USE_MOCKS) {
        // Mock 취소 처리
        await new Promise(resolve => setTimeout(resolve, 500));
        setOrders(prev => prev.map(o => 
          o.id === cancelDialog.orderId 
            ? { ...o, status: 'canceled' as const }
            : o
        ));
        show(`${cancelDialog.productName} 주문이 취소되었습니다.`);
        setCancelDialog({ isOpen: false, orderId: 0, productName: '' });
      } else {
        const res = await cancelReservation(cancelDialog.orderId);
        if (!res.ok) throw new Error('주문 취소에 실패했습니다.');
        
        // 성공 시 로컬 상태 업데이트
        setOrders(prev => prev.map(o => 
          o.id === cancelDialog.orderId 
            ? { ...o, status: 'canceled' as const }
            : o
        ));
        show(`${cancelDialog.productName} 주문이 취소되었습니다.`);
        setCancelDialog({ isOpen: false, orderId: 0, productName: '' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'OrderPage - handleCancelOrder');
      show(getSafeErrorMessage(e, '주문 취소 중 오류가 발생했습니다.'), { variant: 'error' });
    }
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
              <option value="pending">수령 대기</option>
              <option value="picked">수령 완료</option>
              <option value="canceled">예약 취소</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => { setFrom(today); setTo(endOfMonth); setStatus('all'); }}
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
                    <button
                      onClick={() => openCancelDialog(o.id, o.items.map(item => item.name).join(', '))}
                      className={`${statusBadge(o.status)} ${o.status === 'pending' ? 'cursor-pointer hover:bg-orange-100' : 'cursor-default'}`}
                      disabled={o.status !== 'pending'}
                    >
                      {o.status === 'pending' ? '수령 대기' : o.status === 'picked' ? '수령 완료' : '예약 취소'}
                    </button>
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
                <button
                  onClick={() => openCancelDialog(o.id, o.items.map(item => item.name).join(', '))}
                  className={`${statusBadge(o.status)} ${o.status === 'pending' ? 'cursor-pointer hover:bg-orange-100' : 'cursor-default'}`}
                  disabled={o.status !== 'pending'}
                >
                  {o.status === 'pending' ? '수령 대기' : o.status === 'picked' ? '수령 완료' : '예약 취소'}
                </button>
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

      {/* 취소 확인 Dialog */}
      {cancelDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">주문 취소</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{cancelDialog.productName}"</span> 주문을 취소하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelDialog({ isOpen: false, orderId: 0, productName: '' })}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={() => handleCancelOrder()}
                className="flex-1 h-10 rounded bg-red-500 text-white hover:bg-red-600"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
