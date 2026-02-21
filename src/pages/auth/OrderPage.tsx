import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { listOrders, type OrderRow } from '../../mocks/orders';
import { getReservations, cancelReservation, minusQuantity, getServerTime, getDeliveryConfig } from '../../utils/api';
import BottomNav from '../../components/BottomNav';

const KRW = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

// R-26020216-VWQPA → R-VWQPA (중간 날짜 영역 제거)
const shortCode = (code?: string) => {
  if (!code) return '';
  const parts = code.split('-');
  if (parts.length >= 3) return `${parts[0]}-${parts.slice(2).join('-')}`;
  return code;
};

export default function OrdersPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { show } = useSnackbar();
  function formatDateKR(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ✅ 오늘 ~ 6틀 뒤 (reservation API 기본값과 동일)
  const localToday = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  })();
  // 필터 - 기본값: 시작일(오늘)만 사용
  const [from, setFrom] = useState(localToday);
  const [fromTouched, setFromTouched] = useState(false);
  const [status, setStatus] = useState<'all' | 'pending' | 'picked' | 'canceled' | 'no_show'>('all');

  // 데이터
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);         // “더 보기” 용
  const [hasMore, setHasMore] = useState(false);
  // 상태 변경 dialog 상태
  const [statusDialog, setStatusDialog] = useState<{
    isOpen: boolean;
    orderId: number;
    displayCode: string;
    productName: string;
    currentStatus: 'pending';
    newStatus: 'canceled';
    quantity: number;
  }>({
    isOpen: false,
    orderId: 0,
    displayCode: '',
    productName: '',
    currentStatus: 'pending',
    newStatus: 'canceled',
    quantity: 0
  });

  // Dialog에서 수량 변경 임시 상태 (확인 버튼을 눌러야 실제 적용)
  const [tempQuantity, setTempQuantity] = useState<number>(0);

  // 검색 관련 상태
  const [search, setSearch] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [tempSearch, setTempSearch] = useState('');
  const [viewTab, setViewTab] = useState<'reservation' | 'delivery'>('reservation');
  const [deliveryDialog, setDeliveryDialog] = useState<{ isOpen: boolean; groupKey: string }>({
    isOpen: false,
    groupKey: '',
  });

  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'delivery') {
      setViewTab('delivery');
    }
  }, [searchParams]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (USE_MOCKS) {
          setDeliveryEnabled(true);
          return;
        }
        const config = await getDeliveryConfig();
        if (!alive) return;
        if (config && config.enabled === false) {
          setDeliveryEnabled(false);
        } else {
          setDeliveryEnabled(true);
        }
      } catch (e) {
        safeErrorLog(e, 'OrderPage - loadDeliveryConfig');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
              let orderStatus: 'pending' | 'picked' | 'canceled' | 'no_show';
              const rawStatus = String(r.status ?? '').toUpperCase();
              switch (rawStatus) {
                case 'PENDING':
                  orderStatus = 'pending';
                  break;
                case 'PICKED':
                case 'COMPLETED':
                  orderStatus = 'picked';
                  break;
                case 'SELF_PICK':
                case 'SELF_PICKED':
                case 'SELF_PICK_READY':
                  orderStatus = 'pending';
                  break;
                case 'NO_SHOW':
                  orderStatus = 'no_show';
                  break;
                case 'CANCELED':
                case 'CANCELLED':
                  orderStatus = 'canceled';
                  break;
                default:
                  const lowerStatus = r.status?.toLowerCase();
                  if (lowerStatus === 'pending') orderStatus = 'pending';
                  else if (lowerStatus === 'picked' || lowerStatus === 'completed') orderStatus = 'picked';
                  else if (lowerStatus === 'self_pick' || lowerStatus === 'self_picked' || lowerStatus === 'self_pick_ready') orderStatus = 'pending';
                  else if (lowerStatus === 'no_show') orderStatus = 'no_show';
                  else if (lowerStatus === 'canceled' || lowerStatus === 'cancelled') orderStatus = 'canceled';
                  else orderStatus = 'pending';
              }

              const qty = Math.max(1, Number(r.quantity ?? 1));
              const amt = Number(r.amount ?? 0);
              const unit = qty > 0 ? amt / qty : amt;
              const delivery = r.delivery
                ? {
                  status: r.delivery.status ?? r.delivery_status ?? r.deliveryStatus,
                  displayCode: String(r.delivery.display_code ?? r.delivery.displayCode ?? ''),
                  deliveryHour: Number(r.delivery.delivery_hour ?? r.delivery.deliveryHour ?? r.deliveryHour ?? 0),
                  deliveryMinute: Number(r.delivery.delivery_minute ?? r.delivery.deliveryMinute ?? r.deliveryMinute ?? 0),
                  deliveryFee: Number(r.delivery.delivery_fee ?? r.delivery.deliveryFee ?? r.deliveryFee ?? 0),
                  estimatedMinutes: Number(r.delivery.estimated_minutes ?? r.delivery.estimatedMinutes ?? 0) || undefined,
                  acceptedAt: (r.delivery.accepted_at ?? r.delivery.acceptedAt) as string | undefined,
                  scheduledDeliveryHour: r.delivery.scheduled_delivery_hour ?? r.delivery.scheduledDeliveryHour ?? null,
                  scheduledDeliveryMinute: r.delivery.scheduled_delivery_minute ?? r.delivery.scheduledDeliveryMinute ?? null,
                }
                : undefined;

              return {
                id: r.id,
                displayCode: String(r.display_code ?? r.displayCode ?? r.id),
                date: r.order_date, // orderDate -> order_date로 수정
                status: orderStatus,
                items: [{
                  id: r.id,
                  name: r.product_name,
                  quantity: qty,
                  price: unit,
                  imageUrl: r.product_image ? `${process.env.REACT_APP_IMG_URL}/${r.product_image}` : '',
                  productId: r.product_id,
                }],
                deliveryOrderCode: delivery?.displayCode,
                delivery,
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

  useEffect(() => {
    let alive = true;
    (async () => {
      if (USE_MOCKS) return;
      try {
        const serverMs = await getServerTime();
        const offset = serverMs - Date.now();
        if (alive) {
          setServerTimeOffsetMs(offset);
          if (!fromTouched) {
            const serverToday = formatDateKR(new Date(Date.now() + offset));
            setFrom(serverToday);
          }
        }
      } catch (e) {
        safeErrorLog(e, 'OrderPage - getServerTime');
      }
    })();
    return () => { alive = false; };
  }, [fromTouched]);

  const statusPriority: Record<string, number> = { pending: 0, picked: 1, canceled: 2, no_show: 3 };

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
    }).sort((a, b) => (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9));
  }, [orders, from, status, search]);

  const totalPrice = (o: OrderRow) =>
    o.items.reduce((sum, it) => sum + it.price * it.quantity, 0);

  const openReservationCancel = (order: OrderRow) => {
    if (order.status === 'pending' && !isDeliveryLocked(order)) {
      openStatusDialog(
        order.id,
        order.displayCode,
        order.items.map(item => item.name).join(', '),
        order.status,
        order.items.reduce((sum, item) => sum + item.quantity, 0)
      );
    }
  };

  const renderReservationStatusBadge = (order: OrderRow) => {
    const label = getUnifiedStatusLabel(order);
    const base = 'inline-flex items-center h-7 px-2.5 rounded-md text-xs font-semibold';
    const isClickable = order.status === 'pending' && !isDeliveryLocked(order);
    if (isClickable) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openReservationCancel(order);
          }}
          className={`${base} bg-white text-orange-600 border border-orange-300 shadow-sm hover:bg-orange-50`}
        >
          {label}
        </button>
      );
    }
    if (order.status === 'picked') {
      return <span className={`${base} bg-green-50 text-green-700 border border-green-200`}>{label}</span>;
    }
    if (order.status === 'no_show') {
      return <span className={`${base} bg-red-50 text-red-700 border border-red-200`}>{label}</span>;
    }
    return <span className={`${base} bg-gray-100 text-gray-600 border border-gray-200`}>{label}</span>;
  };

  const renderDeliveryStatusBadge = (ordersInGroup: OrderRow[]) => {
    const label = getDeliveryStatusLabel(ordersInGroup);
    const status = String(ordersInGroup[0]?.delivery?.status ?? '').toUpperCase();
    const base = 'inline-flex items-center h-7 px-2.5 rounded-md text-xs font-semibold';
    if (status === 'PAID') {
      return <span className={`${base} bg-white text-orange-600 border border-orange-300 shadow-sm`}>{label}</span>;
    }
    if (status === 'OUT_FOR_DELIVERY') {
      return <span className={`${base} bg-indigo-50 text-indigo-700 border border-indigo-200`}>{label}</span>;
    }
    if (status === 'DELIVERED') {
      return <span className={`${base} bg-green-50 text-green-700 border border-green-200`}>{label}</span>;
    }
    return <span className={`${base} bg-gray-100 text-gray-600 border border-gray-200`}>{label}</span>;
  };

  // 상태 변경 dialog 열기
  const openStatusDialog = (
    orderId: number,
    displayCode: string,
    productName: string,
    currentStatus: 'pending',
    quantity: number
  ) => {
    setStatusDialog({
      isOpen: true,
      orderId,
      displayCode,
      productName,
      currentStatus,
      newStatus: 'canceled', // 기본값은 canceled로 설정
      quantity
    });
    setTempQuantity(quantity); // 임시 수량 초기화
  };

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
        setStatusDialog({ isOpen: false, orderId: 0, displayCode: '', productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
      } else {
        // 실제 API 호출
        const res = await minusQuantity(statusDialog.displayCode, decreaseAmount);
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
        setStatusDialog({ isOpen: false, orderId: 0, displayCode: '', productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
      }
    } catch (e: any) {
      safeErrorLog(e, 'OrderPage - handleConfirmQuantityChange');
      show(getSafeErrorMessage(e, '수량 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  // 상태 변경 처리
  const handleStatusChange = async () => {
    if (!statusDialog.isOpen) return;

    const targetStatus = statusDialog.newStatus;

    try {
      // pending 상태에서 과거 예약 체크 (취소)
      if (statusDialog.currentStatus === 'pending') {
        const targetOrder = orders.find(o => o.id === statusDialog.orderId);
        if (!targetOrder) return;

        // order_date를 KST 기준으로 파싱
        const orderDate = new Date(targetOrder.date + 'T00:00:00');
        // 브라우저가 이미 KST 시간대를 인식하고 있으므로 현재 시간을 그대로 사용
        const kstOrderDate = orderDate;

        // 과거 주문인 경우: 취소 불가
        const kstNow = getKstNow();
        const todayDate = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate());
        const orderDateOnly = new Date(kstOrderDate.getFullYear(), kstOrderDate.getMonth(), kstOrderDate.getDate());

        if (orderDateOnly.getTime() < todayDate.getTime()) {
          show('과거 예약은 취소할 수 없습니다.', { variant: 'error' });
          setStatusDialog({ isOpen: false, orderId: 0, displayCode: '', productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
          return;
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
        }
        setStatusDialog({ isOpen: false, orderId: 0, displayCode: '', productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
      } else {
        // 실제 API 호출 (cancelReservation)
        if (targetStatus === 'canceled') {
          const res = await cancelReservation(statusDialog.displayCode);
          if (!res.ok) {
            if (res.status === 400) {
              // 400 에러는 사용자 이슈 - dialog만 닫기
              setStatusDialog({ isOpen: false, orderId: 0, displayCode: '', productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
              return;
            }
            throw new Error('주문 취소에 실패했습니다.');
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
        }
        setStatusDialog({ isOpen: false, orderId: 0, displayCode: '', productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
      }
    } catch (e: any) {
      safeErrorLog(e, 'OrderPage - handleStatusChange');
      show(getSafeErrorMessage(e, '상태 변경 중 오류가 발생했습니다.'), { variant: 'error' });
      setStatusDialog({ isOpen: false, orderId: 0, displayCode: '', productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 });
    }
  };

  const getKstNow = () => new Date(Date.now() + serverTimeOffsetMs);

  const groupedOrders = useMemo(() => {
    const groups: { key: string; deliveryOrderCode?: string; orders: OrderRow[] }[] = [];
    const groupMap = new Map<string, { key: string; deliveryOrderCode?: string; orders: OrderRow[] }>();
    filtered.forEach(order => {
      const key = order.deliveryOrderCode ? `delivery-${order.deliveryOrderCode}` : `order-${order.displayCode}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { key, deliveryOrderCode: order.deliveryOrderCode, orders: [] });
        groups.push(groupMap.get(key)!);
      }
      groupMap.get(key)!.orders.push(order);
    });
    const sortedGroups = groups.map(group => ({
      ...group,
      orders: [...group.orders].sort((a, b) => b.displayCode.localeCompare(a.displayCode)),
    }));
    return sortedGroups.sort((a, b) => {
      const aKey = a.deliveryOrderCode ?? a.orders[0]?.displayCode ?? '';
      const bKey = b.deliveryOrderCode ?? b.orders[0]?.displayCode ?? '';
      return bKey.localeCompare(aKey);
    });
  }, [filtered]);

  const selectedDeliveryGroup = useMemo(
    () => groupedOrders.find(g => g.key === deliveryDialog.groupKey),
    [groupedOrders, deliveryDialog.groupKey]
  );

  const getGroupTotal = (ordersInGroup: OrderRow[], includeDeliveryFee: boolean) => {
    const subtotal = ordersInGroup.reduce((sum, order) => sum + totalPrice(order), 0);
    if (!includeDeliveryFee) return subtotal;
    const fee = Number(ordersInGroup[0]?.delivery?.deliveryFee ?? 0);
    return subtotal + fee;
  };

  const getDeliveryOrderSummary = (ordersInGroup: OrderRow[]) => {
    if (!ordersInGroup || ordersInGroup.length === 0) return '배달 주문';
    const firstName = ordersInGroup[0]?.items[0]?.name || '배달 주문';
    const count = ordersInGroup.length;
    if (count <= 1) return firstName;
    return `${firstName} 외 ${count - 1}건`;
  };

  const splitHeaderLine = (text: string, limit = 15) => {
    if (!text || text.length <= limit) return [text];
    return [text.slice(0, limit), text.slice(limit)];
  };

  const trimItemName = (name: string) => (name.length > 12 ? `${name.slice(0, 12)}..` : name);

  const getUnifiedStatusLabel = (order: OrderRow) => {
    switch (order.status) {
      case 'pending':
        return '예약 완료';
      case 'picked':
        return '수령 완료';
      case 'no_show':
        return '노쇼';
      case 'canceled':
      default:
        return '예약 취소';
    }
  };

  const getDeliveryProgressLabel = (order: OrderRow) => {
    const status = String(order.delivery?.status ?? '').toUpperCase();
    if (status === 'PAID') return '결제 완료';
    if (status === 'OUT_FOR_DELIVERY') return '배달 진행중';
    if (status === 'DELIVERED') return '배달 완료';
    return null;
  };

  const isDeliveryLocked = (order: OrderRow) => {
    const status = String(order.delivery?.status ?? '').toUpperCase();
    return status === 'PAID' || status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED';
  };

  const getDeliveryProgressStep = (order: OrderRow) => {
    const status = String(order.delivery?.status ?? '').toUpperCase();
    if (status === 'DELIVERED') return 3;
    if (status === 'OUT_FOR_DELIVERY') return 2;
    if (status === 'PAID') return 1;
    return 0;
  };

  const getDeliveryStatusLabel = (ordersInGroup: OrderRow[]) => {
    const status = String(ordersInGroup[0]?.delivery?.status ?? '').toUpperCase();
    if (status === 'PAID') return '결제 완료';
    if (status === 'OUT_FOR_DELIVERY') return '배달 진행중';
    if (status === 'DELIVERED') return '배달 완료';
    if (status === 'CANCELED') return '배달 취소';
    if (status === 'FAILED') return '결제 실패';
    return '배달 준비';
  };

  const getGroupItems = (ordersInGroup: OrderRow[]) => {
    const map = new Map<string, { name: string; quantity: number; imageUrl?: string }>();
    ordersInGroup.forEach(order => {
      order.items.forEach(item => {
        const key = item.name;
        const existing = map.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          map.set(key, { name: item.name, quantity: item.quantity, imageUrl: item.imageUrl });
        }
      });
    });
    return Array.from(map.values());
  };

  const getGroupItemTotals = (ordersInGroup: OrderRow[]) => {
    const map = new Map<string, { name: string; quantity: number; imageUrl?: string; total: number }>();
    ordersInGroup.forEach(order => {
      order.items.forEach(item => {
        const key = item.name;
        const total = (item.price ?? 0) * (item.quantity ?? 0);
        const existing = map.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.total += total;
        } else {
          map.set(key, { name: item.name, quantity: item.quantity, imageUrl: item.imageUrl, total });
        }
      });
    });
    return Array.from(map.values());
  };

  const parseAcceptedAt = (value: any): Date | null => {
    if (!value) return null;
    if (Array.isArray(value)) {
      const [y, mo, d, h = 0, mi = 0, s = 0] = value;
      return new Date(y, mo - 1, d, h, mi, s);
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const getEstimatedArrivalLabel = (order: OrderRow) => {
    if (order.delivery?.scheduledDeliveryHour != null) {
      const h = order.delivery.scheduledDeliveryHour;
      const m = order.delivery.scheduledDeliveryMinute ?? 0;
      return `${h}시${m > 0 ? ` ${String(m).padStart(2, '0')}분` : ''} 도착 예정`;
    }
    if (!order.delivery?.estimatedMinutes || !order.delivery?.acceptedAt) return null;
    const accepted = parseAcceptedAt(order.delivery.acceptedAt);
    if (!accepted) return null;
    const arrival = new Date(accepted.getTime() + order.delivery.estimatedMinutes * 60000);
    const h = arrival.getHours();
    const m = arrival.getMinutes();
    return `${h}시 ${m > 0 ? `${String(m).padStart(2, '0')}분` : ''} 도착 예정`;
  };

  const DeliveryProgressBar = ({ step }: { step: number }) => {
    const pct = step <= 1 ? 33 : step === 2 ? 66 : 100;
    return (
      <div className="mt-2">
        <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-gray-500">
          <span className={step >= 1 ? 'text-indigo-700 font-medium' : ''}>결제완료</span>
          <span className={step >= 2 ? 'text-indigo-700 font-medium' : ''}>배달중</span>
          <span className={step >= 3 ? 'text-indigo-700 font-medium' : ''}>배달완료</span>
        </div>
      </div>
    );
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 pt-16 pb-24">
      {/* 상단 바 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="mx-auto w-full max-w-4xl h-14 flex items-center justify-between px-4">
          <button onClick={() => nav('/store/products')} className="text-sm text-gray-600 hover:text-gray-800">← 뒤로</button>
          <div className="font-bold text-gray-800">주문 내역</div>
          <div className="w-8" />
        </div>
      </header>

      {/* 필터 */}
      <section className="max-w-4xl mx-auto bg-white rounded-lg shadow p-4 mt-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500">상품 수령일</label>
            <input
              type="date"
              value={from}
              onChange={e => {
                setFrom(e.target.value);
                setFromTouched(true);
              }}
              className="mt-1 w-full h-10 border rounded px-2"
            />
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
              <option value="picked">수령 완료</option>
              <option value="canceled">예약 취소</option>
              <option value="no_show">노쇼</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => { setFrom(localToday); setStatus('all'); }}
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

      {/* 탭 */}
      <section className="max-w-4xl mx-auto mt-4">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setViewTab('reservation')}
            className={`h-9 px-4 rounded-md text-sm font-semibold ${viewTab === 'reservation' ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            예약
          </button>
          <button
            type="button"
            onClick={() => setViewTab('delivery')}
            className={`h-9 px-4 rounded-md text-sm font-semibold ${viewTab === 'delivery' ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            배달
          </button>
        </div>
      </section>

      {/* 데스크톱 */}
      <section className="max-w-4xl mx-auto mt-4 hidden sm:block">
        {loading && <div className="p-6 text-center text-gray-500">불러오는 중…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center text-gray-500">주문 내역이 없습니다.</div>
        )}
        {filtered.length > 0 && viewTab === 'reservation' && (
          <div className="space-y-3">
            {filtered.filter(o => !o.deliveryOrderCode).map(o => (
              <div
                key={o.id}
                className={`rounded-lg border-2 p-4 pt-3 shadow-sm ${(o.status === 'pending' && !isDeliveryLocked(o)) ? 'cursor-pointer' : ''}`}
                style={{
                  borderColor: 'var(--color-primary-500)',
                  backgroundColor: 'var(--color-primary-50)',
                }}
                onClick={() => openReservationCancel(o)}
                role={(o.status === 'pending' && !isDeliveryLocked(o)) ? 'button' : undefined}
                aria-label={(o.status === 'pending' && !isDeliveryLocked(o)) ? '상태 변경' : undefined}
              >
                <div className="flex items-center justify-between text-sm font-semibold mb-1" style={{ color: 'var(--color-primary-900)' }}>
                  <span>#{shortCode(o.displayCode)}</span>
                  {renderReservationStatusBadge(o)}
                </div>
                {getDeliveryProgressLabel(o) && (
                  <div className="mt-1">
                    <span className="inline-flex items-center h-6 px-2 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {getDeliveryProgressLabel(o)}
                    </span>
                    <DeliveryProgressBar step={getDeliveryProgressStep(o)} />
                  </div>
                )}
                <div className="mt-1 space-y-3">
                  {o.items.map(it => (
                    <div key={it.id} className="flex gap-3 text-sm text-gray-800">
                      {it.imageUrl ? (
                        <img src={it.imageUrl} alt={it.name} className="w-10 h-10 rounded object-cover border" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 border" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span>{it.name}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">x {it.quantity}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-sm font-semibold" style={{ color: 'var(--color-primary-900)' }}>
                  {KRW(totalPrice(o))}
                </div>
              </div>
            ))}
          </div>
        )}
        {filtered.length > 0 && viewTab === 'delivery' && (
          <div className="space-y-3">
            {groupedOrders.filter(g => g.deliveryOrderCode).map(group => (
              <div
                key={group.key}
                className="rounded-lg border-2 p-4 shadow-sm cursor-pointer"
                style={{
                  borderColor: 'var(--color-primary-500)',
                  backgroundColor: 'var(--color-primary-50)',
                }}
                onClick={() => setDeliveryDialog({ isOpen: true, groupKey: group.key })}
                role="button"
                aria-label="배달 주문 상세 보기"
              >
                <div className="flex items-center justify-between text-sm font-semibold mb-1" style={{ color: 'var(--color-primary-900)' }}>
                  <span>#{shortCode(group.deliveryOrderCode)}</span>
                  {renderDeliveryStatusBadge(group.orders)}
                </div>
                {(() => {
                  const step = getDeliveryProgressStep(group.orders[0]);
                  return step > 0 ? <DeliveryProgressBar step={step} /> : null;
                })()}
                {(() => {
                  const label = getEstimatedArrivalLabel(group.orders[0]);
                  return label ? (
                    <div className="mt-1 text-xs text-indigo-600 font-medium">{label}</div>
                  ) : null;
                })()}
                <div className="mt-3 space-y-3">
                  {getGroupItemTotals(group.orders).map(item => (
                    <div key={`${group.key}-${item.name}`} className="flex gap-3 text-base text-gray-800">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded object-cover border" />
                      ) : (
                        <div className="w-14 h-14 rounded bg-gray-100 border" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{trimItemName(item.name)}</span>
                          <span className="text-gray-700 font-semibold">{KRW(item.total)}</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-500">x {item.quantity}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-right text-sm" style={{ color: 'var(--color-primary-800)' }}>
                  배달비 {KRW(Number(group.orders[0]?.delivery?.deliveryFee ?? 0))}
                </div>
                <div className="text-right text-base font-bold" style={{ color: 'var(--color-primary-900)' }}>
                  {KRW(getGroupTotal(group.orders, true))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 모바일 카드 */}
      <section className="max-w-4xl mx-auto sm:hidden">
        {loading && <div className="bg-white rounded-lg shadow p-6 mt-4 text-center text-gray-500">불러오는 중…</div>}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 mt-4 text-center text-gray-500">주문 내역이 없습니다.</div>
        )}
        <div className="space-y-3 mt-4">
          {viewTab === 'reservation' && filtered.filter(o => !o.deliveryOrderCode).map(o => (
            <div
              key={o.id}
              className={`rounded-lg border-2 p-4 pt-3 shadow-sm ${(o.status === 'pending' && !isDeliveryLocked(o)) ? 'cursor-pointer' : ''}`}
              style={{
                borderColor: 'var(--color-primary-500)',
                backgroundColor: 'var(--color-primary-50)',
              }}
              onClick={() => openReservationCancel(o)}
              role={(o.status === 'pending' && !isDeliveryLocked(o)) ? 'button' : undefined}
              aria-label={(o.status === 'pending' && !isDeliveryLocked(o)) ? '상태 변경' : undefined}
            >
              <div className="flex items-center justify-between text-sm font-semibold mb-1" style={{ color: 'var(--color-primary-900)' }}>
                <span>#{shortCode(o.displayCode)}</span>
                {renderReservationStatusBadge(o)}
              </div>
              {getDeliveryProgressLabel(o) && (
                <div className="mt-1">
                  <span className="inline-flex items-center h-6 px-2 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {getDeliveryProgressLabel(o)}
                  </span>
                  <DeliveryProgressBar step={getDeliveryProgressStep(o)} />
                </div>
              )}
              <div className="mt-1 space-y-3">
                {o.items.map(it => (
                  <div key={it.id} className="flex gap-3 text-sm text-gray-800">
                    {it.imageUrl ? (
                      <img src={it.imageUrl} alt={it.name} className="w-10 h-10 rounded object-cover border" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 border" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span>{it.name}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">x {it.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right text-sm font-semibold" style={{ color: 'var(--color-primary-900)' }}>
                {KRW(totalPrice(o))}
              </div>
            </div>
          ))}
          {viewTab === 'delivery' && groupedOrders.filter(g => g.deliveryOrderCode).map(group => (
            <div
              key={group.key}
              className="rounded-lg border-2 p-5 shadow-sm cursor-pointer"
              style={{
                borderColor: 'var(--color-primary-500)',
                backgroundColor: 'var(--color-primary-50)',
              }}
              onClick={() => setDeliveryDialog({ isOpen: true, groupKey: group.key })}
              role="button"
              aria-label="배달 주문 상세 보기"
            >
              <div className="flex items-center justify-between text-sm font-semibold mb-1" style={{ color: 'var(--color-primary-900)' }}>
                <span>#{shortCode(group.deliveryOrderCode)}</span>
                {renderDeliveryStatusBadge(group.orders)}
              </div>
              {(() => {
                const step = getDeliveryProgressStep(group.orders[0]);
                return step > 0 ? <DeliveryProgressBar step={step} /> : null;
              })()}
              {(() => {
                const label = getEstimatedArrivalLabel(group.orders[0]);
                return label ? (
                  <div className="mt-1 text-sm text-indigo-600 font-medium">{label}</div>
                ) : null;
              })()}
              <div className="mt-3 space-y-3">
                {getGroupItemTotals(group.orders).map(item => (
                  <div key={`${group.key}-${item.name}`} className="flex gap-3 text-base text-gray-800">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded object-cover border" />
                    ) : (
                      <div className="w-14 h-14 rounded bg-gray-100 border" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{trimItemName(item.name)}</span>
                        <span className="text-gray-700 font-semibold">{KRW(item.total)}</span>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">x {item.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-right text-sm" style={{ color: 'var(--color-primary-800)' }}>
                배달비 {KRW(Number(group.orders[0]?.delivery?.deliveryFee ?? 0))}
              </div>
              <div className="text-right text-base font-bold" style={{ color: 'var(--color-primary-900)' }}>
                {KRW(getGroupTotal(group.orders, true))}
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">예약 취소</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{statusDialog.productName}"</span>
              주문을 취소하시겠습니까?
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
            <div className="flex gap-3">
              <button
                onClick={() => {
                  handleStatusChange();
                }}
                className="flex-1 h-10 rounded bg-red-500 hover:bg-red-600 text-white font-medium"
              >
                예약 취소
              </button>
              <button
                onClick={() => setStatusDialog({ isOpen: false, orderId: 0, displayCode: '', productName: '', currentStatus: 'pending', newStatus: 'canceled', quantity: 0 })}
                className="flex-1 h-10 rounded bg-gray-500 hover:bg-gray-600 text-white"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 배달 주문 상세 Dialog */}
      {deliveryDialog.isOpen && selectedDeliveryGroup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeliveryDialog({ isOpen: false, groupKey: '' })}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">배달 주문 상세</h3>
              <button
                type="button"
                className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
                aria-label="닫기"
                onClick={() => setDeliveryDialog({ isOpen: false, groupKey: '' })}
              >
                ✕
              </button>
            </div>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--color-primary-900)' }}>
              #{shortCode(selectedDeliveryGroup.deliveryOrderCode)}
            </div>
            <div className="space-y-3">
              {getGroupItemTotals(selectedDeliveryGroup.orders).map(item => (
                <div key={`${selectedDeliveryGroup.key}-detail-${item.name}`} className="flex items-center gap-3 text-sm">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover border" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-gray-100 border" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-800">{item.name}</span>
                      <span className="text-gray-700">{KRW(item.total)}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">x {item.quantity}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-right text-xs text-gray-600">
              배달비 {KRW(Number(selectedDeliveryGroup.orders[0]?.delivery?.deliveryFee ?? 0))}
            </div>
            <div className="text-right text-sm font-semibold text-gray-900">
              {KRW(getGroupTotal(selectedDeliveryGroup.orders, true))}
            </div>
          </div>
        </div>
      )}

      <BottomNav />

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
                        setFrom(localToday);
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
    </main>
  );
}
