import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import {
  getRecommendedCourierProducts,
  searchCourierProducts,
  getCourierProductsByCategory,
  getCourierConfig,
  getUserMe,
  modifyName,
  checkNameExists,
} from '../../utils/api';
import CourierBottomNav from '../../components/shop/CourierBottomNav';
import { theme, logoText } from '../../brand';
import Footer from '../../components/Footer';
import CourierProductDetailPage from './CourierProductDetailPage';

type CourierProduct = {
  id: number;
  name: string;
  price: number;
  soldOut?: boolean;
  imageUrl: string;
  weight?: string;
  totalSold?: number;
  orderIndex?: number;
};

type CategoryGroup = {
  categoryId: number;
  categoryName: string;
  products: CourierProduct[];
};

type ViewMode = 'main' | 'search';

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return IMG_BASE ? `${IMG_BASE}/${url}` : url;
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const mapProduct = (p: any): CourierProduct => ({
  id: Number(p.id),
  name: String(p.name ?? ''),
  price: Number(p.price ?? 0),
  soldOut: p.sold_out === true || p.soldOut === true,
  imageUrl: addImgPrefix(p.product_url ?? p.image_url ?? p.imageUrl ?? ''),
  weight: p.weight ?? undefined,
  totalSold: p.total_sold ?? p.totalSold ?? 0,
  orderIndex: p.sort_order ?? p.order_index ?? p.orderIndex ?? 0,
});

