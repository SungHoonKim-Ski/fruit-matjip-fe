import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { listOrders, type OrderRow } from '../../mocks/orders';
import { getReservations, cancelReservation, selfPickReservation, checkCanSelfPick, minusQuantity } from '../../utils/api';
import BottomNav from '../../components/BottomNav';

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
  // 필터 - 기본값: 시작일(오늘)만 사용
  const [from, setFrom] = useState(today);
  const [status, setStatus] = useState<'all' | 'pending' | 'paid' | 'picked' | 'self_pick' | 'self_pick_ready' | 'canceled'>('all');

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
    quantity: number;
  }>({
    isOpen: false,
    orderId: 0,
    productName: '',
    currentStatus: 'pending',
    newStatus: 'canceled',
    quantity: 0
  });

  // Dialog 오픈 시점의 셀프 수령 가능 여부(전역 API && 해당 상품 플래그)
  const [dialogSelfPickEligible, setDialogSelfPickEligible] = useState<boolean | null>(null);

  // Dialog에서 수량 변경 임시 상태 (확인 버튼을 눌러야 실제 적용)
  const [tempQuantity, setTempQuantity] = useState<number>(0);

  // 검색 관련 상태
  const [search, setSearch] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [tempSearch, setTempSearch] = useState('');

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
            const res = await getReservations(from, from);
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
              // NO_SHOW는 CANCELED로 취급
              let orderStatus: 'pending' | 'paid' | 'picked' | 'self_pick' | 'self_pick_ready' | 'canceled';
              const rawStatus = String(r.status ?? '').toUpperCase();
              switch (rawStatus) {
                case 'PENDING':
                  orderStatus = 'pending';
                  break;
                case 'PAID':
                  orderStatus = 'paid';
                  break;
                case 'PICKED':
                case 'COMPLETED':
                  orderStatus = 'picked';
                  break;
                case 'SELF_PICK':
                case 'SELF_PICKED':
                  orderStatus = 'self_pick';
                  break;
                case 'SELF_PICK_READY':
                  orderStatus = 'self_pick_ready';
                  break;
                case 'CANCELED':
                case 'CANCELLED':
                case 'NO_SHOW':
                  orderStatus = 'canceled';
                  break;
                default:
                  // 소문자로도 체크 (하위 호환성)
                  const lowerStatus = r.status?.toLowerCase();
                  if (lowerStatus === 'pending') orderStatus = 'pending';
                  else if (lowerStatus === 'paid') orderStatus = 'paid';
                  else if (lowerStatus === 'picked' || lowerStatus === 'completed') orderStatus = 'picked';
                  else if (lowerStatus === 'self_pick' || lowerStatus === 'self_picked') orderStatus = 'self_pick';
                  else if (lowerStatus === 'self_pick_ready') orderStatus = 'self_pick_ready';
                  else if (lowerStatus === 'canceled' || lowerStatus === 'cancelled' || lowerStatus === 'no_show') orderStatus = 'canceled';
                  else orderStatus = 'pending';
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
                  imageUrl: r.product_image ? `${process.env.REACT_APP_IMG_URL}/${r.product_image}` : '',
                  productId: r.product_id,
                  // 서버에서 self_pick 정보가 포함될 경우 반영(예약 상세에 포함되는 경우 대비)
                  selfPickAllowed: typeof r.self_pick === 'boolean' ? Boolean(r.self_pick) : undefined,
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
  }, [page, show, from]);

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
    const searchQuery = search.trim().toLowerCase();

    return orders.filter(o => {
      const d = new Date(o.date);
      const sameDay = f ? (
        d.getFullYear() === f.getFullYear() &&
        d.getMonth() === f.getMonth() &&
        d.getDate() === f.getDate()
      ) : true;
      const s = status === 'all' ? true : o.status === status;

      // 제품명 검색 필터링
      const matchesSearch = searchQuery === '' ||
        o.items.some(item => item.name.toLowerCase().includes(searchQuery));

      return sameDay && s && matchesSearch;
    });
  }, [orders, from, status, search]);

  const totalPrice = (o: OrderRow) =>
    o.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const statusBadge = (s: OrderRow['status']) => {
    const base = 'inline-flex items-center h-7 px-2.5 rounded-full text-xs font-medium';
    if (s === 'pending') return `${base} bg-orange-50 text-orange-600 border border-orange-200`;
    if (s === 'paid') return `${base} bg-indigo-50 text-indigo-700 border border-indigo-200`;
    if (s === 'picked') return `${base} bg-green-50 text-green-700 border border-green-200`;
    if (s === 'self_pick') return `${base} bg-blue-50 text-blue-700 border border-blue-200`;
    if (s === 'self_pick_ready') return `${base} bg-yellow-50 text-yellow-700 border border-yellow-200`;
    return `${base} bg-gray-100 text-gray-600 border border-gray-200`;
  };

  // 상태 변경 dialog 열기
  const openStatusDialog = (orderId: number, productName: string, currentStatus: 'pending' | 'self_pick', quantity: number) => {
    setStatusDialog({
      isOpen: true,
      orderId,
      productName,
      currentStatus,
      newStatus: 'canceled', // 기본값은 canceled로 설정
      quantity
    });
    setTempQuantity(quantity); // 임시 수량 초기화
  };

  // Dialog 오픈 시 최신 조건으로 셀프 수령 가능 여부 계산 (API + 상품 self_pick)
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!statusDialog.isOpen || statusDialog.currentStatus !== 'pending') {
        setDialogSelfPickEligible(null);
        return;
      }
      try {
        const order = orders.find(o => o.id === statusDialog.orderId);
        const firstItem: any = (order?.items || [])[0];
        const productAllows = !!(firstItem && firstItem.selfPickAllowed === true);
        const apiAllows = await checkCanSelfPick();
        if (alive) setDialogSelfPickEligible(Boolean(apiAllows && productAllows));
      } catch (e) {
        if (alive) setDialogSelfPickEligible(false);
      }
    };
    run();
    return () => { alive = false; };
  }, [statusDialog.isOpen, statusDialog.orderId, statusDialog.currentStatus, orders]);

  // 검색 모달 열기/닫기
  const openSearchModal = () => {
    setTempSearch(search);
    setSearchModalOpen(true);
  };

  const closeSearchModal = () => {
    setSearchModalOpen(false);
    setTempSearch('');
  };

  // 검색 적용
  const applySearch = () => {
    setSearch(tempSearch);
    setSearchModalOpen(false);
  };

  // 검색 초기화
  const clearSearch = () => {
    setSearch('');
    setTempSearch('');
  };

  // 임시 수량 증감 처리 (화면에만 반영, 확인 버튼 필요)
  const handleTempQuantityChange = (diff: number) => {
    const newTempQuantity = Math.max(1, Math.min(tempQuantity + diff, statusDialog.quantity));
    setTempQuantity(newTempQuantity);
  };

  // 수량 변경 확인 처리 (실제 API 호출)
  const handleConfirmQuantityChange = async () => {
    if (tempQuantity === statusDialog.quantity) {
      show('수량 변경이 없습니다.', { variant: 'info' });
      return;
    }

    const decreaseAmount = statusDialog.quantity - tempQuantity;
    if (decreaseAmount <= 0) {
      show('수량은 더 이상 늘릴 수 없습니다.', { variant: 'error' });
      return;
    }

    if (!statusDialog.isOpen) return;

    try {
      if (USE_MOCKS) {
        // Mock 수량 감소 처리
        await new Promise(resolve => setTimeout(resolve, 500));
        setOrders(prev => prev.map(o =>
          o.id === statusDialog.orderId
            ? {
              ...o,
              items: o.items.map(item => ({
                ...item,
                quantity: Math.max(0, item.quantity - decreaseAmount)
              }))
            }
            : o
        ));

        // dialog의 수량도 업데이트
        setStatusDialog(prev => ({ ...prev, quantity: tempQuantity }));

        show(`${statusDialog.productName} 수량이 ${decreaseAmount}개 감소되었습니다.`);

        // dialog 닫기
        setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
      } else {
        // 실제 API 호출
        const res = await minusQuantity(statusDialog.orderId, decreaseAmount);
        if (!res.ok) {
          if (res.status === 400) {
            show('수량을 줄일 수 없습니다. 최소 수량은 1개입니다.', { variant: 'error' });
            return;
          }
          throw new Error('수량 변경에 실패했습니다.');
        }

        // 성공 시 로컬 상태 업데이트
        setOrders(prev => prev.map(o =>
          o.id === statusDialog.orderId
            ? {
              ...o,
              items: o.items.map(item => ({
                ...item,
                quantity: Math.max(0, item.quantity - decreaseAmount)
              }))
            }
            : o
        ));

        // dialog의 수량도 업데이트
        setStatusDialog(prev => ({ ...prev, quantity: tempQuantity }));

        show(`${statusDialog.productName} 수량이 ${decreaseAmount}개 감소되었습니다.`);

        // dialog 닫기
        setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
      }
    } catch (e: any) {
      safeErrorLog(e, 'OrderPage - handleConfirmQuantityChange');
      show(getSafeErrorMessage(e, '수량 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
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
          setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
          return;
        }

        // self_pick인 경우 추가 체크
        if (targetStatus === 'self_pick') {
          // order_date의 오후 7시(19:00)까지 신청 가능
          if (orderDateOnly.getTime() === todayDate.getTime()) {
            // 오늘 주문인 경우: 현재 시간이 오후 6시 이전이어야 함
            const currentHour = kstNow.getHours();
            const currentMinute = kstNow.getMinutes();
            if (currentHour >= 19 && currentMinute >= 30) {
              show('셀프 수령은 오후 7시 30분까지만 가능합니다.', { variant: 'error' });
              setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
              return;
            }
          }

          // 셀프 수령 가능 여부 추가 체크: 전역 허용 + 상품 자체 허용 둘 다 필요
          if (canSelfPick !== true) {
            // show('셀프 수령 노쇼 누적으로 셀프 수령 신청이 불가능합니다.', { variant: 'error' });
            setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
            return;
          }
          // 해당 주문의 상품(selfPickAllowed)이 true인 경우에만 허용 (대표 아이템 기준)
          const firstItem = (targetOrder.items || [])[0] as any;
          const productAllows = !!(firstItem && firstItem.selfPickAllowed === true);
          if (!productAllows) {
            show('해당 상품은 셀프 수령이 불가합니다.', { variant: 'error' });
            setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
            return;
          }

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
        setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
      } else {
        // 실제 API 호출 (cancelReservation 또는 selfPickReservation)
        if (targetStatus === 'canceled') {
          const res = await cancelReservation(statusDialog.orderId);
          if (!res.ok) {
            if (res.status === 400) {
              // 400 에러는 사용자 이슈 - dialog만 닫기
              setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
              return;
            }
            throw new Error('주문 취소에 실패했습니다.');
          }
        } else if (targetStatus === 'self_pick') {
          const res = await selfPickReservation(statusDialog.orderId);
          if (!res.ok) {
            if (res.status === 400) {
              // 400 에러는 사용자 이슈 (시간 제한, 평일 아님 등) - dialog만 닫기
              setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
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
        setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
      }
    } catch (e: any) {
      safeErrorLog(e, 'OrderPage - handleStatusChange');
      show(getSafeErrorMessage(e, '상태 변경 중 오류가 발생했습니다.'), { variant: 'error' });
      setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500">상품 수령일</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 w-full h-10 border rounded px-2" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500">수령 상태</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as any)}
              className="mt-1 w-full h-10 border rounded px-2"
            >
              <option value="all">전체</option>
              <option value="pending">예약 완료</option>
              <option value="paid">결제 완료</option>
              <option value="picked">수령 완료</option>
              {canSelfPick && <option value="self_pick">셀프 수령(20시 이후)</option>}
              <option value="canceled">예약 취소</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => { setFrom(today); setStatus('all'); }}
              className="w-full h-10 rounded border hover:bg-gray-50"
            >
              초기화
            </button>
          </div>
        </div>
        {/* 안내 문구 */}
        <div className="mt-2 text-xs text-gray-600">
          <strong>예약 완료 버튼</strong> 클릭 시 <strong>예약을 취소</strong>할 수 있습니다<br />

        </div>
        <div className="mt-2 text-xs text-red-600">
          <strong>노쇼가 누적</strong>될 경우 <strong>추후 예약이 불가합니다</strong> <br />
          꼭 수령해주세요!
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
                      openStatusDialog(o.id, o.items.map(item => item.name).join(', '), o.status, o.items.reduce((sum, item) => sum + item.quantity, 0));
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
                      {o.status === 'pending' ? '예약 완료(클릭 시 변경)' :
                        o.status === 'paid' ? '결제 완료' :
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
                  openStatusDialog(o.id, o.items.map(item => item.name).join(', '), o.status, o.items.reduce((sum, item) => sum + item.quantity, 0));
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
                      openStatusDialog(o.id, o.items.map(item => item.name).join(', '), o.status, o.items.reduce((sum, item) => sum + item.quantity, 0));
                    }
                  }}
                  className={`${statusBadge(o.status)} ${(o.status === 'pending' || o.status === 'self_pick') ? 'cursor-pointer hover:bg-orange-100' : 'cursor-default'}`}
                  title={(o.status === 'pending' || o.status === 'self_pick') ? '클릭하면 상태를 변경할 수 있습니다.' : undefined}
                  disabled={!(o.status === 'pending' || o.status === 'self_pick')}
                >
                  {o.status === 'pending' ? '예약 완료(클릭 시 변경)' :
                    o.status === 'paid' ? '결제 완료' :
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
                ? <>주문의 상태를 변경합니다.<br />셀프 수령 신청은 <b>수령일 오후 7시반</b>까지 가능합니다.</>
                : '주문을 취소하시겠습니까?'}
            </p>
            {/* 수량 변경 UI */}
            {statusDialog.currentStatus === 'pending' && statusDialog.quantity > 1 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">변경 뒤 수량 <strong>[기존 예약 수량 이하로만 가능해요]</strong></span>
                </div>
                <div className="flex items-center gap-3 justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleTempQuantityChange(-1)}
                      disabled={tempQuantity <= 1}
                      className="w-10 h-10 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg flex items-center justify-center"
                    >
                      -
                    </button>
                    <div className="text-2xl font-bold text-gray-900 min-w-[60px] text-center">
                      {tempQuantity}개
                    </div>
                    <button
                      onClick={() => handleTempQuantityChange(+1)}
                      disabled={tempQuantity >= statusDialog.quantity}
                      className="w-10 h-10 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={handleConfirmQuantityChange}
                    disabled={tempQuantity === statusDialog.quantity}
                    className="h-10 px-4 rounded bg-orange-500 hover:bg-orange-600 text-white font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    적용
                  </button>
                </div>
              </div>
            )}
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
              {statusDialog.currentStatus === 'pending' && dialogSelfPickEligible === true && (() => {
                // 주문일 기준으로 18시 체크
                const targetOrder = orders.find(o => o.id === statusDialog.orderId);
                if (!targetOrder) return false;

                const orderDate = new Date(targetOrder.date + 'T00:00:00');
                const now = new Date();
                const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());

                // 주문일이 오늘인 경우에만 18시 체크
                if (orderDateOnly.getTime() === todayDate.getTime()) {
                  const currentHour = now.getHours();
                  return currentHour < 18;
                }

                // 주문일이 미래인 경우는 항상 가능
                return true;
              })() && (
                  <button
                    onClick={() => {
                      // pending -> self_pick
                      handleStatusChange('self_pick');
                    }}
                    className="flex-1 h-10 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm"
                  >
                    <span className="whitespace-pre-line">{"20시 이후\n셀프 수령"}</span>
                  </button>
                )}
              <button
                onClick={() => setStatusDialog({ isOpen: false, orderId: 0, productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 })}
                className="flex-1 h-10 rounded bg-gray-500 hover:bg-gray-600 text-white"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB 통합 검색/필터 초기화 버튼 */}
      <button
        onClick={search ? clearSearch : openSearchModal}
        className={`fixed bottom-4 right-4 z-30 bg-white text-gray-800 rounded-full shadow-lg flex items-center gap-2 px-4 py-3 transition-all duration-200 hover:scale-105 active:scale-95 ${search ? 'border border-blue-500' : 'border-2 border-blue-500'
          }`}
        aria-label={search ? "필터 초기화" : "주문 검색"}
      >
        {search ? (
          // 필터 초기화 아이콘 (필터)
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
          </svg>
        ) : (
          // 검색 아이콘 (돋보기)
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}
        <span className="text-sm font-bold text-gray-900">
          {search ? '초기화' : ''}
        </span>
      </button>

      {/* 검색 모달 */}
      {searchModalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          aria-modal="true"
          role="dialog"
        >
          <div className="absolute inset-0 bg-black/40" onClick={closeSearchModal} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl border">
            {/* 검색 헤더 */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">주문 검색</h2>
              <button
                onClick={closeSearchModal}
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-gray-50"
                aria-label="검색창 닫기"
              >
                ✕
              </button>
            </div>

            {/* 검색 입력 */}
            <div className="p-4">
              <div className="relative">
                <input
                  type="text"
                  value={tempSearch}
                  onChange={e => setTempSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      applySearch();
                    }
                  }}
                  placeholder="제품명을 입력하세요 (예: 토마토, 사과)"
                  className="w-full h-12 pl-10 pr-10 rounded-lg border-2 border-gray-300 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm bg-white"
                  autoFocus
                />
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔎</span>
                {tempSearch && (
                  <button
                    type="button"
                    onClick={() => setTempSearch('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm w-6 h-6 flex items-center justify-center"
                    aria-label="검색어 지우기"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* 검색 결과 미리보기 */}
            {tempSearch && (
              <div className="px-4 pb-4">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {orders.filter(o =>
                    o.items.some(item =>
                      item.name.toLowerCase().includes(tempSearch.trim().toLowerCase())
                    )
                  ).map(order => (
                    <div key={order.id} className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => {
                        // 해당 주문의 첫 번째 제품명으로 검색 적용하고 모든 필터 해제
                        const firstProductName = order.items[0]?.name || '';
                        setSearch(firstProductName);
                        setFrom(today);
                        setStatus('all');
                        setSearchModalOpen(false);
                        setTempSearch('');
                      }}>
                      <div className="text-sm font-medium text-gray-800 mb-1">
                        {order.date}
                      </div>
                      <div className="text-xs text-gray-600">
                        {order.items.map(item => item.name).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 검색 결과 없음 */}
                {orders.filter(o =>
                  o.items.some(item =>
                    item.name.toLowerCase().includes(tempSearch.trim().toLowerCase())
                  )
                ).length === 0 && (
                    <div className="text-center text-gray-500 py-6">
                      <div className="text-sm">
                        <span className="font-medium text-orange-600">"{tempSearch}"</span>에 대한 검색 결과가 없습니다.
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        다른 검색어를 시도해보세요.
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* 버튼 영역 */}
            <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={closeSearchModal}
                className="flex-1 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={applySearch}
                className="flex-1 h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors"
              >
                검색 적용
              </button>
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </main>
  );
}
