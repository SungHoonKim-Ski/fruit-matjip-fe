import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import BottomNav from '../../components/BottomNav';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getProducts, modifyName, checkNameExists, createReservation, getServerTime, getUserMessage, markMessageAsRead, getProductKeywords, getUserMe, getDeliveryConfig } from '../../utils/api';
import ProductDetailPage from './ProductDetailPage';
import Footer from '../../components/Footer';
import { theme, logoText, defaultKeywordImage } from '../../brand';

const MAX_DAYS = 10; // 최대 10일 예약 가능

type Product = {
  id: number;
  name: string;
  quantity: number;
  price: number;
  stock: number;
  imageUrl: string;
  sellDate: string; // YYYY-MM-DD
  totalSold?: number;
  orderIndex?: number; // 노출 순서
  sellTime?: string; // 예약 시작 시간 (HH:mm, KST) - 선택값
  deliveryAvailable?: boolean; // 서버 delivery_available
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

// KST 기준 시각/날짜 유틸
function formatDateKR(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


function formatKstYmd(kstDate: Date): string {
  // kstDate는 KST 시각을 나타내는 Date 객체. UTC 게터로 연/월/일을 안전하게 추출
  const y = kstDate.getFullYear();
  const m = String(kstDate.getMonth() + 1).padStart(2, '0');
  const d = String(kstDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 마감 시간 이후에는 다음날을 시작으로 10일간 날짜 생성
function getNext10Days(): string[] {
  const arr: string[] = [];
  const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const start = new Date(kstNow);
  const [dh, dm] = (theme.config.reservationDeadline ?? '19:30').split(':').map(Number);
  if (kstNow.getHours() > dh || (kstNow.getHours() === dh && kstNow.getMinutes() >= dm)) {
    start.setDate(start.getDate() + 1);
  }
  for (let i = 0; i < MAX_DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i); // setUTCDate 대신 setDate 사용
    arr.push(formatKstYmd(d));
  }
  return arr;
}

const branchName = '';

// KST 기준 현재 날짜/시간 문자열 계산 (서버 시간 동기화 적용)
function getKstNowStrings(offsetMs: number = 0): { dateStr: string; timeStr: string } {
  const now = new Date(Date.now() + offsetMs);
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  const hh = String(kst.getHours()).padStart(2, '0');
  const mm = String(kst.getMinutes()).padStart(2, '0');
  return { dateStr: `${y}-${m}-${d}`, timeStr: `${hh}:${mm}` };
}

// 예약 버튼 활성화 여부 (KST 기준, 서버 시간 동기화 적용)
function isReservationTimeOpen(product: Product, offsetMs: number = 0): boolean {
  if (!product.sellTime) return true; // 시간 제약이 없으면 항상 가능
  const { dateStr, timeStr } = getKstNowStrings(offsetMs);
  if (dateStr < product.sellDate) return false;
  if (dateStr > product.sellDate) return true;
  // 같은 날짜: HH:mm 비교 (초 무시)
  const target = product.sellTime.slice(0, 5);
  return timeStr >= target;
}

// KST 기준 현재 Date 객체 (서버 시간 동기화 적용)
function getKstNowDate(offsetMs: number = 0): Date {
  const now = new Date(Date.now() + offsetMs);
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

// 남은 시간 hh:mm 포맷 반환 (오픈 전인 경우만). 오픈 시간이 없으면 null (서버 시간 동기화 적용)
function getOpenCountdown(product: Product, offsetMs: number = 0): string | null {
  if (!product.sellTime) return null;
  // 대상 시간을 KST 기준으로 생성
  const iso = `${product.sellDate}T${product.sellTime.slice(0, 5)}:00+09:00`;
  const target = new Date(iso);
  const now = getKstNowDate(offsetMs);
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const totalMinutes = Math.floor(diffMs / 60000);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function ReservePage() {

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

  // 닉네임 + 모달
  const [nickname, setNickname] = useState<string>(() => {
    const saved = localStorage.getItem('nickname');
    return saved && saved.trim() ? saved : '신규 고객';
  });
  const [nickModalOpen, setNickModalOpen] = useState(false);
  const [draftNick, setDraftNick] = useState(() => (nickname === '신규 고객' ? '' : nickname));
  const [savingNick, setSavingNick] = useState(false);
  const nickInputRef = useRef<HTMLInputElement>(null);

  // 검색 모달 상태
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // 사용자 메시지 dialog 상태
  const [messageDialog, setMessageDialog] = useState<{
    isOpen: boolean;
    messageId: number | null;
    title: string;
    body: string;
  }>({ isOpen: false, messageId: null, title: '', body: '' });

  // 예약 처리 중인 상품 ID 추적
  const [reservingProductId, setReservingProductId] = useState<number | null>(null);

  // 이용제한 상태
  const [restricted, setRestricted] = useState(false);

  // 예약 완료 다이얼로그
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryMinAmount, setDeliveryMinAmount] = useState<number | null>(null);
  const [reservedProduct, setReservedProduct] = useState<{ name: string; quantity: number; deliveryAvailable: boolean } | null>(null);

  // 모달(상세/닉네임/개인정보/검색/메시지) 오픈 시 백그라운드 스크롤 잠금
  useEffect(() => {
    const anyOpen = detailDialog.isOpen || nickModalOpen || searchModalOpen || messageDialog.isOpen;
    if (anyOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev || '';
      };
    }
  }, [detailDialog.isOpen, nickModalOpen, searchModalOpen, messageDialog.isOpen]);
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
      if (searchModalOpen) {
        setSearchModalOpen(false);
        return;
      }
      if (messageDialog.isOpen) {
        const messageId = messageDialog.messageId;
        setMessageDialog({ isOpen: false, messageId: null, title: '', body: '' });
        if (messageId) {
          markMessageAsRead(messageId).catch(e => safeErrorLog(e, 'ProductsPage - markMessageAsRead'));
        }
        return;
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [detailDialog.isOpen, nickModalOpen, searchModalOpen, messageDialog.isOpen]);

  // 날짜 탭
  const dates = useMemo(() => getNext10Days(), []);
  const [activeDate, setActiveDate] = useState<string>(dates[0]);

  // 검색어 (상품명)
  const [search, setSearch] = useState('');

  // 임시 검색어 (모달에서 입력 중인 검색어)
  const [tempSearch, setTempSearch] = useState('');

  // 활성화된 카테고리 ID (null = 전체)
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  // 활성화된 추천 검색 칩 (화면 표시용)
  const [activeChip, setActiveChip] = useState<string | null>(null);

  // 추천 카테고리 타입
  type CategoryItem = { id: number; keyword: string; keywordUrl?: string };
  const [recommendedKeywords, setRecommendedKeywords] = useState<CategoryItem[]>([]);

  // 선택된 날짜의 상품 목록 표시 상태
  const [selectedDateForProducts, setSelectedDateForProducts] = useState<string | null>(null);

  // 초기화 버튼 진동 애니메이션 트리거
  const [shakeButton, setShakeButton] = useState(false);

  // 실시간 카운트다운 갱신용 틱 (1초 간격)
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  // 서버 시간 동기화 오프셋 (ms)
  const [timeOffsetMs, setTimeOffsetMs] = useState<number>(0);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 추천 카테고리 로드
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getProductKeywords();
        if (data && Array.isArray(data.response)) {
          // 카테고리 배열 (id, name, imageUrl 또는 이전 형식 모두 지원)
          const list = data.response.map((item: any) => {
            if (typeof item === 'string') {
              return { id: 0, keyword: item, keywordUrl: undefined };
            }
            return {
              id: item.id || 0,
              keyword: item.name || item.keyword || '',
              keywordUrl: item.image_url || item.imageUrl || item.keywordUrl || item.keyword_url || undefined,
            };
          });
          setRecommendedKeywords(list);
        }
      } catch (e) {
        console.error('카테고리 불러오기 실패:', e);
      }
    };
    fetchCategories();
  }, []);

  // 초기화 버튼이 활성화되었을 때 주기적으로 진동 애니메이션 표시
  useEffect(() => {
    if (!search) return; // 검색어가 없으면 초기화 버튼이 아니므로 무시

    const interval = setInterval(() => {
      setShakeButton(true);
      setTimeout(() => setShakeButton(false), 500);
    }, 3000); // 3초마다 반복

    return () => clearInterval(interval);
  }, [search]);

  // 서버 시간 동기화
  useEffect(() => {
    const syncServerTime = async () => {
      try {
        const serverTime = await getServerTime();

        const offset = serverTime - Date.now();

        setTimeOffsetMs(offset);
      } catch (e) {
        console.error('서버 시간 동기화 실패:', e);
        setTimeOffsetMs(0);
      }
    };

    // 초기 동기화
    syncServerTime();

    // 5분마다 재동기화
    const interval = setInterval(syncServerTime, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
          // 한국 시간(KST) 기준 마감 시간 이후면 다음날부터 10일 범위 요청
          const kstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
          const start = new Date(kstNow);
          const [dh, dm] = (theme.config.reservationDeadline ?? '19:30').split(':').map(Number);
          if (kstNow.getHours() > dh || (kstNow.getHours() === dh && kstNow.getMinutes() >= dm)) {
            start.setDate(start.getDate() + 1);
          }
          const fromStr = formatKstYmd(start);
          const toDate = new Date(start);
          toDate.setDate(start.getDate() + MAX_DAYS - 1);
          const toStr = formatKstYmd(toDate);

          const res = await getProducts(fromStr, toStr, activeCategoryId ?? undefined);
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
            quantity: 0,
            price: p.price,
            stock: p.stock,
            imageUrl: p.image_url ? `${theme.config.imgUrl}/${p.image_url}` : p.imageUrl,
            // sell_date 필드명으로 매핑
            sellDate: p.sell_date || p.sellDate || dates[i % dates.length],
            // 누적 판매량 필드명: total_sold
            totalSold: p.total_sold ?? 0,
            orderIndex: p.order_index ?? 0,
            sellTime: p.sell_time || p.sellTime, // 선택적 시간 필드 매핑
            deliveryAvailable: typeof p.delivery_available === 'boolean'
              ? Boolean(p.delivery_available)
              : (typeof p.deliveryAvailable === 'boolean' ? Boolean(p.deliveryAvailable) : true),
          })));
        } catch (e: any) {
          safeErrorLog(e, 'ShopPage - loadProducts');
          show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
        }
      }
    };
    loadProducts();
  }, [show, dates, activeCategoryId]);

  // 사용자 메시지 확인 (페이지 진입 시)
  useEffect(() => {
    const checkUserMessage = async () => {
      if (USE_MOCKS) {
        // Mock에서는 메시지 없음
        return;
      }

      try {
        const message = await getUserMessage();
        if (message && message.id) {
          setMessageDialog({
            isOpen: true,
            messageId: message.id,
            title: message.title,
            body: message.body
          });
        }
      } catch (e) {
        safeErrorLog(e, 'ProductsPage - checkUserMessage');
        // 메시지 확인 실패는 무시 (사용자에게 표시 안 함)
      }
    };

    checkUserMessage();
  }, []);

  // 사용자 정보 동기화 (닉네임 + 이용제한)
  useEffect(() => {
    const syncUserMe = async () => {
      if (USE_MOCKS) return;
      try {
        const me = await getUserMe();
        if (me.nickname && me.nickname.trim()) {
          localStorage.setItem('nickname', me.nickname);
          setNickname(me.nickname);
        }
        setRestricted(me.restricted);
        if (me.restricted && me.restrictedUntil) {
          const formatted = me.restrictedUntil.replace(/-/g, '/');
          show(`${formatted}까지 이용이 제한되었습니다.`, { variant: 'error' });
        }
      } catch (e) {
        safeErrorLog(e, 'ProductsPage - syncUserMe');
      }
    };
    syncUserMe();
  }, []);

  const productsOfDay = useMemo(
    () => {
      const filtered = products.filter(p => p.sellDate === activeDate);

      // 검색어 필터링
      const searchQuery = search.trim().toLowerCase();
      const searchFiltered = searchQuery === '' ? filtered :
        filtered.filter(p => p.name.toLowerCase().includes(searchQuery));

      // 정렬 우선순위: 판매 가능 > 오픈예정(가까운 시간순) > 품절
      return searchFiltered.sort((a, b) => {
        const rank = (p: Product) => {
          if (p.stock === 0) return 2; // 품절
          return isReservationTimeOpen(p, timeOffsetMs) ? 0 : 1; // 판매 가능:0, 오픈예정:1
        };

        const rankA = rank(a);
        const rankB = rank(b);
        if (rankA !== rankB) return rankA - rankB;

        // 동순위 세부 정렬
        if (rankA === 0) {
          // 판매 가능: 기존 로직 유지
          if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
            if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex; // asc
          } else if (a.orderIndex !== undefined || b.orderIndex !== undefined) {
            return a.orderIndex !== undefined ? -1 : 1;
          }
          if ((a.totalSold || 0) !== (b.totalSold || 0)) {
            return (b.totalSold || 0) - (a.totalSold || 0); // desc
          }
          return (b.stock - b.quantity) - (a.stock - a.quantity); // 남은 재고 desc
        }

        if (rankA === 1) {
          // 오픈예정: 시간 가까운 순
          const timeA = (a.sellTime || '99:99').slice(0, 5);
          const timeB = (b.sellTime || '99:99').slice(0, 5);
          if (timeA !== timeB) return timeA.localeCompare(timeB);
          // 보조 기준: orderIndex asc
          if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
            if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
          } else if (a.orderIndex !== undefined || b.orderIndex !== undefined) {
            return a.orderIndex !== undefined ? -1 : 1;
          }
          return 0;
        }

        // 품절끼리: orderIndex asc, 그다음 누적 판매량 desc
        if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
          if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
        } else if (a.orderIndex !== undefined || b.orderIndex !== undefined) {
          return a.orderIndex !== undefined ? -1 : 1;
        }
        if ((a.totalSold || 0) !== (b.totalSold || 0)) {
          return (b.totalSold || 0) - (a.totalSold || 0);
        }
        return 0;
      });
    },
    [products, activeDate, search]
  );
  const countOf = (date: string) => {
    const filtered = products.filter(p => p.sellDate === date);

    // 검색어 필터링
    const searchQuery = search.trim().toLowerCase();
    const searchFiltered = searchQuery === '' ? filtered :
      filtered.filter(p => p.name.toLowerCase().includes(searchQuery));

    return searchFiltered.length;
  };

  // 검색어 없이 상품이 있는 날짜만 필터링 (칩 표시용)
  const allProductDates = useMemo(() => {
    return dates.filter(d => {
      const filtered = products.filter(p => p.sellDate === d);
      return filtered.length > 0;
    });
  }, [dates, products]);

  // 임시 검색어로 필터링된 상품 목록 (모달에서 미리보기용)
  const getFilteredProductsByDate = (searchQuery: string) => {
    const query = searchQuery.trim().toLowerCase();
    if (query === '') return products;

    return products.filter(p => p.name.toLowerCase().includes(query));
  };

  // 날짜별 필터링된 상품 개수
  const getFilteredCountByDate = (date: string, searchQuery: string) => {
    const filteredProducts = getFilteredProductsByDate(searchQuery);
    return filteredProducts.filter(p => p.sellDate === date).length;
  };

  // 선택된 날짜의 필터링된 상품 목록
  const getFilteredProductsForDate = (date: string, searchQuery: string) => {
    const filteredProducts = getFilteredProductsByDate(searchQuery);
    return filteredProducts.filter(p => p.sellDate === date);
  };

  // 검색어 하이라이트 함수
  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;

    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 px-1 rounded">{part}</mark>
      ) : part
    );
  };

  // 검색 모달 열기/닫기
  const openSearchModal = (keyword?: string) => {
    setTempSearch(keyword || search); // keyword가 있으면 그걸로, 없으면 현재 검색어를 임시 검색어로 설정
    setSearchModalOpen(true);
    window.history.pushState({ modal: 'search' }, '');
  };

  const handleOpenSearchModalClick = () => {
    openSearchModal();
  };

  const closeSearchModal = () => {
    setSearchModalOpen(false);
    setTempSearch(''); // 임시 검색어 초기화
  };

  // 검색 결과가 있는 가장 가까운 날짜 찾기
  const findClosestDateWithResults = (searchQuery: string) => {
    const query = searchQuery.trim().toLowerCase();
    if (query === '') return null;

    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(query));
    if (filteredProducts.length === 0) return null;

    // 검색 결과가 있는 날짜들
    const datesWithResults = filteredProducts.map(p => p.sellDate);
    const uniqueDates = [...new Set(datesWithResults)];

    if (uniqueDates.length === 0) return null;

    // 현재 활성 날짜와의 거리 계산
    const currentDateIndex = dates.indexOf(activeDate);
    let closestDate = uniqueDates[0];
    let minDistance = Math.abs(dates.indexOf(closestDate) - currentDateIndex);

    for (const date of uniqueDates) {
      const distance = Math.abs(dates.indexOf(date) - currentDateIndex);
      if (distance < minDistance) {
        minDistance = distance;
        closestDate = date;
      }
    }

    return closestDate;
  };

  // 검색 적용
  const applySearch = () => {
    setSearch(tempSearch);
    setSearchModalOpen(false);

    // tempSearch가 추천 키워드인지 확인하여 activeChip 설정
    const keywordStrings = recommendedKeywords.map(k => k.keyword);
    setActiveChip(keywordStrings.includes(tempSearch) ? tempSearch : null);

    // 검색 결과가 있으면 해당 날짜로 이동
    const closestDate = findClosestDateWithResults(tempSearch);
    if (closestDate) {
      setActiveDate(closestDate);
    }
  };

  // 검색 초기화
  const clearSearch = () => {
    setSearch('');
    setTempSearch('');
    setActiveChip(null);
  };

  // 상품이 있는 날짜만 노출
  const availableDates = useMemo(() => dates.filter(d => countOf(d) > 0), [dates, products, search]);

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
    // 이미 예약 처리 중인 경우 무시
    if (reservingProductId !== null) return;

    try {
      setReservingProductId(product.id);

      if (product.quantity <= 0) {
        show('1개 이상 선택해주세요.', { variant: 'error' });
        return;
      }
      if (product.quantity > product.stock) {
        show('재고보다 많이 예약할 수 없어요.', { variant: 'error' });
        return;
      }
      if (USE_MOCKS) {
        // Mock 예약 처리
        await new Promise(resolve => setTimeout(resolve, 500));

        // Mock 모드에서도 실제 API와 동일한 응답 구조 가정
        const mockReservationResponse = {
          id: Date.now(), // Mock용 예약 ID
          status: 'success'
        };

        show(`${product.name} ${product.quantity}개 예약 완료!`, { variant: 'info' });

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

        const reservationResponse = await res.json();

        // API 응답에서 예약 ID 추출 (443이 오는 경우)
        let reservationId = null;
        if (reservationResponse && typeof reservationResponse === 'object') {
          // 객체인 경우 다양한 필드에서 ID 추출
          reservationId = reservationResponse.id ||
            reservationResponse.reservation_id ||
            reservationResponse.reservationId ||
            null;
        } else if (typeof reservationResponse === 'number') {
          // 숫자 ID가 직접 오는 경우 (예: 443)
          reservationId = reservationResponse;
        }

        // reservationId가 없으면 에러 처리
        if (!reservationId) {
          show('예약 ID를 찾을 수 없습니다. 관리자에게 문의해주세요.', { variant: 'error' });
        } else {
          show(`${product.name} ${product.quantity}개 예약 완료!`, { variant: 'info' });

          // 성공 시 재고 차감
          setProducts(prev =>
            prev.map(p =>
              p.id === product.id ? { ...p, stock: p.stock - product.quantity } : p
            )
          );

          // 예약 완료 다이얼로그 표시
          setReservedProduct({ name: product.name, quantity: product.quantity, deliveryAvailable: product.deliveryAvailable !== false });
          try {
            const config = await getDeliveryConfig();
            if (config?.enabled) {
              setDeliveryMinAmount(config.minAmount);
            }
          } catch {
            // 배달 설정 조회 실패 시 배달 버튼 미표시
          }
          setDeliveryDialogOpen(true);
        }
      }
    } catch (e: any) {
      safeErrorLog(e, 'ProductsPage - handleReserve');
      show(getSafeErrorMessage(e, '예약 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setReservingProductId(null);
    }
  };

  const prettyKdate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    const w = '일월화수목금토'[d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}(${w})`;
  };

  const prettydate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const prettyDay = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return '일월화수목금토'[d.getDay()] + '요일';
  };


  // 닉네임 모달
  const openNickModal = () => {
    setDraftNick(nickname === '신규 고객' ? '' : nickname);
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
      try { sessionStorage.removeItem('force_nickname_change'); } catch { }
      try { localStorage.removeItem('force_nickname_change'); } catch { }
      // nav state 정리
      if (fromNav) {
        try { window.history.replaceState({}, ''); } catch { }
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
    <main className="bg-[#f6f6f6] min-h-screen flex flex-col items-center px-4 sm:px-6 lg:px-8 pt-16 pb-24">
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {/* 중: 로고 이미지 (클릭 시 메인으로 이동) */}
          <div className="flex-1 flex flex-col items-center leading-tight">
            <button
              type="button"
              onClick={() => nav('/products')}
              className="hover:opacity-80"
              aria-label="메인으로 이동"
            >
              <img src={logoText} alt={theme.displayName} className="h-8 object-contain" />
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
              {theme.links.kakaoOpenChat && (
                <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                  href={theme.links.kakaoOpenChat} target="_blank" rel="noreferrer">카카오톡 오픈채팅</a>
              )}
              {theme.links.kakaoSupport && (
                <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                  href={theme.links.kakaoSupport} target="_blank" rel="noreferrer">{theme.displayName} 문제해결사</a>
              )}
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                href={`tel:${theme.contact.phone.replace(/-/g, '')}`}>점장 문의</a>
              {theme.links.directions && (
                <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                  href={theme.links.directions} target="_blank" rel="noreferrer">찾아오시는 길</a>
              )}
            </nav>

            <div className="mt-6 text-xs text-gray-400">{theme.copyright}</div>

            {/* Footer 내용을 aside로 이동 */}
            <div className="mt-6 text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-gray-500">{theme.displayName}</p>
              <p>대표: {theme.contact.representative}</p>
              <p>사업자등록번호: {theme.contact.businessNumber}</p>
              {theme.contact.address && <p>주소: {theme.contact.address}</p>}
              <p>문의: {theme.contact.phone}</p>
              <p className="mt-1">&copy; 2025 All rights reserved.</p>
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
        <div className="bg-white p-2 rounded-lg shadow mb-1 text-center">
          {!theme.config.hideTagline && <h1 className="text-base font-bold text-gray-800">{theme.tagline}</h1>}
          <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-center">

            <p className="text-sm text-orange-800 font-medium flex items-center justify-center gap-1">
              <span className="text-orange-600">⚠</span>
              <span>판매일 <strong className="text-orange-900">{theme.config.pickupDeadline.split(':')[0]}시까지 매장을 방문</strong>하셔야</span>
            </p>
            <p className="text-sm text-orange-800 font-medium flex items-center justify-center gap-1">
              <span><strong className="text-orange-900">예약 상품 구매가 가능</strong>합니다</span>
            </p>

            <p className="text-xs text-orange-900 mt-0.5 text-center">
              [{theme.config.pickupDeadline.split(':')[0]}시 기준 미수령 예약 자동 취소]
            </p>
          </div>
          <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
              <span className="text-xs font-medium text-green-700">
                <strong>[{prettydate(activeDate)} {prettyDay(activeDate)}]</strong> 매장 판매 상품이에요
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
              <span className="text-xs font-medium text-green-700">
                예약 마감 <strong>[{theme.config.reservationDeadline}]</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">

              <span className="text-xs font-medium text-green-700">

                ※ <strong>[{theme.config.cancellationDeadline}] 이후에는 예약 수정/취소가 불가능합니다</strong>

              </span>
            </div>
          </div>
        </div>
        {/* 수령 가능 안내 문구 */}





        {/* 날짜 탭 + 검색 칩 (항상 표시) */}
        <div className="sticky top-14 z-30 bg-white p-2 rounded-lg shadow mt-2 mb-4">
          <div className="flex items-center justify-start gap-2 overflow-x-auto pl-3 pr-3">
            {availableDates.length > 0 ? availableDates.map(date => {
              const active = activeDate === date;
              return (
                <button
                  key={date}
                  onClick={() => {
                    setActiveDate(date);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={
                    'px-2 py-1.5 rounded-lg border text-xs whitespace-nowrap transition ' +
                    (active
                      ? 'bg-orange-500 text-white border-orange-500 shadow'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')
                  }
                >
                  <div className="font-semibold text-xs">{prettyKdate(date)}</div>
                  <div className={`text-[11px] mt-0.5 text-center ${active ? 'text-white/90' : 'text-gray-600'}`}>
                    {countOf(date)}개 예약중
                  </div>
                </button>
              );
            }) : (
              <div className="text-gray-400 text-xs py-2">
                {allProductDates.length === 0 ? '판매 예정 상품 준비 중' : '카테고리에 해당하는 상품이 없습니다'}
              </div>
            )}
          </div>
          {/* 검색 칩 */}
          <div className="mt-2 px-3 pb-2">
            <div className="grid grid-cols-5 gap-y-3 gap-x-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  clearSearch();
                  setActiveCategoryId(null); // 카테고리 필터도 초기화
                }}
                className="flex flex-col items-center gap-1"
              >
                <div className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-colors ${!activeChip ? 'border-orange-500' : 'border-gray-200'}`}>
                  <img src={defaultKeywordImage} alt="ALL" className="w-full h-full object-contain p-2 bg-gray-50" />
                </div>
                <span className={`text-xs font-medium whitespace-nowrap ${!activeChip ? 'text-orange-500' : 'text-gray-700'}`}>
                  ALL
                </span>
              </button>
              {((recommendedKeywords.length > 0 ? recommendedKeywords : [
                { id: 0, keyword: '케이크', keywordUrl: undefined },
                { id: 0, keyword: '할인', keywordUrl: undefined },
                { id: 0, keyword: '딸기', keywordUrl: undefined },
                { id: 0, keyword: '특가', keywordUrl: undefined }
              ]).filter(k => k.keyword !== 'ALL')).map(item => {
                const isActive = activeChip === item.keyword;
                return (
                  <button
                    key={item.keyword}
                    onClick={(e) => {
                      e.preventDefault();
                      if (isActive) {
                        // 칩 선택 해제 → 전체 상품 조회
                        setActiveChip(null);
                        setActiveCategoryId(null);
                      } else {
                        // 칩 선택 → 카테고리 ID로 상품 조회
                        setActiveChip(item.keyword);
                        setActiveCategoryId(item.id || null);
                      }
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    {/* 이미지 원형 */}
                    <div className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-colors ${isActive ? 'border-orange-500' : 'border-gray-200'
                      }`}>
                      {item.keywordUrl ? (
                        <img src={item.keywordUrl} alt={item.keyword} className="w-full h-full object-cover" />
                      ) : (
                        <img src={defaultKeywordImage} alt={item.keyword} className="w-full h-full object-contain p-1" />
                      )}
                    </div>
                    {/* 키워드 텍스트 */}
                    <span className={`text-xs font-medium whitespace-nowrap ${isActive ? 'text-orange-500' : 'text-gray-700'
                      }`}>
                      {item.keyword}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 전체 비어있을 때 안내 */}
        {allProductDates.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            현재 예약중인 상품이 없습니다.
          </div>
        )}

        {/* 필터링 결과 없음 (검색어 없는 경우 - 카테고리 등) */}
        {allProductDates.length > 0 && availableDates.length === 0 && !search && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            조회된 상품이 없습니다.
            <div className="text-xs text-gray-400 mt-2">다른 카테고리를 선택해 보세요.</div>
          </div>
        )}

        {/* 검색 결과 없음 */}
        {allProductDates.length > 0 && availableDates.length === 0 && search && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            <div className="text-sm">
              <span
                className="font-medium text-orange-600 cursor-pointer hover:underline"
                onClick={clearSearch}
                role="button"
                aria-label="필터 초기화"
              >
                "{search}"
              </span>
              상품이 존재하지 않습니다.
            </div>
            <div className="text-xs text-gray-400 mt-1"
              onClick={clearSearch}
              role="button"
              aria-label="필터 초기화"
            >
              <strong
                className="font-medium text-red-500 cursor-pointer hover:underline decoration-red-400"
              >
                초기화
              </strong>
              를 눌러 모든 상품을 볼 수 있습니다.
            </div>
          </div>
        )}

        {/* 이용제한 안내 */}
        {restricted && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center mb-6">
            <p className="text-red-700 font-medium">이용이 제한된 계정입니다.</p>
            <p className="text-red-500 text-sm mt-1">제한 기간 동안 상품 예약이 불가합니다.</p>
          </div>
        )}

        {/* 상품 목록(선택 날짜) */}
        {!restricted && availableDates.length > 0 && (
          <div className="space-y-4 mb-6">
            {productsOfDay.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border-2 p-3 shadow-sm"
                style={{
                  borderColor: 'var(--color-primary-500)',
                  backgroundColor: 'var(--color-primary-50)',
                }}
              >
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full aspect-[5/3] object-cover cursor-pointer rounded-lg border"
                  onClick={() => openDetail(item.id)}
                  role="button"
                  aria-label={`${item.name} 상세보기`}
                />
                <div className="mt-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2
                      className="font-semibold cursor-pointer flex-1 text-[clamp(0.95rem,4vw,1.15rem)] leading-tight"
                      onClick={() => openDetail(item.id)}
                      role="button"
                    >
                      <span className="hover:underline">{highlightSearchTerm(item.name, search)}</span>
                    </h2>
                    <span className="text-[clamp(0.95rem,4vw,1.15rem)] text-orange-500 font-semibold flex-shrink-0">{formatPrice(item.price)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      {item.deliveryAvailable === false && (
                        <span className="text-[11px] bg-rose-100 text-rose-700 border border-rose-300 px-2 py-0.5 rounded-full">배달 불가</span>
                      )}
                      {item.stock > 0 && (
                        <span className="text-xs">
                          {(item.stock - item.quantity) === 0 ? '재고를 모두 담았어요!' : `${item.stock - item.quantity}개 남았어요!`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr,auto] gap-2">
                    <div className="flex items-center border rounded overflow-hidden h-9 bg-white">
                      <button
                        onClick={() => handleQuantity(item.id, -1)}
                        className="w-10 h-full bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30"
                        disabled={item.quantity <= 0}
                        aria-label="수량 감소"
                      >
                        -
                      </button>
                      <span className="flex-1 text-center text-sm">{item.quantity}</span>
                      <button
                        onClick={() => handleQuantity(item.id, 1)}
                        className="w-10 h-full bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30"
                        disabled={item.quantity >= item.stock}
                        aria-label="수량 증가"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => openDetail(item.id)}
                        className="h-9 px-3 rounded border border-gray-300 hover:bg-gray-50 text-sm font-medium"
                        type="button"
                      >
                        상세
                      </button>
                      <button
                        onClick={() => handleReserve(item)}
                        disabled={item.stock === 0 || !isReservationTimeOpen(item, timeOffsetMs) || reservingProductId !== null}
                        className={`h-9 px-4 rounded text-sm font-medium ${item.stock === 0 || !isReservationTimeOpen(item, timeOffsetMs) || reservingProductId !== null ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}
                      >
                        {item.stock === 0
                          ? '품절'
                          : (reservingProductId !== null
                            ? '예약 중'
                            : (isReservationTimeOpen(item, timeOffsetMs)
                              ? '예약하기'
                              : `${(item.sellTime || '00:00').slice(0, 5)} 오픈`))}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </section>
      <BottomNav />

      {/* FAB 통합 검색/필터 초기화 버튼 */}
      <button
        onClick={search ? clearSearch : handleOpenSearchModalClick}
        className={`fixed bottom-[64px] right-4 z-30 bg-white text-gray-800 rounded-full shadow-lg flex items-center gap-2 px-4 py-3 transition-all duration-200 hover:scale-105 active:scale-95 ${search ? 'border border-blue-500' : 'border-2 border-blue-500'
          } ${shakeButton ? 'animate-shake' : ''}`}
        aria-label={search ? "필터 초기화" : "상품 검색"}
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

      {/* 상품 상세 Dialog */}
      {detailDialog.isOpen && (
        <ProductDetailPage
          isOpen={detailDialog.isOpen}
          onClose={() => setDetailDialog({ isOpen: false, productId: 0 })}
          productId={detailDialog.productId}
        />
      )}

      {/* 예약 완료 후 액션 다이얼로그 */}
      {deliveryDialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeliveryDialogOpen(false)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl p-6 text-center">
            <div className="text-3xl mb-3">🎉</div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">예약이 완료되었습니다!</h3>
            {reservedProduct && (
              <p className="text-sm text-gray-600 mb-4">{reservedProduct.name} {reservedProduct.quantity}개</p>
            )}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setDeliveryDialogOpen(false)}
                className="w-full h-12 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <span>🛒</span> 계속 둘러보기
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeliveryDialogOpen(false);
                  nav('/me/orders');
                }}
                className="w-full h-12 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
              >
                <span>📋</span> 주문 내역 보기
              </button>
              {deliveryMinAmount != null && reservedProduct?.deliveryAvailable && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryDialogOpen(false);
                      nav('/me/delivery');
                    }}
                    className="w-full h-12 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <span>🚚</span> 맛집퀵 배달하기
                  </button>
                  <p className="text-xs text-gray-400 mt-1">
                    {deliveryMinAmount > 0 && <>{deliveryMinAmount.toLocaleString()}원 이상 예약 시 배달 가능 · </>}배달 불가 상품 제외
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />

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
              <h2 className="text-lg font-semibold text-gray-800">상품 검색</h2>
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
                  placeholder="상품명을 입력하세요 (예: 토마토, 사과)"
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

            {/* 날짜별 검색 결과 미리보기 */}
            {tempSearch && !selectedDateForProducts && (
              <div className="px-4 pb-4">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableDates.map(date => {
                    const count = getFilteredCountByDate(date, tempSearch);
                    if (count === 0) return null;

                    return (
                      <div
                        key={date}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => {
                          setSelectedDateForProducts(date);
                        }}
                      >
                        <div className="text-sm font-medium text-gray-800">
                          {prettyKdate(date)}
                        </div>
                        <div className="text-sm text-orange-600 font-semibold">
                          {count}개 상품
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 검색 결과 없음 */}
                {availableDates.every(date => getFilteredCountByDate(date, tempSearch) === 0) && (
                  <div className="text-center text-gray-500 py-6">
                    <div className="text-sm">
                      <span className="font-medium text-orange-600">"{tempSearch}"</span>상품이 존재하지 않습니다.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 선택된 날짜의 상품 목록 */}
            {selectedDateForProducts && (
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-gray-700">
                    {prettyKdate(selectedDateForProducts)} 상품 목록
                  </div>
                  <button
                    onClick={() => setSelectedDateForProducts(null)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    ← 뒤로
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {getFilteredProductsForDate(selectedDateForProducts, tempSearch).map(product => (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => {
                        // 해당 상품의 이름으로 정확한 검색 적용
                        setSearch(product.name);
                        setActiveDate(product.sellDate);
                        setSearchModalOpen(false);
                        setSelectedDateForProducts(null);
                      }}
                    >
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-12 h-12 rounded object-cover border"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">
                          {highlightSearchTerm(product.name, tempSearch)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {product.price.toLocaleString()}원
                        </div>
                      </div>
                      <div className="text-xs text-orange-600 font-semibold">
                        {product.stock > 0 ? '재고 있음' : '품절'}
                      </div>
                    </div>
                  ))}
                </div>
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

      {/* 사용자 메시지 Dialog */}
      {messageDialog.isOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          aria-modal="true"
          role="dialog"
        >
          <div className="absolute inset-0 bg-black/40" onClick={async () => {
            const messageId = messageDialog.messageId;
            setMessageDialog({ isOpen: false, messageId: null, title: '', body: '' });
            if (messageId) {
              try {
                await markMessageAsRead(messageId);
              } catch (e) {
                safeErrorLog(e, 'ProductsPage - markMessageAsRead');
              }
            }
          }} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{messageDialog.title}</h3>
            <p className="text-gray-700 mb-6 whitespace-pre-line" dangerouslySetInnerHTML={{ __html: messageDialog.body.replace(/\n/g, '<br/>') }} />
            <div className="flex justify-end">
              <button
                onClick={async () => {
                  const messageId = messageDialog.messageId;
                  setMessageDialog({ isOpen: false, messageId: null, title: '', body: '' });

                  if (messageId) {
                    try {
                      await markMessageAsRead(messageId);
                    } catch (e) {
                      safeErrorLog(e, 'ProductsPage - markMessageAsRead');
                      // 읽음 처리 실패는 무시
                    }
                  }
                }}
                className="px-6 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium"
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
