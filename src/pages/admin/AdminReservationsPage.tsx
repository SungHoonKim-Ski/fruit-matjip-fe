// src/pages/admin/AdminReservationsPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { listReservations } from '../../mocks/reservations';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { updateReservationStatus, getAdminReservations, warnReservation } from '../../utils/api';
import AdminHeader from '../../components/AdminHeader';

type ReservationRow = {
  id: number;
  date: string;        // YYYY-MM-DD
  productName: string;
  buyerName: string;
  quantity: number;
  amount: number;
  status: 'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled'; // 대기 / 셀프수령준비완료 / 완료 / 셀프수령 / 취소됨
  createdAt: string;   // YYYY-MM-DD HH:MM:SS
 };

const formatKRW = (n: number) =>
  n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const getStatusText = (status: 'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled') => {
  switch (status) {
    case 'pending': return '수령 대기';
    case 'self_pick_ready': return '셀프 수령 준비 완료';
    case 'picked': return '수령 완료';
    case 'self_pick': return '셀프 수령';
    case 'canceled': return '예약 취소';
    default: return '알 수 없음';
  }
};

type SortField = 'date' | 'productName' | 'buyerName' | 'quantity' | 'amount' | 'status' | 'createdAt';

export default function AdminReservationsPage() {

  const { show } = useSnackbar();
  
  // 오늘 날짜를 기본값으로 설정 (KST 기준 YYYY-MM-DD)
  const today = (() => {
    const now = new Date();
    // 브라우저가 이미 KST 시간대를 인식하고 있으므로 현재 시간을 그대로 사용
    const kstNow = now;
    return kstNow.toISOString().split('T')[0];
  })();
  
  // 필터 (기본값)
  const [selectedDate, setSelectedDate] = useState(today);
  const [field, setField] = useState<'buyerName' | 'productName'>('buyerName'); // 기본값을 이름으로 변경
  const [term, setTerm]   = useState('');
  const [pickupFilter, setPickupFilter] = useState<'all' | 'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled'>('all'); // 기본값을 전체로 변경
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 데이터 & 변경 상태 - mock 데이터를 현재 날짜 기준으로 동적 생성
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmNext, setConfirmNext] = useState<'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled' | null>(null);
  const [confirmProductName, setConfirmProductName] = useState<string>('');
  const [confirmBuyerName, setConfirmBuyerName] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const [warningId, setWarningId] = useState<number | null>(null); // 경고 처리 중인 예약 ID
  const [warningDialog, setWarningDialog] = useState<{ isOpen: boolean; id: number; productName: string; buyerName: string; quantity: number }>({ isOpen: false, id: 0, productName: '', buyerName: '', quantity: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // 모바일 메뉴 상태

  // 예약 데이터 로드: 캘린더 값 변경 시 API 호출
  useEffect(() => {
    const loadReservations = async () => {
      if (USE_MOCKS) {
        const data = await listReservations(selectedDate);
        setRows(data.map((r, index) => ({ 
          ...r, 
          // 테스트를 위해 다양한 상태를 가진 데이터 생성
          status: (() => {
            const statuses: Array<'pending' | 'self_pick_ready' | 'self_pick' | 'picked' | 'canceled'> = [
              'pending', 'self_pick_ready', 'self_pick', 'picked', 'canceled'
            ];
            return statuses[index % statuses.length];
          })(),
          createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ') // 현재 시간을 기본값으로 설정
        })));
      } else {
        try {
          const response = await getAdminReservations(selectedDate);
          if (!response.ok) {
            // 401, 403 에러는 통합 에러 처리로 위임
            if (response.status === 401 || response.status === 403) {
              return; // adminFetch에서 이미 처리됨
            }
            
            const errorData = await response.json();
            throw new Error(errorData.message || '예약 목록을 불러오지 못했습니다.');
          }
          
          const data = await response.json();
          
          // ReservationListResponse 구조에서 response 필드 추출
          let reservationsArray = data;
          if (data && typeof data === 'object' && data.response && Array.isArray(data.response)) {
            reservationsArray = data.response;
          }
          
          if (!Array.isArray(reservationsArray)) {
            throw new Error('예약 데이터가 배열 형태가 아닙니다.');
          }
          
          // ReservationResponse를 ReservationRow로 변환 (snake_case 응답 대응)
          const reservationRows = reservationsArray.map((r: any, idx: number) => {
            const qty = Number(r.quantity ?? 0);
            const unit = Number(r.price ?? 0);
            const amt = Number(r.amount ?? (unit * qty));
            const rawStatus = String(r.status ?? '').toUpperCase();
            const mapped: 'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled' = 
              rawStatus === 'PICKED' ? 'picked' : 
              rawStatus === 'CANCELED' ? 'canceled' : 
              rawStatus === 'SELF_PICK' ? 'self_pick' : 
              rawStatus === 'SELF_PICK_READY' ? 'self_pick_ready' : 'pending';
            
            // createdAt 처리
            let createdAt = '';
            if (r.created_at) {
              const date = new Date(r.created_at);
              createdAt = date.toISOString().slice(0, 19).replace('T', ' ');
            } else {
              createdAt = new Date().toISOString().slice(0, 19).replace('T', ' '); // 기본값
            }
            
            return {
              id: r.id ?? idx,
              date: r.order_date ?? r.orderDate ?? '',
              productName: r.product_name ?? r.productName ?? '',
              buyerName: r.user_name ?? r.userName ?? '',
              quantity: qty || 0,
              amount: amt || 0,
              status: mapped,
              createdAt: createdAt,
            } as ReservationRow;
          });
          
          setRows(reservationRows);
        } catch (e: any) {
          safeErrorLog(e, 'AdminReservationsPage - loadReservations');
          show(getSafeErrorMessage(e, '예약 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
        }
      }
    };
    loadReservations();
  }, [selectedDate, show]);

  const filtered = useMemo(() => {
    const v = term.trim();

    const list = rows.filter(row => {
      const dateMatch = selectedDate === 'all' || row.date === selectedDate;
      const fieldHit = !v || 
        row.productName.toLowerCase().includes(v.toLowerCase()) ||
        row.buyerName.toLowerCase().includes(v.toLowerCase());
      
      // 수령 여부 필터 처리
      let pickupHit: boolean;
      if (pickupFilter === 'all') {
        // 기본값일 때는 취소된 항목 제외
        pickupHit = row.status !== 'canceled';
      } else {
        // 특정 필터 선택 시 해당 상태만 표시
        pickupHit = row.status === pickupFilter;
      }

      return dateMatch && fieldHit && pickupHit;
    });

    // 초기 상태: 정렬 적용 없이 서버 순서 유지
    if (!sortField) return list;

    // 정렬
    // 상태 정렬: 오름차순 ⇒ 대기(0) < 셀프수령준비완료(1) < 셀프수령(2) < 완료(3) < 취소(4)
    const statusOrder: Record<ReservationRow['status'], number> = { pending: 0, self_pick_ready: 1, self_pick: 2, picked: 3, canceled: 4 };
    const cmpCore = (a: ReservationRow, b: ReservationRow) => {
      switch (sortField) {
        case 'date':
          return a.date.localeCompare(b.date);
        case 'productName':
          return a.productName.localeCompare(b.productName, 'ko');
        case 'buyerName':
          return a.buyerName.localeCompare(b.buyerName, 'ko');
        case 'quantity':
          return a.quantity - b.quantity;
        case 'amount':
          return a.amount - b.amount;
        case 'status':
          return statusOrder[a.status] - statusOrder[b.status];
        case 'createdAt':
          return a.createdAt.localeCompare(b.createdAt);
        default:
          return 0;
      }
    };

    return list.sort((a, b) => {
      let cmp = cmpCore(a, b);
      if (sortOrder === 'desc') cmp = -cmp; // 내림차순 시 반전 → 완료가 상단
      return cmp;
    });
  }, [rows, selectedDate, term, field, pickupFilter, sortField, sortOrder]);

  // 드롭다운으로 상태 변경
  const updateRowStatus = (id: number, next: 'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled') => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, status: next } : r)));
  };

  // 변경 확인 다이얼로그
  const openConfirmChange = (id: number, current: 'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled') => {
    const target = rows.find(r => r.id === id);
    setConfirmId(id);
    setConfirmNext(current); // 기본값을 기존 상태로 설정
    setConfirmProductName(target?.productName || '');
    setConfirmBuyerName(target?.buyerName || '');
  };
  const closeConfirm = () => { 
    setConfirmId(null); 
    setConfirmNext(null); 
    setConfirmProductName(''); 
    setConfirmBuyerName(''); 
  };
  const applyConfirm = async () => {
    if (confirmId == null || confirmNext == null) return;
    try {
      setApplying(true);
      const target = rows.find(r => r.id === confirmId);
      const productName = target ? target.productName : '';
      const buyerName = target ? target.buyerName : '';
      const currentStatus = target ? target.status : 'pending';
      
      // 기존 상태와 동일한 경우 API 호출하지 않음
      if (confirmNext === currentStatus) {
        show(`${buyerName}님의 예약 상품은 이미 ${getStatusText(currentStatus)} 상태입니다.`, { variant: 'info' });
        closeConfirm();
        return;
      }
      
      // 서버 반영
      if (!USE_MOCKS) {
        try {
          await updateReservationStatus(confirmId, confirmNext);
        } catch (e) {
          safeErrorLog(e, 'AdminReservationsPage - updateReservationStatus');
          show(getSafeErrorMessage(e, '상태 변경에 실패했습니다.'), { variant: 'error' });
          return;
        }
      }
      // 로컬 갱신
      updateRowStatus(confirmId, confirmNext);
      if (confirmNext === 'picked') {
        show(`${buyerName}님의 예약 상품이 수령 완료로 변경되었습니다.`);
      } else if (confirmNext === 'self_pick') {
        show(`${buyerName}님의 예약 상품이 셀프 수령으로 변경되었습니다.`, { variant: 'info' });
      } else if (confirmNext === 'self_pick_ready') {
        show(`${buyerName}님의 예약 상품이 셀프 수령 준비 완료로 변경되었습니다.`, { variant: 'info' });
      } else if (confirmNext === 'canceled') {
        show(`${buyerName}님의 예약 상품이 예약 취소로 변경되었습니다.`, { variant: 'info' });
      } else {
        show(`${buyerName}님의 예약 상품이 수령 대기로 변경되었습니다.`, { variant: 'info' });
      }
      closeConfirm();
    } finally {
      setApplying(false);
    }
  };

  // 노쇼 경고 다이얼로그 열기
  const openWarningDialog = (id: number) => {
    const target = rows.find(r => r.id === id);
    if (target) {
      setWarningDialog({
        isOpen: true,
        id: target.id,
        productName: target.productName,
        buyerName: target.buyerName,
        quantity: target.quantity
      });
    }
  };

  // 노쇼 경고 다이얼로그 닫기
  const closeWarningDialog = () => {
    setWarningDialog({ isOpen: false, id: 0, productName: '', buyerName: '', quantity: 0 });
  };

  // 노쇼 경고 처리
  const handleWarning = async () => {
    if (!warningDialog.isOpen) return;
    
    try {
      setWarningId(warningDialog.id);
      
      if (!USE_MOCKS) {
        await warnReservation(warningDialog.id);
      }
      
      show(`${warningDialog.buyerName}님에게 노쇼 경고가 등록되었습니다.`, { variant: 'info' });
      closeWarningDialog();
    } catch (e: any) {
      safeErrorLog(e, 'AdminReservationsPage - handleWarning');
      show(getSafeErrorMessage(e, '경고 등록에 실패했습니다.'), { variant: 'error' });
    } finally {
      setWarningId(null);
    }
  };

  return (
  <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 pb-24">
    <div className="max-w-4xl mx-auto flex items-center justify-between mb-4">
      <h1 className="text-2xl font-bold text-gray-800">🧾 예약 확인</h1>
      
      {/* 데스크탑: AdminHeader / 모바일: 햄버거 */}
      <div className="relative">
        {/* 데스크탑: AdminHeader */}
        <div className="hidden md:block">
          <AdminHeader />
        </div>
        
        {/* 모바일: 햄버거 버튼 */}
        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded bg-white border border-gray-300 shadow-sm hover:shadow active:scale-[0.98]"
          aria-haspopup="menu"
          aria-expanded={mobileMenuOpen}
          aria-label="관리 메뉴"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          ☰
        </button>
        
        {/* 모바일 드롭다운 메뉴 */}
        {mobileMenuOpen && (
          <div className="absolute right-0 mt-2 w-44 rounded-lg border bg-white shadow-lg overflow-hidden z-50 md:hidden">
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => { 
                setMobileMenuOpen(false); 
                if (window.location.pathname !== '/admin/products') {
                  window.location.href = '/admin/products';
                }
              }}
            >
              📦 상품 관리
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => { 
                setMobileMenuOpen(false); 
                if (window.location.pathname !== '/admin/products/new') {
                  window.location.href = '/admin/products/new';
                }
              }}
            >
              ➕ 상품 등록
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => { 
                setMobileMenuOpen(false); 
                if (window.location.pathname !== '/admin/sales') {
                  window.location.href = '/admin/sales';
                }
              }}
            >
              📈 판매량 확인
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => { 
                setMobileMenuOpen(false); 
                if (window.location.pathname !== '/admin/reservations') {
                  window.location.href = '/admin/reservations';
                }
              }}
            >
              🧾 예약 확인
            </button>
          </div>
        )}
      </div>
    </div>

      {/* 필터 */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500">조회 날짜 <span className="text-red-500">*</span></label>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
              className="mt-1 w-full h-10 border rounded px-2" 
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">검색 필터 <span className="text-red-500">*</span></label>
            <select
              value={field}
              onChange={e=>setField(e.target.value as any)}
              required
              className="mt-1 w-full h-10 border rounded px-2"
            >
              <option value="productName">상품명</option>
              <option value="buyerName">닉네임</option>
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
            <label className="text-xs text-gray-500">수령 여부 <span className="text-red-500">*</span></label>
            <select
              value={pickupFilter}
              onChange={e=>setPickupFilter(e.target.value as any)}
              className="mt-1 w-full h-10 border rounded px-2"
            >
              <option value="all">전체</option>
              <option value="pending">수령 대기</option>
              <option value="self_pick_ready">셀프 수령 준비 완료</option>
              <option value="self_pick">셀프 수령</option>
              <option value="picked">수령 완료</option>
              <option value="canceled">예약 취소</option>
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
                {([
                  { key: 'date', label: '수령일', width: 'w-40' },
                  { key: 'productName', label: '상품명', width: 'w-40' },
                  { key: 'buyerName', label: '이름', width: 'w-20' },
                  { key: 'quantity', label: '수량', width: 'w-20' },
                  { key: 'amount', label: '금액', width: 'w-24' },
                  { key: 'createdAt', label: '주문시간', width: 'w-32' },
                  { key: 'warn', label: '경고', width: 'w-20' },
                  { key: 'status', label: '수령 여부', width: 'w-40' },
                ] as { key: SortField | 'warn'; label: string; width: string }[]).map(col => (
                  <th key={col.key} className={`px-2 py-3 align-middle ${col.width} text-center`}>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-gray-700 font-medium">{col.label}</span>
                      {col.key !== 'warn' && col.key !== 'date' && col.key !== 'createdAt' && col.key !== 'status' && (
                        <button
                          type="button"
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            sortField === col.key
                              ? sortOrder === 'asc'
                                ? 'bg-orange-100 text-orange-700 border border-orange-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (sortField !== col.key) {
                              // 첫 번째 클릭: 오름차순
                              setSortField(col.key as SortField);
                              setSortOrder('asc');
                            } else if (sortOrder === 'asc') {
                              // 두 번째 클릭: 내림차순
                              setSortOrder('desc');
                            } else {
                              // 세 번째 클릭: 정렬해제
                              setSortField(null);
                            }
                          }}
                          aria-label={`${col.label} 정렬`}
                          title={`${col.label} 정렬 (클릭: 오름차순 → 내림차순 → 정렬해제)`}
                        >
                          {sortField === col.key ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  className="border-t text-sm hover:bg-orange-50 cursor-pointer"
                  onClick={() => openConfirmChange(r.id, r.status)}
                >
                  <td className="px-2 py-3 align-middle w-24 text-center">{r.date}</td>
                  <td className="px-2 py-3 align-middle w-32">{r.productName}</td>
                  <td className="px-2 py-3 align-middle w-20">{r.buyerName}</td>
                  <td className="px-2 py-3 align-middle w-16">{r.quantity.toLocaleString()}개</td>
                  <td className="px-2 py-3 font-medium align-middle w-20">{formatKRW(r.amount)}</td>
                  <td className="px-2 py-3 align-middle w-32 text-center">{r.createdAt}</td>
                  <td className="px-2 py-3 align-middle w-16 text-center" onClick={(e) => e.stopPropagation()}>
                                      {/* 노쇼 경고 버튼 - 셀프 수령 및 셀프 수령 준비 완료 상태일 때 표시 */}
                  {(r.status === 'self_pick' || r.status === 'self_pick_ready') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openWarningDialog(r.id);
                      }}
                      disabled={warningId === r.id}
                      className="inline-flex items-center justify-center h-9 w-9 rounded-full border-2 border-orange-300 bg-orange-50 text-orange-600 hover:bg-orange-100 hover:border-orange-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="노쇼 경고 등록"
                    >
                      {warningId === r.id ? (
                        <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <span className="text-sm font-bold">!</span>
                      )}
                    </button>
                  )}
                  </td>
                  <td className="px-2 py-3 align-middle w-24" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openConfirmChange(r.id, r.status)}
                      className={
                        'inline-flex items-center h-9 px-3 rounded-full border text-xs font-medium transition ' +
                        (r.status === 'picked'
                          ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          : r.status === 'self_pick'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            : r.status === 'self_pick_ready'
                              ? 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100'
                            : r.status === 'canceled'
                              ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                              : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100')
                      }
                      aria-pressed={r.status === 'picked'}
                    >
                      {r.status === 'picked' ? '수령 완료' : r.status === 'self_pick' ? '셀프 수령' : r.status === 'self_pick_ready' ? (
                        <>
                          셀프 수령<br />
                          준비 완료
                        </>
                      ) : r.status === 'canceled' ? '취소됨' : '수령 대기'}
                    </button>

                    {/* 접근성용 select (시각적으로 숨김) */}
                    <label className="sr-only" htmlFor={`pickup-${r.id}`}>수령 여부<span className="text-red-500">*</span></label>
                    <select
                      id={`pickup-${r.id}`}
                      value={r.status}
                      onChange={(e) => updateRowStatus(r.id, e.target.value as 'pending'|'self_pick_ready'|'picked'|'self_pick'|'canceled')}
                      className="sr-only"
                      aria-hidden="true"
                      tabIndex={-1}
                    >
                      <option value="pending">수령 대기</option>
                      <option value="self_pick_ready">셀프 수령 준비 완료</option>
                      <option value="self_pick">셀프 수령</option>
                      <option value="picked">수령 완료</option>
                      <option value="canceled">예약 취소</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="sm:hidden divide-y">
          {/* 모바일: 가로 스크롤 정렬 칩 (일자 제외) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-3 py-2 text-xs text-gray-600">
            {([
              { key: 'productName', label: '상품명' },
              { key: 'buyerName', label: '이름' },
              { key: 'quantity', label: '수량' },
              { key: 'amount', label: '금액' },
              { key: 'status', label: '수령여부' },
            ] as { key: SortField; label: string }[]).map(col => (
              <div
                key={col.key}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 shadow-sm whitespace-nowrap ${
                  sortField === col.key
                    ? (sortOrder === 'desc'
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-orange-400 bg-orange-50 text-orange-700')
                    : 'border-gray-200 bg-white'
                } cursor-pointer select-none`}
                onClick={() => {
                  if (sortField !== col.key) {
                    setSortField(col.key);
                    setSortOrder('asc');
                  } else if (sortOrder === 'asc') {
                    setSortOrder('desc');
                  } else {
                    setSortField(null);
                  }
                }}
              >
                <span>{col.label}</span>
                <div className="flex ml-1 items-center gap-1">
                  <button
                    type="button"
                    className={`leading-none ${sortField === col.key && sortOrder === 'asc' ? 'text-orange-600' : 'text-gray-400'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sortField === col.key && sortOrder === 'asc') {
                        setSortField(null);
                      } else {
                        setSortField(col.key);
                        setSortOrder('asc');
                      }
                    }}
                    aria-label={`${col.label} 오름차순`}
                  >▲</button>
                  <button
                    type="button"
                    className={`leading-none ${sortField === col.key && sortOrder === 'desc' ? 'text-blue-600' : 'text-gray-400'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sortField === col.key && sortOrder === 'desc') {
                        setSortField(null);
                      } else {
                        setSortField(col.key);
                        setSortOrder('desc');
                      }
                    }}
                    aria-label={`${col.label} 내림차순`}
                  >▼</button>
                </div>
              </div>
            ))}
          </div>
          {filtered.map(r => (
              <div
                key={r.id}
                className="p-4 active:bg-orange-50"
                onClick={() => openConfirmChange(r.id, r.status)}
              >
              {/* 상단: 상품명 + 경고 / 금액 */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-1 flex-1 min-w-0">
                  <div className="font-medium text-[15px] text-gray-900 break-words min-w-0">
                    <span className="line-clamp-2 break-words">{r.productName}</span>
                  </div>
                  {/* 노쇼 경고 버튼 - 셀프 수령 및 셀프 수령 준비 완료 상태일 때 표시 */}
                  {(r.status === 'self_pick' || r.status === 'self_pick_ready') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openWarningDialog(r.id);
                      }}
                      disabled={warningId === r.id}
                      className="inline-flex items-center justify-center h-6 w-6 rounded-full border-2 border-orange-300 bg-orange-50 text-orange-600 hover:bg-orange-100 hover:border-orange-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                      title="노쇼 경고 등록"
                    >
                      {warningId === r.id ? (
                        <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <span className="text-xs font-bold">!</span>
                      )}
                    </button>
                  )}
                </div>
                <div className="text-right flex-shrink-0 text-[15px] font-semibold text-orange-600">{formatKRW(r.amount)}</div>
              </div>
              {/* 하단 메타: 날짜 · 닉네임 · 수량 + 수령여부 */}
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-gray-500 flex items-center gap-2 min-w-0">
                  <span className="whitespace-nowrap">{r.date}</span>
                  <span className="truncate">{r.buyerName}</span>
                  <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] text-gray-700 bg-gray-50">{r.quantity}개</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openConfirmChange(r.id, r.status); }}
                  className={
                    'inline-flex items-center h-8 px-3 rounded-full border text-xs font-medium transition ' +
                    (r.status === 'picked'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : r.status === 'self_pick'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : r.status === 'self_pick_ready'
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                      : r.status === 'canceled'
                        ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                        : 'bg-gray-50 text-gray-700 border-gray-200')
                  }
                >
                  {r.status === 'picked' ? '수령 완료' : r.status === 'self_pick' ? '셀프 수령' : r.status === 'self_pick_ready' ? (
                    <>
                      셀프 수령<br />
                      준비 완료
                    </>
                  ) : r.status === 'canceled' ? '예약 취소' : '수령 대기'}
                </button>
              </div>
              {/* 생성일시: 제품명 밑 왼쪽에 표시 */}
              <div className="mt-1 text-xs text-gray-400">주문시간: {r.createdAt}</div>
            </div>
          ))}
        </div>
      </div>

      {confirmId !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeConfirm} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl border p-5">
            <h2 className="text-base font-semibold text-gray-800">상태를 변경할까요?</h2>
            <p className="text-sm text-gray-600 mt-2">
              <span className="font-medium">"{confirmBuyerName}"</span>님이 주문하신 
              <span className="font-medium"> "{confirmProductName}"</span> 상품의 상태를 변경합니다.
            </p>
            
            {/* 상태 선택 옵션 */}
            <div className="mt-4 space-y-3">
              <p className="text-xs text-gray-500">변경할 상태를 선택하세요:</p>
              
              <div className="space-y-2">
                {/* 첫 번째 줄: 수령 대기 | 예약 취소 */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmNext('pending')}
                    className={`h-10 px-3 rounded border text-sm font-medium transition ${
                      confirmNext === 'pending'
                        ? 'bg-gray-100 border-gray-300 text-gray-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                    disabled={applying}
                  >
                    수령 대기
                  </button>
                  <button
                    onClick={() => setConfirmNext('canceled')}
                    className={`h-10 px-3 rounded border text-sm font-medium transition ${
                      confirmNext === 'canceled'
                        ? 'bg-red-100 border-red-300 text-red-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                    disabled={applying}
                  >
                    예약 취소
                  </button>
                </div>

                {/* 두 번째 줄: 셀프 수령 | 셀프 수령 준비 완료 */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmNext('self_pick')}
                    className={`h-10 px-3 rounded border text-sm font-medium transition ${
                      confirmNext === 'self_pick'
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                    disabled={applying}
                  >
                    셀프 수령
                  </button>
                  <button
                    onClick={() => setConfirmNext('self_pick_ready')}
                    className={`h-10 px-3 rounded border text-sm font-medium transition ${
                      confirmNext === 'self_pick_ready'
                        ? 'bg-yellow-100 border-yellow-300 text-yellow-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                    disabled={applying}
                  >
                    셀프 수령 준비 완료
                  </button>
                </div>

                {/* 세 번째 줄: 수령 완료 */}
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setConfirmNext('picked')}
                    className={`h-10 px-3 rounded border text-sm font-medium transition ${
                      confirmNext === 'picked'
                        ? 'bg-green-100 border-green-300 text-green-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                    disabled={applying}
                  >
                    수령 완료
                  </button>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={closeConfirm}
                className="h-10 px-4 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
                disabled={applying}
                type="button"
              >
                취소
              </button>
              <button
                onClick={applyConfirm}
                disabled={applying || !confirmNext}
                className={`h-10 px-4 rounded text-white font-medium ${
                  !confirmNext || applying ? 'bg-gray-400' : 'bg-orange-500 hover:bg-orange-600'
                }`}
                type="button"
              >
                {applying ? '처리 중…' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 노쇼 경고 확인 다이얼로그 */}
      {warningDialog.isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeWarningDialog} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl border p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-orange-600 text-xl font-bold">!</span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">노쇼 경고 등록</h2>
                <p className="text-sm text-gray-500">이 예약한 고객에게 노쇼 경고를 등록하시겠습니까?</p>
              </div>
            </div>
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-800">
                <span className="font-medium">"{warningDialog.buyerName}"</span>님이 주문하신 
                <span className="font-medium"> "{warningDialog.productName} {warningDialog.quantity}개"</span>
              </p>
            </div>
            
            <div className="text-xs text-gray-600 mb-4">
              ⚠️ 경고 2회 누적 시 "{warningDialog.buyerName}" 고객은 <strong>당월 셀프 픽업이 불가능</strong>합니다.
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={closeWarningDialog}
                className="h-10 px-4 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
                disabled={warningId === warningDialog.id}
                type="button"
              >
                취소
              </button>
              <button
                onClick={handleWarning}
                disabled={warningId === warningDialog.id}
                className={`h-10 px-4 rounded text-white font-medium ${
                  warningId === warningDialog.id ? 'bg-gray-400' : 'bg-orange-500 hover:bg-orange-600'
                }`}
                type="button"
              >
                {warningId === warningDialog.id ? '처리 중…' : '경고 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
