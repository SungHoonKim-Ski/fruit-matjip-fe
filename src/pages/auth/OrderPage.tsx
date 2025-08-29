import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { listOrders, type OrderRow } from '../../mocks/orders';
import { getReservations, cancelReservation, selfPickReservation, checkCanSelfPick } from '../../utils/api';

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
  
  // ✅ 오늘 ~ 6틀 뒤 (reservation API 기본값과 동일)
  const now = new Date();
  const today = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  })();
  const dayAfterTomorrow = formatDateKR(new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000)));
  // dayAfterTomorrow = today + 6;

  // 필터 - 기본값: 오늘 ~ 이틀 뒤
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(dayAfterTomorrow);
  const [status, setStatus] = useState<'all' | 'pending' | 'picked' | 'self_pick' | 'self_pick_ready' | 'canceled'>('all');

  // 데이터
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);         // “더 보기” 용
  const [hasMore, setHasMore] = useState(false);
  const [canSelfPick, setCanSelfPick] = useState<boolean | null>(null); // 셀프 수령 가능 여부
  
  // 상태 변경 dialog 상태
  const [statusDialog, setStatusDialog] = useState<{
    isOpen: boolean;
    orderId: number;
    productName: string;
    currentStatus: 'pending' | 'self_pick';
    newStatus: 'canceled' | 'self_pick';
  }>({
    isOpen: false,
    orderId: 0,
    productName: '',
    currentStatus: 'pending',
    newStatus: 'canceled'
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
            
            // ReservationResponse를 OrderRow status로 변환
            const orderRows = reservationsArray.map((r: any) => {
              // ReservationStatus를 OrderRow status로 매핑
              let orderStatus: 'pending' | 'picked' | 'self_pick' | 'self_pick_ready' | 'canceled';
              switch (r.status?.toLowerCase()) {
                case 'pending':
                  orderStatus = 'pending';
                  break;
                case 'picked':
                case 'completed':
                  orderStatus = 'picked';
                  break;
                case 'self_pick':
                case 'self_picked':
                  orderStatus = 'self_pick';
                  break;
                case 'self_pick_ready':
                  orderStatus = 'self_pick_ready';
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

  // 셀프 수령 가능 여부 체크 (페이지 진입 시 한 번만)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (USE_MOCKS) {
        // Mock에서는 항상 가능
        setCanSelfPick(true);
        return;
      }
      
      try {
        const canPick = await checkCanSelfPick();
        if (alive) {
          setCanSelfPick(canPick);
        }
      } catch (err) {
        safeErrorLog(err, 'OrderPage - canSelfPick check');
        if (alive) {
          setCanSelfPick(false); // 에러 시 기본적으로 불가능으로 설정
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  // 현재 시간이 18시 이후인지 체크 (실시간 업데이트)
  const [isAfter6PM, setIsAfter6PM] = useState(false);
  
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const currentHour = now.getHours();
      setIsAfter6PM(currentHour >= 18);
    };
    
    // 초기 체크
    checkTime();
    
    // 1분마다 체크 (18시 경계를 넘을 때를 위해)
    const interval = setInterval(checkTime, 60000);
    
    return () => clearInterval(interval);
  }, []);

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
    if (s === 'pending') return `${base} bg-orange-50 text-orange-600 border border-orange-200`;
    if (s === 'picked') return `${base} bg-green-50 text-green-700 border border-green-200`;
    if (s === 'self_pick') return `${base} bg-blue-50 text-blue-700 border border-blue-200`;
    if (s === 'self_pick_ready') return `${base} bg-yellow-50 text-yellow-700 border border-yellow-200`;
    return `${base} bg-gray-100 text-gray-600 border border-gray-200`;
  };

  // 상태 변경 dialog 열기
  const openStatusDialog = (orderId: number, productName: string, currentStatus: 'pending' | 'self_pick') => {
    setStatusDialog({
      isOpen: true,
      orderId,
      productName,
      currentStatus,
      newStatus: 'canceled' // 기본값은 canceled로 설정
    });
  };

  // 상태 변경 처리
  const handleStatusChange = async (newStatus?: 'canceled' | 'self_pick') => {
    if (!statusDialog.isOpen) return;
    
    // newStatus 파라미터가 있으면 사용, 없으면 statusDialog.newStatus 사용
    const targetStatus = newStatus || statusDialog.newStatus;
    
    try {
      // pending 상태에서 과거 예약 체크 (취소/셀프 수령 모두)
      if (statusDialog.currentStatus === 'pending') {
        const targetOrder = orders.find(o => o.id === statusDialog.orderId);
        if (!targetOrder) return;
        
        // order_date를 KST 기준으로 파싱
        const orderDate = new Date(targetOrder.date + 'T00:00:00');
        // 브라우저가 이미 KST 시간대를 인식하고 있으므로 현재 시간을 그대로 사용
        const kstOrderDate = orderDate;
        
        // 과거 주문인 경우: 취소/셀프 수령 모두 불가
        const now = new Date();
        // 브라우저가 이미 KST 시간대를 인식하고 있으므로 현재 시간을 그대로 사용
        const kstNow = now;
        const todayDate = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
        const orderDateOnly = new Date(kstOrderDate.getFullYear(), kstOrderDate.getMonth(), kstOrderDate.getDate());
        
        if (orderDateOnly.getTime() < todayDate.getTime()) {
          show('과거 예약은 취소하거나 셀프 수령 신청할 수 없습니다.', { variant: 'error' });
          setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled' });
          return;
        }
        
        // self_pick인 경우 추가 체크
        if (targetStatus === 'self_pick') {
          // order_date의 오후 6시(18:00)까지 신청 가능
          if (orderDateOnly.getTime() === todayDate.getTime()) {
            // 오늘 주문인 경우: 현재 시간이 오후 6시 이전이어야 함
            const currentHour = kstNow.getHours();
            if (currentHour >= 18) {
              show('셀프 수령은 오후 6시까지만 가능합니다.', { variant: 'error' });
              setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled' });
              return;
            }
          }
          
          // 셀프 수령 가능 여부는 이미 페이지 진입 시 체크됨
          
          // 미래 주문인 경우: 신청 가능 (시간 제한 없음)
        }
      }
      
      if (USE_MOCKS) {
        // Mock 상태 변경 처리
        await new Promise(resolve => setTimeout(resolve, 500));
        setOrders(prev => prev.map(o => 
          o.id === statusDialog.orderId 
            ? { ...o, status: targetStatus }
            : o
        ));
        
        if (targetStatus === 'canceled') {
          show(`${statusDialog.productName} 주문이 취소되었습니다.`);
        } else if (targetStatus === 'self_pick') {
          show(`${statusDialog.productName} 주문의 셀프 수령 신청이 완료됬습니다`);
        }
        setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled' });
      } else {
        // 실제 API 호출 (cancelReservation 또는 selfPickReservation)
        if (targetStatus === 'canceled') {
          const res = await cancelReservation(statusDialog.orderId);
          if (!res.ok) {
            if (res.status === 400) {
              // 400 에러는 사용자 이슈 - dialog만 닫기
              setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled' });
              return;
            }
            throw new Error('주문 취소에 실패했습니다.');
          }
        } else if (targetStatus === 'self_pick') {
          const res = await selfPickReservation(statusDialog.orderId);
          if (!res.ok) {
            if (res.status === 400) {
              // 400 에러는 사용자 이슈 (시간 제한, 평일 아님 등) - dialog만 닫기
              setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled' });
              return;
            }
            throw new Error('셀프 수령 신청에 실패했습니다.');
          }
        }
        
        // 성공 시 로컬 상태 업데이트
        setOrders(prev => prev.map(o => 
          o.id === statusDialog.orderId 
            ? { ...o, status: targetStatus }
            : o
        ));
        
        if (targetStatus === 'canceled') {
          show(`${statusDialog.productName} 주문이 취소되었습니다.`);
        } else if (targetStatus === 'self_pick') {
          show(`${statusDialog.productName} 주문의 셀프 수령을 준비합니다.`);
        }
        setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'OrderPage - handleStatusChange');
      show(getSafeErrorMessage(e, '상태 변경 중 오류가 발생했습니다.'), { variant: 'error' });
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
              {canSelfPick && <option value="self_pick">셀프 수령(19시 이후)</option>}
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
        <div className="mt-2 text-xs text-gray-600">
          수령 대기 중인 상품을 눌러 셀프 수령으로 변경하거나 예약을 취소할 수 있어요.<br />
                        셀프 수령 신청은 수령일 당일 <strong className="text-gray-800">오후 6시</strong>까지 가능하며, <strong className="text-red-600">오후 6시 이후에는 신청할 수 없습니다</strong>.
        </div>
        <div className="mt-2 text-xs text-red-600">
          셀프 수령 신청 후 <strong>미수령이 누적</strong>될 경우<br /> 
          <strong>당월 셀프 수령 신청이 불가능</strong>할 수 있습니다.
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
                  className={`border-t text-sm ${(o.status === 'pending' || o.status === 'self_pick') ? 'hover:bg-orange-50 cursor-pointer' : ''}`}
                  onClick={() => {
                    if (o.status === 'pending' || o.status === 'self_pick') {
                      openStatusDialog(o.id, o.items.map(item => item.name).join(', '), o.status);
                    }
                  }}
                  role={(o.status === 'pending' || o.status === 'self_pick') ? 'button' : undefined}
                  aria-label={(o.status === 'pending' || o.status === 'self_pick') ? '상태 변경' : undefined}
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
                      className={`${statusBadge(o.status)} ${(o.status === 'pending' || o.status === 'self_pick') ? 'cursor-pointer hover:bg-orange-100' : 'cursor-default'}`}
                      title={(o.status === 'pending' || o.status === 'self_pick') ? '클릭하면 상태를 변경할 수 있습니다.' : undefined}
                    >
                      {o.status === 'pending' ? '수령 대기(클릭 시 변경)' : 
                       o.status === 'picked' ? '수령 완료' : 
                       o.status === 'self_pick' ? '셀프 수령(클릭 시 취소)' :
                       o.status === 'self_pick_ready' ? '셀프 수령 준비 완료' : '예약 취소'}
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
              className={`bg-white rounded-lg shadow p-4 ${(o.status === 'pending' || o.status === 'self_pick') ? 'active:bg-orange-50 cursor-pointer' : ''}`}
              onClick={() => {
                if (o.status === 'pending' || o.status === 'self_pick') {
                  openStatusDialog(o.id, o.items.map(item => item.name).join(', '), o.status);
                }
              }}
              role={(o.status === 'pending' || o.status === 'self_pick') ? 'button' : undefined}
              aria-label={(o.status === 'pending' || o.status === 'self_pick') ? '상태 변경' : undefined}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">{o.date}</div>
                <button
                  onClick={() => {
                    if (o.status === 'pending' || o.status === 'self_pick') {
                      openStatusDialog(o.id, o.items.map(item => item.name).join(', '), o.status);
                    }
                  }}
                  className={`${statusBadge(o.status)} ${(o.status === 'pending' || o.status === 'self_pick') ? 'cursor-pointer hover:bg-orange-100' : 'cursor-default'}`}
                  title={(o.status === 'pending' || o.status === 'self_pick') ? '클릭하면 상태를 변경할 수 있습니다.' : undefined}
                  disabled={!(o.status === 'pending' || o.status === 'self_pick')}
                >
                  {o.status === 'pending' ? '수령 대기(클릭 시 변경)' : 
                   o.status === 'picked' ? '수령 완료' : 
                   o.status === 'self_pick' ? '셀프 수령(클릭 시 취소)' :
                   o.status === 'self_pick_ready' ? '셀프 수령 준비 완료' : '예약 취소'}
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

      {/* 상태 변경 확인 Dialog */}
      {statusDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {statusDialog.currentStatus === 'pending' ? '상태 변경' : '예약 취소'}
            </h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{statusDialog.productName}"</span>
              {statusDialog.currentStatus === 'pending' 
                ? <>주문의 상태를 변경합니다.<br />셀프 수령 신청은 <b>수령일 오후 6시</b>까지 가능합니다.</>
                : '주문을 취소하시겠습니까?'}
            </p>
            <div className="mb-4">
              <span className="text-sm text-red-600">셀프 수령 신청 후 <strong>미수령이 누적</strong>될 경우<br /> <strong>당월 셀프 수령 신청이 불가능</strong>할 수 있습니다.</span>           </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // pending -> canceled 또는 self_pick -> canceled
                  handleStatusChange('canceled');
                }}
                className="flex-1 h-10 rounded bg-red-500 hover:bg-red-600 text-white font-medium"
              >
                예약 취소
              </button>
              {statusDialog.currentStatus === 'pending' && canSelfPick && !isAfter6PM && (
                <button
                  onClick={() => {
                    // pending -> self_pick
                    handleStatusChange('self_pick');
                  }}
                  className="flex-1 h-10 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium"
                >
                  셀프 수령
                </button>
              )}
              <button
                onClick={() => setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled' })}
                className="flex-1 h-10 rounded bg-gray-500 hover:bg-gray-600 text-white"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