// ── Product card (2-col grid, store-style colors) ────────────────────────────
function ProductCard({ product, onClick }: { product: CourierProduct; onClick: () => void }) {
  return (
    <div
      className="rounded-lg border overflow-hidden shadow-sm cursor-pointer transition-all duration-200 active:scale-[0.97]"
      style={{ borderColor: 'var(--color-primary-500)', backgroundColor: 'var(--color-primary-50)' }}
      onClick={onClick}
      role="button"
      aria-label={`${product.name} 상세 보기`}
    >
      <div className="relative w-full aspect-square bg-gray-100">
        <img
          src={product.imageUrl}
          alt={product.name}
          className={`w-full h-full object-cover${product.soldOut ? ' opacity-40' : ''}`}
          loading="lazy"
        />
        {product.soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full">품절</span>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="text-sm font-medium text-gray-800 leading-tight line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>
        <div className="mt-1 text-sm font-bold" style={{ color: 'var(--color-primary-700)' }}>
          {formatPrice(product.price)}
        </div>
      </div>
    </div>
  );
}

// ── List skeleton ─────────────────────────────────────────────────────────────
function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow animate-pulse p-2.5">
          <div className="flex gap-3">
            <div className="w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div
      className="bg-white rounded-lg shadow-sm border p-10 text-center text-gray-500 mt-4"
      style={{ borderColor: 'var(--color-primary-100)' }}
    >
      <svg
        className="mx-auto mb-3 w-12 h-12"
        style={{ color: 'var(--color-primary-300)' }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
      <p className="text-sm font-medium text-gray-600">등록된 상품이 없습니다</p>
      <p className="text-xs text-gray-400 mt-1">곧 새로운 상품이 등록될 예정입니다.</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CourierShopPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailDialog, setDetailDialog] = useState<{ isOpen: boolean; productId: number }>({ isOpen: false, productId: 0 });

  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CourierProduct[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<CourierProduct[]>([]);
  const [categoryProducts, setCategoryProducts] = useState<CategoryGroup[]>([]);
  const [selectedChip, setSelectedChip] = useState<null | 'recommended' | number>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [tempSearch, setTempSearch] = useState('');
  const [shakeButton, setShakeButton] = useState(false);
  const [modalSearchResults, setModalSearchResults] = useState<CourierProduct[]>([]);
  const [modalSearchLoading, setModalSearchLoading] = useState(false);

  // ── Nickname state ────────────────────────────────────────────────────
  const [nickname, setNickname] = useState<string>(() => {
    const saved = localStorage.getItem('nickname');
    return saved && saved.trim() ? saved : '신규 고객';
  });
  const [nickModalOpen, setNickModalOpen] = useState(false);
  const [draftNick, setDraftNick] = useState(() => (nickname === '신규 고객' ? '' : nickname));
  const [savingNick, setSavingNick] = useState(false);
  const nickInputRef = useRef<HTMLInputElement>(null);

  // ── Fade transition state ──────────────────────────────────────────────────
  const [contentVisible, setContentVisible] = useState(true);
  const prevChipRef = useRef<null | 'recommended' | number>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Popstate handling for dialog ──────────────────────────────────────────
  useEffect(() => {
    const onPop = () => {
      if (detailDialog.isOpen) {
        setDetailDialog({ isOpen: false, productId: 0 });
        return;
      }
      if (searchModalOpen) {
        setSearchModalOpen(false);
        setTempSearch('');
        setModalSearchResults([]);
        return;
      }
      if (nickModalOpen) {
        setNickModalOpen(false);
        return;
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [detailDialog.isOpen, searchModalOpen, nickModalOpen]);

  // ── Body scroll lock when dialog or modal is open ────────────────────────
  useEffect(() => {
    if (detailDialog.isOpen || searchModalOpen || nickModalOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev || ''; };
    }
  }, [detailDialog.isOpen, searchModalOpen, nickModalOpen]);

  // ── Initial load: recommended + by-category in parallel ──────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [recRes, catRes, configData, meData] = await Promise.all([
          getRecommendedCourierProducts(8),
          getCourierProductsByCategory(),
          getCourierConfig().catch(() => null),
          getUserMe().catch(() => null),
        ]);

        if (!alive) return;

        if (configData?.noticeText) {
          setNoticeText(configData.noticeText);
        }

        // Nickname sync
        if (meData) {
          if (meData.nickname && meData.nickname.trim()) {
            localStorage.setItem('nickname', meData.nickname);
            setNickname(meData.nickname);
          }
          if (!meData.changeName) {
            // Force nickname change modal
            setNickModalOpen(true);
            setDraftNick('');
            setNickname('신규 고객');
          }
        }

        // Recommended
        if (recRes.ok) {
          const recData = await recRes.json();
          const recArr = Array.isArray(recData?.response)
            ? recData.response
            : Array.isArray(recData)
            ? recData
            : [];
          setRecommendedProducts(recArr.map(mapProduct));
        }

        // By category
        if (catRes.ok) {
          const catData = await catRes.json();
          const catArr = Array.isArray(catData?.response)
            ? catData.response
            : Array.isArray(catData)
            ? catData
            : [];
          const groups: CategoryGroup[] = catArr
            .map((g: any) => ({
              categoryId: Number(g.categoryId ?? g.category_id),
              categoryName: String(g.categoryName ?? g.category_name ?? ''),
              products: (g.products as any[]).map(mapProduct),
            }));
          setCategoryProducts(groups);
        }
      } catch (e: any) {
        safeErrorLog(e, 'CourierShopPage - initialLoad');
        if (alive) {
          show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [show]);

  // ── Shake animation for active search FAB ─────────────────────────────────
  useEffect(() => {
    if (!searchQuery) return;
    const interval = setInterval(() => {
      setShakeButton(true);
      setTimeout(() => setShakeButton(false), 500);
    }, 3000);
    return () => clearInterval(interval);
  }, [searchQuery]);

  // ── Modal search debounce ─────────────────────────────────────────────────
  const handleTempSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setTempSearch(q);

    if (modalDebounceRef.current) clearTimeout(modalDebounceRef.current);

    if (q.trim() === '') {
      setModalSearchResults([]);
      return;
    }

    modalDebounceRef.current = setTimeout(async () => {
      try {
        setModalSearchLoading(true);
        const res = await searchCourierProducts(q.trim());
        if (!res.ok) return;
        const data = await res.json();
        const arr = Array.isArray(data?.response)
          ? data.response
          : Array.isArray(data)
          ? data
          : [];
        setModalSearchResults(arr.map(mapProduct));
      } catch (e: any) {
        safeErrorLog(e, 'CourierShopPage - modalSearch');
      } finally {
        setModalSearchLoading(false);
      }
    }, 400);
  };

  const openSearchModal = () => {
    setTempSearch(searchQuery);
    setModalSearchResults([]);
    setSearchModalOpen(true);
    window.history.pushState({ modal: 'search' }, '');
    setTimeout(() => modalInputRef.current?.focus(), 50);
  };

  const closeSearchModal = () => {
    setSearchModalOpen(false);
    setTempSearch('');
    setModalSearchResults([]);
    if (modalDebounceRef.current) clearTimeout(modalDebounceRef.current);
  };

  const applySearch = () => {
    const q = tempSearch.trim();
    setSearchQuery(q);
    setSearchModalOpen(false);
    setTempSearch('');
    setModalSearchResults([]);
    if (modalDebounceRef.current) clearTimeout(modalDebounceRef.current);

    if (q === '') {
      setSearchResults([]);
      setViewMode('main');
      return;
    }

    // Run the real search and switch to search view
    setViewMode('search');
    setSearchLoading(true);
    searchCourierProducts(q)
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json();
        const arr = Array.isArray(data?.response)
          ? data.response
          : Array.isArray(data)
          ? data
          : [];
        setSearchResults(arr.map(mapProduct));
      })
      .catch(e => {
        safeErrorLog(e, 'CourierShopPage - applySearch');
        show(getSafeErrorMessage(e, '검색 중 오류가 발생했습니다.'), { variant: 'error' });
      })
      .finally(() => setSearchLoading(false));
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setViewMode('main');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const handleChipSelect = (chip: 'recommended' | number) => {
    // Fade out → update → fade in
    setContentVisible(false);
    setTimeout(() => {
      if (selectedChip === chip) {
        setSelectedChip(null);
      } else {
        setSelectedChip(chip);
        setVisibleCount(8);
      }
      prevChipRef.current = chip;
      setContentVisible(true);
    }, 150);
  };

  const handleChipDeselect = () => {
    setContentVisible(false);
    setTimeout(() => {
      setSelectedChip(null);
      prevChipRef.current = null;
      setContentVisible(true);
    }, 150);
  };

  // Lazy rendering: load more when sentinel is visible
  const selectedProducts = selectedChip === 'recommended'
    ? recommendedProducts
    : selectedChip !== null
    ? (categoryProducts.find(g => g.categoryId === selectedChip)?.products ?? [])
    : [];

  const selectedCategoryName = selectedChip === 'recommended'
    ? '추천'
    : selectedChip !== null
    ? (categoryProducts.find(g => g.categoryId === selectedChip)?.categoryName ?? '')
    : '';

  useEffect(() => {
    if (selectedChip === null) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => prev + 8);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [selectedChip, visibleCount]);

  const openDetail = (productId: number) => {
    setDetailDialog({ isOpen: true, productId });
    window.history.pushState({ modal: 'courierProduct', productId }, '');
  };

  // ── Nickname modal ──────────────────────────────────────────────────
  const openNickModal = useCallback(() => {
    setDraftNick(nickname === '신규 고객' ? '' : nickname);
    setNickModalOpen(true);
    window.history.pushState({ modal: 'nickname' }, '');
  }, [nickname]);

  useEffect(() => {
    if (nickModalOpen) {
      setTimeout(() => nickInputRef.current?.focus(), 0);
    }
  }, [nickModalOpen]);

  const checkNicknameUnique = async (value: string) => {
    try {
      const res = await checkNameExists(value);
      if (!res.ok) throw new Error('중복 검사 실패');
      const data = await res.json();
      return Boolean(data);
    } catch (e: any) {
      safeErrorLog(e, 'CourierShopPage - checkNicknameUnique');
      show(getSafeErrorMessage(e, '닉네임 중복 확인 중 오류가 발생했습니다.'), { variant: 'error' });
      return false;
    }
  };

  const saveNickname = async () => {
    const value = draftNick.trim();
    if (!value) {
      show('닉네임을 입력해주세요.', { variant: 'error' });
      return;
    }
    const allowed = /^[A-Za-z0-9가-힣]+$/;
    if (!allowed.test(value)) {
      show('닉네임은 숫자와 한글/영문만 사용할 수 있어요.', { variant: 'info' });
      return;
    }
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
      const res = await modifyName(value);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('닉네임 변경 API 응답:', res.status, errorText);
        throw new Error(`닉네임 저장 실패: ${res.status} ${res.statusText}`);
      }
      setNickname(value);
      localStorage.setItem('nickname', value);
      show('닉네임이 변경되었습니다.');
      setNickModalOpen(false);
      setTimeout(() => setNickname(value), 100);
    } catch (e: any) {
      safeErrorLog(e, 'CourierShopPage - saveNickname');
      show(getSafeErrorMessage(e, '닉네임 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setSavingNick(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Fixed Header ── */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="mx-auto w-full max-w-md h-14 flex items-center px-4">
          {/* Left: hamburger menu */}
          <div className="flex-1 flex justify-start">
            <button
              onClick={() => setDrawerOpen(true)}
              className="h-10 w-10 grid place-items-center rounded-md hover:bg-gray-50"
              aria-label="메뉴 열기"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          {/* Center: logo */}
          <div className="flex-1 flex justify-center">
            <button onClick={() => nav('/')} className="hover:opacity-80" aria-label="메인으로 이동">
              <img src={logoText} alt={theme.displayName} className="h-8 object-contain" />
            </button>
          </div>
          {/* Right: nickname */}
          <div className="flex-1 flex justify-end">
            <button onClick={openNickModal} className="text-right leading-tight text-sm" title="닉네임 변경">
              <div className="font-medium text-gray-800">{nickname}님</div>
              <div className="text-gray-500 text-xs">안녕하세요</div>
            </button>
          </div>
        </div>
      </header>

      {/* ── Left Drawer ── */}
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
              <button
                className="block w-full text-left h-10 rounded border px-3 flex items-center hover:bg-gray-50"
                onClick={() => { setDrawerOpen(false); nav('/store/products'); }}
              >
                매장 예약
              </button>
              <button
                className="block w-full text-left h-10 rounded border px-3 flex items-center hover:bg-gray-50"
                onClick={() => { setDrawerOpen(false); nav('/shop'); }}
              >
                택배 주문
              </button>
            </nav>
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

      <main className="bg-[#f6f6f6] min-h-screen flex flex-col items-center pt-16 pb-24">
        {/* ── Notice banner ── */}
        {noticeText && (
          <div className="w-full" style={{ backgroundColor: 'var(--color-primary-50)' }}>
            <div className="max-w-md mx-auto px-4 py-2.5 flex items-start gap-2">
              <span className="text-sm flex-none mt-0.5" style={{ color: 'var(--color-primary-700)' }}>📢</span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--color-primary-800)' }}>{noticeText}</p>
            </div>
          </div>
        )}
        {/* ── FAB: search icon (no active search) or filter icon + 초기화 (active search) ── */}
        <button
          type="button"
          onClick={searchQuery ? clearSearch : openSearchModal}
          aria-label={searchQuery ? '검색 초기화' : '상품 검색'}
          className={`fixed bottom-[64px] right-4 z-30 bg-white rounded-full shadow-lg border-2 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 ${shakeButton ? 'animate-shake' : ''}`}
          style={{
            borderColor: 'var(--color-primary-500)',
            width: searchQuery ? 'auto' : '48px',
            height: '48px',
            paddingLeft: searchQuery ? '16px' : '0',
            paddingRight: searchQuery ? '16px' : '0',
            gap: searchQuery ? '6px' : '0',
          }}
        >
          {searchQuery ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-500)" strokeWidth="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-500)" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          )}
          {searchQuery && <span className="text-sm font-bold text-gray-900">초기화</span>}
        </button>

        {/* ── Sticky chip row ── */}
        {!loading && viewMode === 'main' && (
          <div
            className="sticky z-30 w-full bg-white shadow-sm border-b border-gray-100 pb-2 pt-2"
            style={{ top: '56px' }}
          >
            <div
              className="max-w-md mx-auto px-4 flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none' }}
            >
              {[
                { key: 'all', label: '전체', isActive: selectedChip === null, onSelect: () => { if (selectedChip !== null) handleChipDeselect(); } },
                { key: 'recommended', label: '추천', isActive: selectedChip === 'recommended', onSelect: () => handleChipSelect('recommended') },
                ...categoryProducts.map(g => ({ key: String(g.categoryId), label: g.categoryName, isActive: selectedChip === g.categoryId, onSelect: () => handleChipSelect(g.categoryId) })),
              ].map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onSelect}
                  className="flex-none px-4 py-2 rounded-full text-sm font-medium border transition whitespace-nowrap"
                  style={
                    chip.isActive
                      ? { backgroundColor: 'var(--color-primary-500)', borderColor: 'var(--color-primary-500)', color: '#fff' }
                      : { color: '#374151' }
                  }
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="w-full max-w-md px-4 pt-2">
          {/* ════════════════════════════════════════════════════════════════
              VIEW: SEARCH
          ════════════════════════════════════════════════════════════════ */}
          {viewMode === 'search' && (
            <>
              <div
                className="flex items-center gap-2 mb-3 cursor-pointer"
                onClick={openSearchModal}
                role="button"
                aria-label="검색 조건 수정"
              >
                <p className="text-xs text-gray-500">
                  {searchLoading ? '검색 중...' : `검색 결과: ${searchResults.length}건`}
                </p>
                {searchQuery && (
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)' }}
                  >
                    "{searchQuery}" 검색 수정
                  </span>
                )}
              </div>

              {searchLoading && <ListSkeleton count={4} />}

              {!searchLoading && searchResults.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onClick={() => openDetail(product.id)}
                    />
                  ))}
                </div>
              )}

              {!searchLoading && searchResults.length === 0 && (
                <div
                  className="bg-white rounded-lg shadow-sm border p-10 text-center text-gray-500"
                  style={{ borderColor: 'var(--color-primary-100)' }}
                >
                  <svg
                    className="mx-auto mb-3 w-12 h-12"
                    style={{ color: 'var(--color-primary-300)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                    />
                  </svg>
                  <p className="text-sm font-medium text-gray-600">검색 결과가 없습니다</p>
                  <p className="text-xs text-gray-400 mt-1">다른 키워드로 검색해 보세요.</p>
                </div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════
              VIEW: MAIN
          ════════════════════════════════════════════════════════════════ */}
          {viewMode === 'main' && (
            <>
              {loading && <ListSkeleton count={4} />}

              {!loading && (
                <div
                  className="transition-opacity duration-200"
                  style={{ opacity: contentVisible ? 1 : 0 }}
                >
                  {/* ── Chip content below sticky row ── */}
                  {selectedChip !== null ? (
                    /* ── Infinite scroll for selected chip ── */
                    <section className="mb-4 bg-white rounded-xl shadow-sm p-4">
                      {/* Selected category header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-gray-800">{selectedCategoryName}</h2>
                          <span className="text-xs text-gray-400 font-normal">{selectedProducts.length}개</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleChipDeselect}
                          className="text-xs font-medium transition flex items-center gap-0.5"
                          style={{ color: 'var(--color-primary-500)' }}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                          </svg>
                          전체 보기
                        </button>
                      </div>

                      {selectedProducts.length > 0 ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            {selectedProducts.slice(0, visibleCount).map(product => (
                              <ProductCard
                                key={product.id}
                                product={product}
                                onClick={() => openDetail(product.id)}
                              />
                            ))}
                          </div>
                          {visibleCount < selectedProducts.length && (
                            <div ref={sentinelRef} className="h-10" />
                          )}
                        </>
                      ) : (
                        <EmptyState />
                      )}
                    </section>
                  ) : (
                    /* ── Section view (default) ── */
                    <>
                      {/* Recommended section */}
                      {recommendedProducts.length > 0 && (
                        <section className="mb-4 bg-white rounded-xl shadow-sm p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h2 className="text-base font-bold text-gray-800">추천</h2>
                            <button
                              type="button"
                              onClick={() => handleChipSelect('recommended')}
                              className="text-xs font-medium transition"
                              style={{ color: 'var(--color-primary-500)' }}
                            >
                              더보기 &gt;
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {recommendedProducts.slice(0, 4).map(product => (
                              <ProductCard
                                key={product.id}
                                product={product}
                                onClick={() => openDetail(product.id)}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Category sections */}
                      {categoryProducts.map(group => (
                        group.products.length > 0 && (
                          <section
                            key={group.categoryId}
                            className="mb-4 bg-white rounded-xl shadow-sm p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h2 className="text-base font-bold text-gray-800">{group.categoryName}</h2>
                              <button
                                type="button"
                                onClick={() => handleChipSelect(group.categoryId)}
                                className="text-xs font-medium transition"
                                style={{ color: 'var(--color-primary-500)' }}
                              >
                                더보기 &gt;
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {group.products.slice(0, 4).map(product => (
                                <ProductCard
                                  key={product.id}
                                  product={product}
                                  onClick={() => openDetail(product.id)}
                                />
                              ))}
                            </div>
                          </section>
                        )
                      ))}

                      {recommendedProducts.length === 0 && categoryProducts.length === 0 && (
                        <EmptyState />
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Search Modal ── */}
        {searchModalOpen && (
          <div
            className="fixed inset-0 z-50 grid place-items-center p-4"
            aria-modal="true"
            role="dialog"
          >
            <div className="absolute inset-0 bg-black/40" onClick={closeSearchModal} />
            <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl border">
              {/* Header */}
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

              {/* Search input */}
              <div className="p-4">
                <div className="relative">
                  <input
                    ref={modalInputRef}
                    type="text"
                    value={tempSearch}
                    onChange={handleTempSearchChange}
                    onKeyDown={e => { if (e.key === 'Enter') applySearch(); }}
                    placeholder="상품명을 입력하세요"
                    className="w-full h-12 pl-10 pr-10 rounded-lg border-2 border-gray-300 outline-none text-sm bg-white"
                    style={{ ['--tw-ring-color' as any]: 'var(--color-primary-500)' }}
                    autoFocus
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                  </span>
                  {tempSearch && (
                    <button
                      type="button"
                      onClick={() => { setTempSearch(''); setModalSearchResults([]); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center"
                      aria-label="검색어 지우기"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Modal search results preview */}
              {tempSearch && (
                <div className="px-4 pb-4">
                  {modalSearchLoading && (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg animate-pulse">
                          <div className="w-12 h-12 bg-gray-200 rounded flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 bg-gray-200 rounded w-3/4" />
                            <div className="h-3 bg-gray-200 rounded w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!modalSearchLoading && modalSearchResults.length > 0 && (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {modalSearchResults.map(product => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            setTempSearch(product.name);
                            setModalSearchResults([]);
                            // Apply immediately with this product's name
                            const q = product.name;
                            setSearchQuery(q);
                            setSearchModalOpen(false);
                            setTempSearch('');
                            setModalSearchResults([]);
                            setViewMode('search');
                            setSearchLoading(true);
                            searchCourierProducts(q)
                              .then(async res => {
                                if (!res.ok) return;
                                const data = await res.json();
                                const arr = Array.isArray(data?.response) ? data.response : Array.isArray(data) ? data : [];
                                setSearchResults(arr.map(mapProduct));
                              })
                              .catch(e => safeErrorLog(e, 'CourierShopPage - modalProductClick'))
                              .finally(() => setSearchLoading(false));
                          }}
                        >
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-12 h-12 rounded object-cover border flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">
                              {(() => {
                                const q = tempSearch.trim();
                                if (!q) return product.name;
                                const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                                const parts = product.name.split(regex);
                                return parts.map((part, idx) =>
                                  regex.test(part) ? <mark key={idx} className="bg-yellow-200 px-0.5 rounded">{part}</mark> : part
                                );
                              })()}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{formatPrice(product.price)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!modalSearchLoading && modalSearchResults.length === 0 && (
                    <div className="text-center text-gray-500 py-6">
                      <div className="text-sm">
                        <span className="font-medium" style={{ color: 'var(--color-primary-600)' }}>"{tempSearch}"</span> 상품이 존재하지 않습니다.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
                <button
                  onClick={closeSearchModal}
                  className="flex-1 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={applySearch}
                  className="flex-1 h-10 rounded-lg text-white font-medium transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary-500)' }}
                >
                  검색 적용
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Nickname Modal ── */}
        {nickModalOpen && (
          <div
            className="fixed inset-0 z-50 grid place-items-center p-4"
            onKeyDown={e => { if (e.key === 'Escape') setNickModalOpen(false); }}
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
                  className="h-10 px-4 rounded text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary-500)' }}
                >
                  {savingNick ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Product Detail Dialog ── */}
        {detailDialog.isOpen && (
          <CourierProductDetailPage
            isOpen={detailDialog.isOpen}
            onClose={() => setDetailDialog({ isOpen: false, productId: 0 })}
            productId={detailDialog.productId}
          />
        )}

        <div className="mt-10" />
        <Footer />
        <CourierBottomNav />
      </main>
    </>
  );
}
