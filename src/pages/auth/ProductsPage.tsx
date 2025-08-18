import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import FloatingActions from '../../components/FloatingActions';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getProducts, modifyName, checkNameExists, createReservation, resetApiRetryCount } from '../../utils/api';
import ProductDetailPage from './ProductDetailPage';

type Product = {
  id: number;
  name: string;
  quantity: number;
  price: number;
  stock: number;
  imageUrl: string;
  sellDate: string; // YYYY-MM-DD
  totalSold?: number;
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

// KST 기준 시각/날짜 유틸
function getKstNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000; // 로컬→UTC
  return new Date(utcMs + 9 * 60 * 60 * 1000); // UTC→KST(+9h)
}

function formatKstYmd(kstDate: Date): string {
  // kstDate는 KST 시각을 나타내는 Date 객체. UTC 게터로 연/월/일을 안전하게 추출
  const y = kstDate.getUTCFullYear();
  const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 오후 9시 이후에는 다음날을 기준으로, 포함 3일간 날짜 생성
function getNext3Days(): string[] {
  const arr: string[] = [];
  const kstNow = getKstNow();
  const start = new Date(kstNow);
  // kstNow는 KST 기준이므로 시간 판정은 getUTCHours 사용
  if (kstNow.getUTCHours() >= 21) {
    start.setUTCDate(start.getUTCDate() + 1);
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    arr.push(formatKstYmd(d));
  }
  return arr;
}

const storeTitle = '과일맛집 1955';
const branchName = '';

export default function ReservePage() {
  // 재고 상태 기준값 (static 변수)
  const LOW_STOCK_THRESHOLD = 10;    // 품절임박 기준
  
  const [products, setProducts] = useState<Product[]>([]);
  const { show } = useSnackbar();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  // ProductDetailPage dialog 상태
  const [detailDialog, setDetailDialog] = useState<{
    isOpen: boolean;
    productId: number;
  }>({ isOpen: false, productId: 0 });

  // 개인정보처리방침 dialog 상태
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);

  // 닉네임 + 모달
  const [nickname, setNickname] = useState<string>(() => {
    const saved = localStorage.getItem('nickname');
    return saved && saved.trim() ? saved : '신규 고객';
  });
  const [nickModalOpen, setNickModalOpen] = useState(false);
  const [draftNick, setDraftNick] = useState(nickname);
  const [savingNick, setSavingNick] = useState(false);
  const nickInputRef = useRef<HTMLInputElement>(null);
  


  // 뒤로가기(popstate) 핸들링
  useEffect(() => {
    const onPopState = () => {
      if (detailDialog.isOpen) {
        setDetailDialog({ isOpen: false, productId: 0 });
        return;
      }
      if (nickModalOpen) {
        setNickModalOpen(false);
        return;
      }
      if (privacyDialogOpen) {
        setPrivacyDialogOpen(false);
        return;
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [detailDialog.isOpen, nickModalOpen, privacyDialogOpen]);

  // 날짜 탭
  const dates = useMemo(() => getNext3Days(), []);
  const [activeDate, setActiveDate] = useState<string>(dates[0]);
  // Load data from mock or API
  useEffect(() => {
    const loadProducts = async () => {
      if (USE_MOCKS) {
        const mocked = listProducts();
        const mapped: Product[] = mocked.map((p, i) => ({
          id: p.id,
          name: p.name,
          quantity: p.stock > 0 ? 1 : 0,
          price: p.price,
          stock: p.stock,
          imageUrl: p.imageUrl,
          sellDate: dates[i % dates.length], // Distribute across dates
          totalSold: p.totalSold ?? 0,
        }));
        setProducts(mapped);
      } else {
        try {
          // 한국 시간 기준 오후 9시 이후면 다음날을 시작일로, 포함 7일 범위 요청 (KST 처리)
          const kstNow = getKstNow();
          const start = new Date(kstNow);
          if (kstNow.getUTCHours() >= 21) {
            start.setUTCDate(start.getUTCDate() + 1);
          }
          const fromStr = formatKstYmd(start);
          const toDate = new Date(start);
          toDate.setUTCDate(start.getUTCDate() + 6);
          const toStr = formatKstYmd(toDate);
          
          const res = await getProducts(fromStr, toStr);
          if (!res.ok) {
            // 401, 403 에러는 통합 에러 처리로 위임
            if (res.status === 401 || res.status === 403) {
              return; // userFetch에서 이미 처리됨
            }
            throw new Error('상품 목록을 불러오지 못했습니다.');
          }
          const data = await res.json();
          
          let productsArray = data;
          
          // ProductListResponse 구조에서 response 필드 추출
          if (data && typeof data === 'object' && data.response && Array.isArray(data.response)) {
            productsArray = data.response;
          }
          
          // 여전히 배열이 아닌 경우 에러
          if (!Array.isArray(productsArray)) {
            throw new Error('상품 데이터가 배열 형태가 아닙니다.');
          }
          
          setProducts(productsArray.map((p: any, i: number) => ({
            id: p.id,
            name: p.name,
            quantity: p.stock > 0 ? 1 : 0,
            price: p.price,
            stock: p.stock,
            imageUrl: p.image_url ? `${process.env.REACT_APP_IMG_URL}/${p.image_url}` : p.imageUrl,
            // sell_date 필드명으로 매핑
            sellDate: p.sell_date || p.sellDate || dates[i % dates.length],
            // 누적 판매량 필드명: total_sold
            totalSold: p.total_sold ?? 0,
          })));
        } catch (e: any) {
          safeErrorLog(e, 'ShopPage - loadProducts');
          show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
        }
      }
    };
    loadProducts();
  }, [show, dates]);

  const productsOfDay = useMemo(
    () => {
      const filtered = products.filter(p => p.sellDate === activeDate);
      
      // 정렬: 품절이 아닌 상품 우선 → 누적 판매량 높은 순 → 재고 많은 순
      return filtered.sort((a, b) => {
        // 1순위: 품절이 아닌 상품이 우선 (stock > 0)
        if (a.stock > 0 && b.stock === 0) return -1;
        if (a.stock === 0 && b.stock > 0) return 1;
        
        // 2순위: 품절이 아닌 상품들 중에서 누적 판매량이 높은 순
        if (a.stock > 0 && b.stock > 0) {
          if (a.totalSold !== b.totalSold) {
            return (b.totalSold || 0) - (a.totalSold || 0); // 내림차순
          }
          
          // 3순위: 누적 판매량이 같다면 재고가 많은 순
          return (b.stock - b.quantity) - (a.stock - a.quantity); // 내림차순
        }
        
        // 둘 다 품절인 경우 누적 판매량 순
        if (a.totalSold !== b.totalSold) {
          return (b.totalSold || 0) - (a.totalSold || 0); // 내림차순
        }
        
        return 0;
      });
    },
    [products, activeDate]
  );
  const countOf = (date: string) => products.filter(p => p.sellDate === date).length;

  // 상품이 있는 날짜만 노출
  const availableDates = useMemo(() => dates.filter(d => countOf(d) > 0), [dates, products]);

  // 활성 날짜가 사라졌다면 첫 유효 날짜로 이동
  useEffect(() => {
    if (availableDates.length === 0) return;
    if (!availableDates.includes(activeDate)) {
      setActiveDate(availableDates[0]);
    }
  }, [availableDates, activeDate]);

  const handleQuantity = (id: number, diff: number) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id !== id) return p;
        const nextQty = Math.max(0, Math.min(p.stock, p.quantity + diff));
        return { ...p, quantity: nextQty };
      })
    );
  };

  const handleReserve = async (product: Product) => {
    if (product.quantity <= 0) return show('1개 이상 선택해주세요.', { variant: 'error' });
    if (product.quantity > product.stock) return show('재고보다 많이 예약할 수 없어요.', { variant: 'error' });
    
    try {
      if (USE_MOCKS) {
        // Mock 예약 처리
        await new Promise(resolve => setTimeout(resolve, 500));
        show(`${product.name} ${product.quantity}개 예약 완료!`);
        
        // Mock 모드에서는 재고 차감
        setProducts(prev =>
          prev.map(p =>
            p.id === product.id ? { ...p, stock: p.stock - product.quantity } : p
          )
        );
      } else {
        // 실제 예약 API 호출
        const reservationData = {
          product_id: product.id,
          quantity: product.quantity,
          pickup_date: product.sellDate,
          amount: product.price * product.quantity
        };
        
        const res = await createReservation(reservationData);
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || '예약에 실패했습니다.');
        }
        
        show(`${product.name} ${product.quantity}개 예약 완료!`);
        
        // 성공 시 재고 차감
        setProducts(prev =>
          prev.map(p =>
            p.id === product.id ? { ...p, stock: p.stock - product.quantity } : p
          )
        );
      }
    } catch (e: any) {
      safeErrorLog(e, 'ProductsPage - handleReserve');
      show(getSafeErrorMessage(e, '예약 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  const prettyKdate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    const w = '일월화수목금토'[d.getDay()];
    return `${d.getMonth() + 1}월${d.getDate()}일 (${w})`;
  };

  // 닉네임 모달
  const openNickModal = () => {
    setDraftNick(nickname);
    setNickModalOpen(true);
    window.history.pushState({ modal: 'nickname' }, '');
  };

  useEffect(() => {
    if (nickModalOpen) {
      setTimeout(() => nickInputRef.current?.focus(), 0);
    }
  }, [nickModalOpen]);

  // 로그인 직후 exists=false이면 (nav state 또는 storage) 모달 자동 오픈 + 빈 값으로 초기화
  useEffect(() => {
    const navState: any = (location && (location as any).state) || {};
    const fromNav = !!navState?.forceNicknameChange;
    const shouldOpen = fromNav || sessionStorage.getItem('force_nickname_change') === '1' || localStorage.getItem('force_nickname_change') === '1';
    if (shouldOpen) {
      setNickModalOpen(true);
      setDraftNick('');
      setNickname('신규 고객');
      window.history.pushState({ modal: 'nickname' }, '');
      try { sessionStorage.removeItem('force_nickname_change'); } catch {}
      try { localStorage.removeItem('force_nickname_change'); } catch {}
      // nav state 정리
      if (fromNav) {
        try { window.history.replaceState({}, ''); } catch {}
      }
    }
  }, [location]);

  // 로그인 후 저장된 닉네임 반영
  useEffect(() => {
    const handle = () => {
      const saved = localStorage.getItem('nickname');
      if (saved && saved.trim() && saved !== nickname) setNickname(saved);
    };
    window.addEventListener('storage', handle);
    // 초기에 한 번 동기화
    handle();
    return () => window.removeEventListener('storage', handle);
  }, [nickname]);

  const onNickModalKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') setNickModalOpen(false);
  };

  const checkNicknameUnique = async (value: string) => {
    if (USE_MOCKS) {
      // Mock 닉네임 중복 검사 - 항상 사용 가능
      await new Promise(resolve => setTimeout(resolve, 300)); // 0.3초 지연
      return true;
    } else {
      try {
        const res = await checkNameExists(value);
        if (!res.ok) throw new Error('중복 검사 실패');
        
        const data = await res.json();
        // 백엔드에서 true/false로 중복 여부 반환
        // true: 사용 가능 (중복 아님), false: 중복됨
        return Boolean(data);
      } catch (e: any) {
        safeErrorLog(e, 'ShopPage - checkNicknameUnique');
        show(getSafeErrorMessage(e, '닉네임 중복 확인 중 오류가 발생했습니다.'), { variant: 'error' });
        return false;
      }
    }
  };

  const saveNickname = async () => {
    const value = draftNick.trim();
    if (!value) {
      show('닉네임을 입력해주세요.', { variant: 'error' });
      return;
    }
    // 허용 문자: 숫자/영문/한글만 (이모지, 특수문자, 공백 불가)
    const allowed = /^[A-Za-z0-9가-힣]+$/;
    if (!allowed.test(value)) {
      show('닉네임은 숫자와 한글/영문만 사용할 수 있어요.', { variant: 'info' });
      return;
    }
    // Length validation: 3~10
    if (value.length < 3 || value.length > 10) {
      show('닉네임은 3~10자로 입력해주세요.', { variant: 'error' });
      return;
    }
    if (value === nickname) {
      setNickModalOpen(false);
      return;
    }

    try {
      setSavingNick(true);
      const unique = await checkNicknameUnique(value);
      if (!unique) {
        show('이미 사용 중인 닉네임입니다.', { variant: 'error' });
        return;
      }

      if (USE_MOCKS) {
        // Mock 닉네임 저장
        await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 지연
        setNickname(value);
        localStorage.setItem('nickname', value);
        show('닉네임이 변경되었습니다.');
        setNickModalOpen(false);
      } else {
        const res = await modifyName(value);
        
        // 응답 상태 확인
        if (!res.ok) {
          const errorText = await res.text();
          console.error('닉네임 변경 API 응답:', res.status, errorText);
          throw new Error(`닉네임 저장 실패: ${res.status} ${res.statusText}`);
        }
        
        // 성공 시 처리
        setNickname(value);
        localStorage.setItem('nickname', value);
        show('닉네임이 변경되었습니다.');
        

        
        // 모달 닫기
        setNickModalOpen(false);
        
        // 닉네임 상태 강제 업데이트 (UI 리렌더링 보장)
        setTimeout(() => {
          setNickname(value);
        }, 100);
      }
    } catch (e: any) {
      safeErrorLog(e, 'ShopPage - saveNickname');
      show(getSafeErrorMessage(e, '닉네임 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setSavingNick(false);
    }
  };

  // 상세보기 dialog 열기 (history state 추가)
  const openDetail = (productId: number) => {
    setDetailDialog({ isOpen: true, productId });
    window.history.pushState({ modal: 'product', productId }, '');
  };

  return (
    <main className="bg-[#f6f6f6] min-h-screen flex justify-center px-4 sm:px-6 lg:px-8 pt-16">
      {/* 상단 바: 3등분 레이아웃로 균등 분배 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="mx-auto w-full max-w-md h-14 flex items-center px-4">
          {/* 좌: 햄버거 */}
          <div className="flex-1 flex justify-start">
            <button
              type="button"
              onClick={() => {
                if (detailDialog.isOpen) {
                  setDetailDialog({ isOpen: false, productId: 0 });
                } else if (nickModalOpen) {
                  setNickModalOpen(false);
                } else {
                  setDrawerOpen(true);
                }
              }}
              className="h-10 w-10 grid place-items-center rounded-md hover:bg-gray-50 active:scale-[0.98]"
              aria-label={detailDialog.isOpen || nickModalOpen ? "닫기" : "메뉴 열기"}
            >
              {detailDialog.isOpen || nickModalOpen ? (
                <span className="text-lg">✕</span>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
              )}
            </button>
          </div>

          {/* 중: 상호/지점 (클릭 시 메인으로 이동) */}
          <div className="flex-1 flex flex-col items-center leading-tight">
            <button
              type="button"
              onClick={() => nav('/products')}
              className="text-lg font-bold text-gray-800 hover:underline"
              aria-label="메인으로 이동"
            >
              {storeTitle}
            </button>
            {branchName ? <div className="text-xs text-gray-600">- {branchName} -</div> : null}
          </div>

          {/* 우: 닉네임 */}
          <div className="flex-1 flex justify-end">
            <button onClick={openNickModal} className="text-right leading-tight text-sm" title="닉네임 변경">
              <div className="font-medium text-gray-800">{nickname}님</div>
              <div className="text-gray-500">안녕하세요</div>
            </button>
          </div>
        </div>
      </header>

      {/* 좌측 드로어 */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85%] bg-white shadow-xl border-r p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-base font-semibold">메뉴</div>
              <button
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-gray-50"
                onClick={() => setDrawerOpen(false)}
                aria-label="메뉴 닫기"
              >
                ✕
              </button>
            </div>

            <nav className="mt-2 space-y-2 text-sm">
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                 href="https://open.kakao.com/o/gX73w4Yg" target="_blank" rel="noreferrer">카카오톡 오픈채팅</a>
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                 href="https://open.kakao.com/o/sfAUFYeh" target="_blank" rel="noreferrer">과일맛집 문제해결사</a>
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                 href="tel:01030299238">점장 문의</a>
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                 href="https://naver.me/FmfPi8Y8" target="_blank" rel="noreferrer">찾아오시는 길</a>
            </nav>

            <div className="mt-6 text-xs text-gray-400">© 2025 과일맛집</div>
            
            {/* Footer 내용을 aside로 이동 */}
            <div className="mt-6 text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-gray-500">과일맛집</p>
              <p>대표: 김지훈</p>
              <p>사업자등록번호: 131-47-00411</p>
              <p>문의: 02-2666-7412</p>
              <p className="mt-1">&copy; 2025 All rights reserved.</p>
            </div>
            
            {/* 개인정보처리방침 링크 */}
            <div className="mt-4">
              <button
                onClick={() => setPrivacyDialogOpen(true)}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                개인정보처리방침
              </button>
            </div>
          </aside>
        </>
      )}

      {/* 닉네임 변경 모달 */}
      {nickModalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          onKeyDown={onNickModalKeyDown}
          aria-modal="true"
          role="dialog"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setNickModalOpen(false)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl border p-5">
            <h2 className="text-base font-semibold text-gray-800">닉네임 변경(최소 3자, 최대 10자)</h2>
            <p className="text-sm text-gray-500 mt-1">중복된 닉네임은 사용 불가능합니다.</p>
            <div className="mt-4">
              <input
                ref={nickInputRef}
                value={draftNick}
                onChange={e => setDraftNick(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveNickname(); }}
                className="w-full h-10 border rounded px-3"
                placeholder="닉네임"
                maxLength={10}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setNickModalOpen(false)}
                className="h-10 px-4 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
              >
                취소
              </button>
              <button
                onClick={saveNickname}
                disabled={savingNick}
                className="h-10 px-4 rounded bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
              >
                {savingNick ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="w-full max-w-md">
        {/* 안내 카드 */}
        <div className="bg-white p-5 rounded-xl shadow mb-6 text-center">
          <h1 className="text-lg font-bold text-gray-800">🎁과일맛집1995 현장예약🎁</h1>
        </div>

        {/* 전체 비어있을 때 안내 */}
        {availableDates.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            현재 예약중인 상품이 없습니다.
          </div>
        )}

        {/* 날짜 탭 (상품 없는 날짜는 비노출) */}
        {availableDates.length > 0 && (
          <div className="mt-2 mb-4">
            <div className="flex items-center justify-start gap-2 overflow-x-auto no-scrollbar pl-3 pr-3">
              {availableDates.map(date => {
                const active = activeDate === date;
                return (
                  <button
                    key={date}
                    onClick={() => setActiveDate(date)}
                    className={
                      'px-3 py-2 rounded-xl border text-sm whitespace-nowrap transition ' +
                      (active
                        ? 'bg-orange-500 text-white border-orange-500 shadow'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')
                    }
                  >
                    <div className="font-semibold">{prettyKdate(date)}</div>
                    <div className="text-[11px] mt-1 text-center text-gray-600">
                      {countOf(date)}개 상품 예약중
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 상품 목록(선택 날짜) */}
        {availableDates.length > 0 && (
        <div className="space-y-4 mb-6">
          {productsOfDay.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full aspect-[4/3] object-cover cursor-pointer"
                onClick={() => openDetail(item.id)}
                role="button"
                aria-label={`${item.name} 상세보기`}
              />
              <div className="p-4">
                <h2
                  className="text-xl font-semibold cursor-pointer flex items-center justify-between gap-2"
                  onClick={() => openDetail(item.id)}
                  role="button"
                >
                  <span className="truncate hover:underline">{item.name}</span>
                  <span className="text-xl text-orange-500 font-semibold flex-shrink-0">{item.stock === 0 ? formatPrice(item.price) : formatPrice(item.price * item.quantity)}</span>
                </h2>
                <div className="flex justify-between text-sm text-gray-500 flex items-center justify-between gap-2">
                  <span>누적 판매 : {item.totalSold ?? 0}개</span>
                  {item.stock > 0 && (
                    <span className="text-l">
                      {(item.stock - item.quantity) === 0 ? '재고를 모두 담았어요!' : `${item.stock - item.quantity}개 남았어요!`}
                      {(item.stock - item.quantity) < LOW_STOCK_THRESHOLD && (
                        <span className="ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border"
                          style={{
                            backgroundColor: '#FECACA',
                            borderColor: '#e5e7eb',
                            color: '#374151'
                          }}
                        >
                          품절임박
                        </span>
                      )}
                    </span>
                  )}
                </div>
              
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center border rounded overflow-hidden w-full sm:w-40 h-10">
                    <button
                      onClick={() => handleQuantity(item.id, -1)}
                      className="w-1/6 h-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                      disabled={item.quantity <= 0}
                      aria-label="수량 감소"
                    >
                      -
                    </button>
                    <span className="w-2/3 text-center">{item.quantity}</span>
                    <button
                      onClick={() => handleQuantity(item.id, 1)}
                      className="w-1/6 h-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                      disabled={item.quantity >= item.stock}
                      aria-label="수량 증가"
                    >
                      +
                    </button>
                  </div>

                  {/* 모바일: 두 버튼을 같은 줄에 좌/우로 배치 */}
                  <div className="flex w-full gap-2 sm:w-auto sm:gap-3 md:gap-4">
                    <button
                      onClick={() => openDetail(item.id)}
                      className="flex-1 h-10 rounded border border-gray-300 hover:bg-gray-50 sm:w-28 sm:flex-none text-sm font-medium"
                      type="button"
                    >
                      자세히 보기
                    </button>
                    <button
                      onClick={() => handleReserve(item)}
                      disabled={item.stock === 0}
                      className={`flex-1 h-10 rounded text-sm font-medium sm:w-28 sm:flex-none ${item.stock === 0 ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}
                    >
                      {item.stock === 0 ? '품절' : '예약하기'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </section>      
      <FloatingActions
        orderPath="/me/orders"  
      />

      {/* 상품 상세 Dialog */}
      {detailDialog.isOpen && (
        <ProductDetailPage
          isOpen={detailDialog.isOpen}
          onClose={() => setDetailDialog({ isOpen: false, productId: 0 })}
          productId={detailDialog.productId}
        />
      )}

      {/* 개인정보처리방침 Dialog */}
      {privacyDialogOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          aria-modal="true"
          role="dialog"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setPrivacyDialogOpen(false)} />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-xl border overflow-hidden">
            <div className="p-6 overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-800">개인정보처리방침</h2>
                <button
                  onClick={() => setPrivacyDialogOpen(false)}
                  className="h-8 w-8 grid place-items-center rounded-md hover:bg-gray-50"
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>
              
              <div className="text-sm text-gray-700 space-y-4 leading-relaxed">
                <div className="text-right text-gray-500">
                  <p>업데이트 일자: 2025년 8월 15일</p>
                </div>
                
                <p>
                  주식회사 과일맛집(이하 "회사")는 이용자의 개인정보를 소중히 여기며 「개인정보 보호법」 등 관련 법령을 준수하고 있습니다. 
                  본 개인정보처리방침은 회사가 운영하는 공동구매 플랫폼 서비스에 적용되며, 개인정보가 어떤 방식으로 수집되고 이용되는지, 
                  어떤 보호 조치가 시행되고 있는지를 설명합니다.
                </p>
                
                <p>
                  회사는 개인정보처리방침을 수시로 개정할 수 있으며, 변경사항은 플랫폼 내 공지사항을 통해 사전에 안내합니다.
                </p>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">1. 수집하는 개인정보 항목 및 수집 방법</h3>
                  <p className="mb-2">회사는 다음과 같은 목적으로 최소한의 개인정보를 수집합니다.</p>
                  
                  <h4 className="font-medium text-gray-700 mb-1">수집 항목</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>오류 문의 시: 고객명(필수), 휴대폰 번호(필수)</li>
                    <li>카카오 로그인: 이름(필수)</li>
                  </ul>
                  
                  <h4 className="font-medium text-gray-700 mb-1 mt-3">수집 방법</h4>
                  <p>회원가입, 고객 문의 접수, 카카오 로그인, 서비스 이용 과정에서 자동 또는 수동으로 수집</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">2. 개인정보의 이용 목적</h3>
                  <p className="mb-2">회사는 수집한 개인정보를 다음 목적을 위해 이용합니다.</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>오류 문의 및 응답 처리</li>
                    <li>카카오 로그인을 통한 본인 인증</li>
                    <li>공동구매 주문 승인, 주문 취소 등과 관련된 알림톡 발송</li>
                    <li>서비스 이용 통계 및 마케팅 자료 분석 (비식별 데이터 기준)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">3. 개인정보 보유 및 이용 기간</h3>
                  <p className="mb-2">회사는 수집된 개인정보를 목적 달성 후 즉시 파기하며, 관련 법령에 따라 아래와 같이 일정 기간 보관할 수 있습니다.</p>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 p-2 text-left">항목</th>
                          <th className="border border-gray-200 p-2 text-left">보유 기간</th>
                          <th className="border border-gray-200 p-2 text-left">관련 법령</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-gray-200 p-2">표시/광고에 관한 기록</td>
                          <td className="border border-gray-200 p-2">6개월</td>
                          <td className="border border-gray-200 p-2">전자상거래법</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-200 p-2">계약 또는 청약철회 기록</td>
                          <td className="border border-gray-200 p-2">5년</td>
                          <td className="border border-gray-200 p-2">전자상거래법</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-200 p-2">대금결제 및 재화 등의 공급 기록</td>
                          <td className="border border-gray-200 p-2">5년</td>
                          <td className="border border-gray-200 p-2">전자상거래법</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">4. 개인정보의 제3자 제공</h3>
                  <p className="mb-2">회사는 이용자의 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만 아래의 경우는 예외로 합니다.</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>사전에 이용자의 동의를 받은 경우</li>
                    <li>법령에 따라 수사기관의 요청이 있는 경우</li>
                    <li>서비스 제공에 따른 요금 정산이 필요한 경우</li>
                    <li>긴급한 생명 및 안전 보호가 요구되는 경우</li>
                  </ul>
                </div>
                  
                  <p className="mt-2">
                    회사는 위탁계약을 통해 개인정보 보호법에 따른 보호조치를 적용하고 있으며, 
                    위탁사항이 변경될 경우 본 방침을 통해 안내합니다.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">5. 이용자의 권리 및 행사 방법</h3>
                  <p className="mb-2">이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>개인정보 열람 요청</li>
                    <li>정정 요청</li>
                    <li>삭제 요청</li>
                    <li>처리 정지 요청</li>
                  </ul>
                  <p className="mt-2">
                    요청은 서면, 이메일 등을 통해 제출할 수 있으며, 법정대리인이나 위임을 받은 자를 통해서도 가능합니다.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">6. 개인정보 파기 절차 및 방법</h3>
                  <p className="mb-2">회사는 개인정보 보유기간 경과 또는 처리 목적 달성 시 다음 절차에 따라 파기합니다.</p>
                  
                  <h4 className="font-medium text-gray-700 mb-1">파기 절차</h4>
                  <p className="mb-2">보유 목적 달성 후 내부 방침 및 관련 법령에 따라 즉시 삭제</p>
                  
                  <h4 className="font-medium text-gray-700 mb-1">파기 방법</h4>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>종이 출력물: 분쇄 또는 소각</li>
                    <li>전자 파일: 복구 불가능한 방식으로 영구 삭제</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">7. 개인정보의 안전성 확보 조치</h3>
                  <p className="mb-2">회사는 다음과 같은 조치로 개인정보를 보호하고 있습니다.</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>비밀번호 및 계정 정보 암호화</li>
                    <li>개인정보 접근 제한 및 담당자 교육</li>
                    <li>침입 탐지 시스템 및 보안 솔루션 운영</li>
                    <li>해킹/바이러스 등 외부 위협에 대한 예방 대책</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">8. 개인정보 보호책임자 및 열람청구 접수 부서</h3>
                  <p className="mb-2">이용자의 개인정보 보호와 관련한 문의사항은 아래 담당자에게 문의하실 수 있습니다.</p>
                  
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">개인정보 보호책임자, 개인정보 열람청구 접수부서</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">이름:</span> 김지훈</p>
                      <p><span className="font-medium">소속:</span> 과일맛집</p>
                      <p><span className="font-medium">전화번호:</span> 010-3029-9238</p>
                    </div>
                  </div>
                  </div>
                

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">10. 개인정보 침해 신고 및 상담 기관</h3>
                  <p className="mb-2">아래 기관을 통해 개인정보 침해에 대한 상담 및 신고가 가능합니다.</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>개인정보침해신고센터 (국번 없이 118) – <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://privacy.kisa.or.kr</a></li>
                    <li>대검찰청 사이버범죄수사과 (국번 없이 1301) – <a href="https://www.spo.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://www.spo.go.kr</a></li>
                    <li>경찰청 사이버범죄 신고시스템 (국번 없이 182) – <a href="https://cyberbureau.police.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://cyberbureau.police.go.kr</a></li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">11. 개인정보처리방침 변경에 대한 고지</h3>
                  <p>본 방침은 2025년 8월 15일부터 적용됩니다.</p>
                  <p className="mt-2">내용 변경 시 최소 7일 전에 홈페이지 공지사항을 통해 안내합니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
