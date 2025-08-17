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
  
  // ✅ 오늘 ~ 이틀 뒤 (reservation API 기본값과 동일)
  const now = new Date();
  const today = formatDateKR(now);
  const dayAfterTomorrow = formatDateKR(new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000)));

  // 필터 - 기본값: 오늘 ~ 이틀 뒤
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(dayAfterTomorrow);
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

  // 초기 로드 및 날짜 변경 시 재호출
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
            // 선택된 필터 날짜 범위로 요청
            const res = await getReservations(from, to);
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
              
              const qty = Math.max(1, Number(r.quantity ?? 1));
              const amt = Number(r.amount ?? 0);
              const unit = qty > 0 ? amt / qty : amt;
              return {
                id: r.id,
                date: r.order_date, // orderDate -> order_date로 수정
                status: orderStatus,
                items: [{
                  id: r.id,
                  name: r.product_name, 
                  quantity: qty,
                  price: unit,
                  imageUrl: r.product_image ? `${process.env.REACT_APP_IMG_URL}/${r.product_image}` : ''
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
  }, [page, show, from, to]);

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
    
    // 정렬: 주문일 (오늘/미래/과거 순)
    filtered.sort((a, b) => {
      // 날짜 비교를 위해 YYYY-MM-DD 형식으로 변환
      const aDate = a.date; // 이미 YYYY-MM-DD 형식
      const bDate = b.date; // 이미 YYYY-MM-DD 형식
      
      // 1. 날짜가 다른 경우: 오늘 > 미래 > 과거 순
      if (aDate !== bDate) {
        const today = new Date().toISOString().split('T')[0];
        
        // 오늘인 주문이 가장 위에
        if (aDate === today && bDate !== today) return -1;
        if (aDate !== today && bDate === today) return 1;
        
        // 미래가 과거보다 위에
        if (aDate > today && bDate <= today) return -1;
        if (aDate <= today && bDate > today) return 1;
        
        // 둘 다 미래인 경우, 가까운 날짜가 위에
        if (aDate > today && bDate > today) {
          return aDate.localeCompare(bDate);
        }
        
        // 둘 다 과거인 경우, 최근 과거가 위에
        if (aDate < today && bDate < today) {
          return bDate.localeCompare(aDate);
        }
      }
      
      return 0;
    });
    
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
              onClick={() => { setFrom(today); setTo(dayAfterTomorrow); setStatus('all'); }}
              className="w-full h-10 rounded border hover:bg-gray-50"
            >
              초기화
            </button>
          </div>
        </div>
        {/* 안내 문구 */}
        <div className="mt-2 text-xs text-gray-500">
          수령 대기 상태인 상품을 클릭하면 예약을 취소할 수 있어요.
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
                <tr
                  key={o.id}
                  className={`border-t text-sm ${o.status === 'pending' ? 'hover:bg-orange-50 cursor-pointer' : ''}`}
                  onClick={() => {
                    if (o.status === 'pending') {
                      openCancelDialog(o.id, o.items.map(item => item.name).join(', '));
                    }
                  }}
                  role={o.status === 'pending' ? 'button' : undefined}
                  aria-label={o.status === 'pending' ? '예약 취소' : undefined}
                >
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
                    <span
                      className={`${statusBadge(o.status)} ${o.status === 'pending' ? 'cursor-pointer hover:bg-orange-100' : 'cursor-default'}`}
                      title={o.status === 'pending' ? '누르면 예약이 취소됩니다.' : undefined}
                    >
                      {o.status === 'pending' ? '수령 대기(클릭 시 취소)' : o.status === 'picked' ? '수령 완료' : '예약 취소'}
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
            <div
              key={o.id}
              className={`bg-white rounded-lg shadow p-4 ${o.status === 'pending' ? 'active:bg-orange-50 cursor-pointer' : ''}`}
              onClick={() => {
                if (o.status === 'pending') {
                  openCancelDialog(o.id, o.items.map(item => item.name).join(', '));
                }
              }}
              role={o.status === 'pending' ? 'button' : undefined}
              aria-label={o.status === 'pending' ? '예약 취소' : undefined}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">{o.date}</div>
                <button
                  onClick={() => openCancelDialog(o.id, o.items.map(item => item.name).join(', '))}
                  className={`${statusBadge(o.status)} ${o.status === 'pending' ? 'cursor-pointer hover:bg-orange-100' : 'cursor-default'}`}
                  title={o.status === 'pending' ? '누르면 예약이 취소됩니다.' : undefined}
                  disabled={o.status !== 'pending'}
                >
                  {o.status === 'pending' ? '수령 대기(클릭 시 취소)' : o.status === 'picked' ? '수령 완료' : '예약 취소'}
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
                    <div className="text-sm font-medium">{KRW(it.price)}</div>
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
