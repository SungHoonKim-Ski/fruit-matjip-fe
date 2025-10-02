// src/pages/admin/AdminSalesPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { mockSales } from '../../mocks/sales';
import { USE_MOCKS } from '../../config';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getSalesSummary, getSalesDetails, getTodaySales } from '../../utils/api';
import AdminHeader from '../../components/AdminHeader';

const formatKRW = (n: number) => {
  // 100만원(7자리)까지 여유공간, 앞에 ₩ 표시, 오른쪽 패딩
  const raw = n.toLocaleString('ko-KR');
  // 7자리(예: 1,000,000) 기준, 부족하면 앞에 공백 추가
  const padded = raw.padStart(9, ' '); // 9: '1,000,000' + 여유
  return `₩${padded}`;
};

// 모바일 캘린더용 짧은 금액 표기 (만/억 단위)
const _trimDotZero = (s: string) => (s.endsWith('.0') ? s.slice(0, -2) : s);
const formatKRWShort = (n: number) => {
  if (!n) return '';
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${_trimDotZero((abs / 100_000_000).toFixed(1))}억`;
  if (abs >= 10_000) return `${_trimDotZero((abs / 10_000).toFixed(1))}만`;
  return abs.toLocaleString('ko-KR');
};

export default function AdminSalesPage() {
  const { show } = useSnackbar();
  // 이번 달의 시작/끝(KST 기준)
  const toKstYMD = (d: Date) => {
    const kstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000); // KST 기준으로 변환
    return kstDate.toISOString().split('T')[0];
  };
  const now = new Date();
  // 브라우저 로컬이 이미 KST이므로 추가 보정 없이 사용
  const kstNow = now;
  const monthStart = toKstYMD(new Date(kstNow.getFullYear(), kstNow.getMonth(), 1));
  const todayKst   = toKstYMD(kstNow);
  const kstYesterday = (() => { const d = new Date(kstNow); d.setDate(d.getDate() - 1); return toKstYMD(d); })();

  // ✅ 기본 범위: 이번 달 1일 ~ 어제(단, 매달 1일에는 1일~1일로 클램프)
  const defaultFrom = monthStart;
  const defaultTo = (kstNow.getDate() === 1) ? monthStart : kstYesterday;

  const [from, setFrom] = useState<string>(defaultFrom);
  const [to, setTo]     = useState<string>(defaultTo);
  const [monthValue, setMonthValue] = useState<string>(() => `${kstNow.getFullYear()}-${String(kstNow.getMonth()+1).padStart(2,'0')}`);
  const currentMonthStr = `${kstNow.getFullYear()}-${String(kstNow.getMonth()+1).padStart(2,'0')}`;

  const applyMonthRange = (val: string) => {
    const [yy, mm] = val.split('-').map(Number);
    const s = toKstYMD(new Date(yy, mm - 1, 1));
    const isCurrent = val === currentMonthStr;
    const eCandidate = isCurrent ? kstYesterday : toKstYMD(new Date(yy, mm, 0));
    const e = (new Date(eCandidate) < new Date(s)) ? s : eCandidate;
    setFrom(s); setTo(e);
  };

  // 🔎 필수 필드: 기본값 = 이름(buyerName)
  const [field, setField] = useState<'buyerName' | 'productName'>('productName');
  const [term, setTerm]   = useState('');

  type SalesRow = {
    id: number;
    productName: string;
    price: number;
    quantity: number;
    revenue: number;
    date?: string; // 내부 필터/로직용(표시 안 함)
  };

  const [rows, setRows] = useState<SalesRow[]>([]);
  const [summaryByDate, setSummaryByDate] = useState<Record<string, number>>({}); // YYYY-MM-DD -> revenue
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [monthTotalQty, setMonthTotalQty] = useState(0);
  const [monthTotalRev, setMonthTotalRev] = useState(0);

  // 요약 데이터 로드(집계 테이블) - 이번달 1일~어제 + 오늘 합쳐서
  const loadSummary = async (rangeFrom: string, rangeTo: string) => {
    setLoadingSummary(true);
    // 로컬 변수로 복사하여 정규화
    let fromYmd = rangeFrom;
    let toYmd = rangeTo;
  
    // 방어 로직: 잘못된 범위(from > to)일 경우 from으로 클램프
    if (new Date(fromYmd) > new Date(toYmd)) {
      toYmd = fromYmd;
    }
  
    // 현재 월 범위인지 확인
    const isCurrentMonthRange = (() => {
      const f = new Date(fromYmd);
      return f.getFullYear() === kstNow.getFullYear() && f.getMonth() === kstNow.getMonth();
    })();
  
    try {
      if (USE_MOCKS) {
        const map: Record<string, number> = {};
        mockSales.forEach((r) => { map[r.date] = (map[r.date] || 0) + r.revenue; });
        setSummaryByDate(map);
        const mockQty = mockSales.reduce((s, r) => s + Number(r.quantity ?? 0), 0);
        const mockRev = mockSales.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
        setMonthTotalQty(mockQty);
        setMonthTotalRev(mockRev);
        return;
      }
  
      // 1. 범위 요약 호출(1일에도 스킵하지 않음)
      const res1 = await getSalesSummary(fromYmd, toYmd);
      if (!res1.ok) {
        if (res1.status === 401 || res1.status === 403) return;
        const err = await res1.clone().json().catch(() => ({}));
        throw new Error(err.message || '매출 요약을 불러오지 못했습니다.');
      }
      const body1 = await res1.json();
      const list1 = Array.isArray(body1.summary) ? body1.summary : [];
  
      const map: Record<string, number> = {};
      let mQty = 0;
      let mRev = 0;
  
      // 이번달 1일~어제 데이터(집계 테이블)
      list1.forEach((r: any) => {
        const date = r.date || r.sell_date || r.sellDate || r.pickup_date || r.pickupDate || '';
        const qty = Number(r.quantity ?? r.sum_quantity ?? 0);
        const rev = Number(r.revenue ?? r.amount ?? r.sum_amount ?? 0);
        if (date) map[date] = (map[date] || 0) + rev;
        mQty += qty;
        mRev += rev;
      });
  
      // 🔁 폴백: 2일 이후인데 1일 요약이 비어있다면 상세로 보강
      if (
        isCurrentMonthRange &&
        kstNow.getDate() >= 2 &&
        fromYmd === monthStart &&
        toYmd === monthStart &&
        !map[monthStart]
      ) {
        try {
          const resD1 = await getSalesDetails(monthStart);
          if (resD1.ok) {
            const bodyD1 = await resD1.json();
            const listD1 = Array.isArray(bodyD1) ? bodyD1 : (bodyD1?.response || []);
            let qtySum = 0, revSum = 0;
            listD1.forEach((r: any) => {
              const qty = Number(r.quantity ?? 0);
              const rev = Number(r.revenue ?? r.amount ?? 0);
              qtySum += qty;
              revSum += rev;
            });
            if (revSum > 0) {
              map[monthStart] = (map[monthStart] || 0) + revSum;
              mQty += qtySum;
              mRev += revSum;
            }
          }
        } catch (e) {
          // 폴백 실패는 치명적이지 않음: 로그만
          safeErrorLog(e, 'AdminSalesPage - fallback details for 1st day');
        }
      }
  
      // 2. 오늘 데이터 (현재 월일 때만 추가)
      if (isCurrentMonthRange) {
        const todayStr = toKstYMD(kstNow);
        const res2 = await getTodaySales(todayStr);
        if (!res2.ok) {
          if (res2.status !== 401 && res2.status !== 403) {
            const err = await res2.clone().json().catch(() => ({}));
            throw new Error(err.message || '오늘 매출을 불러오지 못했습니다.');
          }
        } else {
          const body2 = await res2.json();
          const list2 = Array.isArray(body2) ? body2 : (body2?.response || []);
          list2.forEach((r: any) => {
            const date = r.date || r.pickup_date || r.pickupDate || todayStr;
            const qty = Number(r.quantity ?? 0);
            const rev = Number(r.revenue ?? r.amount ?? 0);
            if (date) map[date] = (map[date] || 0) + rev;
            mQty += qty;
            mRev += rev;
          });
        }
      }
  
      setSummaryByDate(map);
      setMonthTotalQty(mQty);
      setMonthTotalRev(mRev);
    } catch (e: any) {
      safeErrorLog(e, 'AdminSalesPage - loadSummary');
      show(getSafeErrorMessage(e, '매출 요약을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    setRows([]);
    setMonthTotalQty(0);
    setMonthTotalRev(0);
    loadSummary(from, to);
  }, [from, to, show]);

  // 페이지 진입 시 오늘 데이터도 함께 로드
  useEffect(() => {
    const loadInitialData = async () => {
      if (USE_MOCKS) return; // Mock은 기존 로직 사용
      
      try {
        const todayStr = toKstYMD(kstNow);
        
        // 오늘 데이터 미리 로드
        const res = await getTodaySales(todayStr);
        if (res.ok) {
          const body = await res.json();
          const list = Array.isArray(body) ? body : (body?.response || []);
          if (list.length > 0) {
            // 오늘 데이터가 있으면 기본 선택
            setSelectedDate(todayStr);
            loadDetailsForDate(todayStr);
          }
        }
      } catch (e) {
        // 오늘 데이터 로드 실패는 무시 (기존 월 데이터는 정상 로드됨)
        safeErrorLog(e, 'AdminSalesPage - loadInitialTodayData');
      }
    };

    loadInitialData();
  }, []); // 페이지 진입 시 한 번만 실행

  // 오늘 날짜를 기본 선택 (기존 로직 유지)
  useEffect(() => {
    if (!selectedDate && summaryByDate && Object.keys(summaryByDate).length > 0) {
      const todayStr = toKstYMD(kstNow);
      if (summaryByDate[todayStr]) {
        setSelectedDate(todayStr);
        loadDetailsForDate(todayStr);
      }
    }
  }, [summaryByDate, selectedDate]);

  // 검색은 상세 rows(선택 날짜)에만 적용; 월 단위 필드는 제거
  const filtered = useMemo(() => {
    const v = term.trim();
    if (!v) return rows;
    return rows.filter(r => (r.productName || '').includes(v));
  }, [term, rows]);

  const totalQty = monthTotalQty;
  const totalRev = monthTotalRev;

  // 선택 일 집계
  const selectedDayQty = useMemo(() => {
    if (!selectedDate) return 0;
    return rows.reduce((s, r) => s + Number(r.quantity || 0), 0);
  }, [rows, selectedDate]);
  const selectedDayRev = useMemo(() => {
    if (!selectedDate) return 0;
    return Number(summaryByDate[selectedDate] || 0);
  }, [selectedDate, summaryByDate]);

  // 선택일 MM/DD만 추출 (라벨 스타일링용)
  const selectedDayMD = useMemo(() => {
    if (!selectedDate) return null;
    const parts = selectedDate.split('-'); // 'YYYY-MM-DD'
    if (parts.length !== 3) return null;
    const mm = String(Number(parts[1] || '0'));
    const dd = String(Number(parts[2] || '0'));
    return `${mm}/${dd}`;
  }, [selectedDate]);

  // 캘린더 생성 (from 기준 월)
  const monthStartDate = useMemo(() => new Date(from), [from]);
  const year = monthStartDate.getFullYear();
  const month = monthStartDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = lastOfMonth.getDate();
  const displayMonthNum = useMemo(() => {
    const parts = (monthValue || '').split('-');
    const mm = parts.length > 1 ? Number(parts[1]) : (month + 1);
    return mm;
  }, [monthValue, month]);
  const calendarCells = useMemo(() => {
    const cells: Array<{ label: string; dateStr: string | null }> = [];
    for (let i = 0; i < startDay; i++) cells.push({ label: '', dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = toKstYMD(new Date(year, month, d)); // ✅ KST-safe YMD
      cells.push({ label: String(d), dateStr: ds });
    }
    while (cells.length % 7 !== 0) cells.push({ label: '', dateStr: null });
    return cells;
  }, [startDay, daysInMonth, year, month]);

  const loadDetailsForDate = async (dateStr: string) => {
    setSelectedDate(dateStr);
    setLoadingDetails(true);
    try {
      if (USE_MOCKS) {
        const mapped: SalesRow[] = mockSales
          .filter(r => r.date === dateStr)
          .map((r, idx) => ({
            id: r.id ?? idx,
            date: r.date,
            productName: r.productName,
            price: r.price,
            quantity: r.quantity,
            revenue: r.revenue,
          }));
        setRows(mapped);
        return;
      }
      const todayStr = toKstYMD(kstNow);
      if (dateStr === todayStr) {
        // 오늘이면 today API 사용
        const res = await getTodaySales(dateStr);
        if (!res.ok) {
          const err = await res.clone().json().catch(() => ({}));
          throw new Error(err.message || '오늘 상세 데이터를 불러오지 못했습니다.');
        }
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body?.response || []);
        // today API 응답: product_id, product_name, quantity, amount
        const mapped: SalesRow[] = list.map((r: any, idx: number) => {
          const qty = Number(r.quantity ?? 0);
          const amt = Number(r.amount ?? 0);
          // 단가 계산: 수량이 0이 아니면 amount/quantity, 아니면 0
          const unit = qty > 0 ? Math.floor(amt / qty) : 0;
          return {
            id: r.product_id ?? idx,
            date: dateStr,
            productName: r.product_name ?? '',
            price: unit,
            quantity: qty,
            revenue: amt,
          };
        });
        setRows(mapped);
        return;
      }
      // 과거는 기존 sales API 사용
      const res = await getSalesDetails(dateStr)
      if (!res.ok) {
        const err = await res.clone().json().catch(() => ({}));
        throw new Error(err.message || '상세 내역을 불러오지 못했습니다.');
      }
      const body = await res.json();
      const list = Array.isArray(body) ? body : (body?.response || []);
      const mapped: SalesRow[] = list.map((r: any, idx: number) => {
        const qty = Number(r.quantity ?? 0);
        const amt = Number(r.amount ?? 0);
        const unit = qty > 0 ? Math.floor(amt / qty) : Number(r.price ?? 0);
        return {
          id: r.id ?? idx,
          date: r.pickup_date ?? r.pickupDate ?? dateStr,
          productName: r.product_name ?? r.productName ?? '',
          price: unit,
          quantity: qty,
          revenue: amt,
        };
      });
      setRows(mapped);
    } catch (e: any) {
      safeErrorLog(e, 'AdminSalesPage - loadDetailsForDate');
      show(getSafeErrorMessage(e, '상세 데이터를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📈 판매량 확인</h1>
          <div className="flex justify-end">
            <AdminHeader />
          </div>
        </div>
      </div>

      {/* 상단 월 입력 제거됨 (달력 내 네비게이션 사용) */}

      {/* 요약 */}
      <div className="max-w-4xl mx-auto grid grid-cols-2 gap-2 mb-3">
      <div className="rounded border bg-white p-2 text-center">
          <p className="text-[11px] text-gray-500">{displayMonthNum}월 판매수량</p>
          <p className="text-sm font-semibold">{totalQty.toLocaleString()}개</p>
        </div>
      <div className="rounded border bg-white p-2 text-center">
          <p className="text-[11px] text-gray-500">{displayMonthNum}월 매출</p>
          <p className="text-sm font-semibold text-orange-600">{`₩${totalRev.toLocaleString('ko-KR')}`}</p>
        </div>        
        

      </div>

      {/* 캘린더(월) - 요약 매출 표시 */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-[32px_1fr_32px] items-center mb-3">
          <button
            type="button"
            className="h-8 w-8 rounded border bg-white hover:bg-gray-50"
            aria-label="이전 달"
            onClick={() => {
              const [y, m] = monthValue.split('-').map(Number);
              const d = new Date(y, m - 2, 1);
              const next = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
              setMonthValue(next);
              applyMonthRange(next);
              // 기본 선택: 해당 월 1일
              const first = toKstYMD(new Date(d.getFullYear(), d.getMonth(), 1));
              setSelectedDate(first);
              setRows([]);
              loadDetailsForDate(first);
            }}
          >
            ◀
          </button>
          <div className="text-center font-semibold">
            {year}년 {month + 1}월
            {loadingSummary && <span className="ml-2 text-sm text-gray-500">(로딩중...)</span>}
          </div>
          <button
            type="button"
            className={`h-8 w-8 rounded border bg-white hover:bg-gray-50 ml-auto ${monthValue === currentMonthStr ? 'opacity-40 cursor-not-allowed' : ''}`}
            aria-label="다음 달"
            onClick={() => {
              if (monthValue === currentMonthStr) return;
              const [y, m] = monthValue.split('-').map(Number);
              const d = new Date(y, m, 1);
              const next = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
              // 미래 달 이동 방지
              if (next > currentMonthStr) return;
              const clamped = next > currentMonthStr ? currentMonthStr : next;
              setMonthValue(clamped);
              applyMonthRange(clamped);
              // 기본 선택: 해당 월 1일
              const first = toKstYMD(new Date(d.getFullYear(), d.getMonth(), 1));
              setSelectedDate(first);
              setRows([]);
              loadDetailsForDate(first);
            }}
            disabled={monthValue === currentMonthStr}
          >
            ▶
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-xs text-gray-500 mb-2">
          {['일','월','화','수','목','금','토'].map((d) => (
            <div
              key={d}
              className={`text-center ${d === '토' ? 'text-blue-600' : d === '일' ? 'text-red-600' : ''}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {calendarCells.map((c, i) => {
            if (!c.dateStr) return <div key={i} className="h-16 sm:h-20" />;
            const rev = summaryByDate[c.dateStr] || 0;
            const active = selectedDate === c.dateStr;
            const weekIdx = i % 7; // 0=일 ... 6=토
            // 공휴일 감지(있다면 추가): YYYY-MM-DD 문자열 세트
            const holidaySet = new Set<string>();
            const isHoliday = holidaySet.has(c.dateStr);
            // 미래 날짜 비활성화 (단, 오늘은 활성화)
            const todayStr = toKstYMD(kstNow);
            const isFuture = new Date(c.dateStr) > kstNow && c.dateStr !== todayStr;
            return (
              <button
                key={i}
                onClick={() => !isFuture && loadDetailsForDate(c.dateStr!)}
                disabled={isFuture}
                className={`h-16 sm:h-20 rounded p-1 flex flex-col justify-between items-center transition
      ${active ? 'ring-1 ring-orange-300 bg-orange-50' : ''}
      ${isFuture ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                aria-label={`${c.dateStr} 매출 ${rev.toLocaleString('ko-KR')}원`}
              >
                {/* 날짜 */}
                <div className={`text-[12px] sm:text-[13px] font-medium
      ${isHoliday || weekIdx === 0 ? 'text-red-600' : weekIdx === 6 ? 'text-blue-600' : 'text-gray-700'}`}>
                  {c.label}
                </div>
                {/* 금액 */}
                <div className="text-[10px] sm:text-[12px] tabular-nums leading-tight text-sky-600 w-full text-center sm:text-right sm:w-auto sm:ml-auto">
                  <span className="sm:hidden">{rev > 0 ? formatKRWShort(rev) : '\u00A0'}</span>
                  <span className="hidden sm:inline">{rev > 0 ? rev.toLocaleString('ko-KR') : '\u00A0'}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 일 요약 (품목 하단) */}
      <div className="max-w-4xl mx-auto grid grid-cols-2 gap-2 mt-3 mb-">

      <div className="rounded border bg-white p-2 text-center">
          <p className="text-[11px] text-gray-500">
            {selectedDayMD ? (
              <>
                <span className="font-semibold text-gray-800">{selectedDayMD}</span>
                <span className="ml-1">판매수량</span>
              </>
            ) : '선택일 판매수량'}
          </p>
          <p className="text-sm font-semibold">{selectedDate ? `${selectedDayQty.toLocaleString()}개` : '—'}</p>
        </div>
        <div className="rounded border bg-white p-2 text-center">
          <p className="text-[11px] text-gray-500">
            {selectedDayMD ? (
              <>
                <span className="font-semibold text-gray-800">{selectedDayMD}</span>
                <span className="ml-1">매출</span>
              </>
            ) : '선택일 매출'}
          </p>
          <p className="text-sm font-semibold text-sky-600">
            {selectedDate ? `₩${selectedDayRev.toLocaleString('ko-KR')}` : '—'}
          </p>
        </div>
      </div>
      {/* 검색 입력: 달력 아래, 상세 위 */}
      {/* 기존 검색 input 영역 완전히 삭제됨 */}

      {/* 테이블 (선택 날짜 상세) */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-sm text-gray-500">
                <th className="px-4 py-3 w-5/12 text-left">상품명</th>
                <th className="px-4 py-3 w-2/12 text-left">수량</th>
                <th className="px-4 py-3 w-2/12 text-right">단가</th>
                <th className="px-4 py-3 w-3/12 text-right">매출</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-gray-500" colSpan={4}>
                    {selectedDate ? (loadingDetails ? '불러오는 중…' : '해당 날짜의 매출 내역이 없습니다.') : '날짜를 클릭하면 상세 매출이 표시됩니다.'}
                  </td>
                </tr>
              )}
              {filtered.map(r => (
                <tr key={r.id} className="border-t text-sm">
                  <td className="px-4 py-3 w-5/12">{r.productName}</td>
                  <td className="px-4 py-3 w-2/12 text-left">{r.quantity.toLocaleString()} 개</td>
                  <td className="px-4 py-3 w-2/12 font-mono text-right">{formatKRW(r.price)}</td>
                  <td className="px-4 py-3 w-3/12 font-mono text-right">{formatKRW(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="sm:hidden divide-y">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-500">
              {selectedDate ? (loadingDetails ? '불러오는 중…' : '해당 날짜의 매출 내역이 없습니다.') : '날짜를 클릭하면 상세 매출이 표시됩니다.'}
            </div>
          )}
          {filtered.map(r => (
            <div key={r.id} className="p-4">
              <div className="text-sm font-medium">{r.productName}</div>
              <div className="mt-1 text-xs text-gray-500">수량 {r.quantity.toLocaleString()}개 · 단가 {formatKRW(r.price)}</div>
              <div className="mt-1 text-sm font-semibold text-right">{formatKRW(r.revenue)}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
