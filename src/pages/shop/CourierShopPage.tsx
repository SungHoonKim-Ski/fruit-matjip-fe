import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import {
  getRecommendedCourierProducts,
  searchCourierProducts,
  getCourierProductsByCategory,
  getCourierConfig,
} from '../../utils/api';
import CourierBottomNav from '../../components/shop/CourierBottomNav';
import { theme, logoText } from '../../brand';
import { getCartTotalQuantity } from '../../utils/courierCart';
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
      <div className="relative w-full bg-gray-100">
        <img
          src={product.imageUrl}
          alt={product.name}
          className={`w-full${product.soldOut ? ' opacity-40' : ''}`}
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

// ── Compact product card for horizontal scroll ───────────────────────────────
function CompactProductCard({ product, onClick }: { product: CourierProduct; onClick: () => void }) {
  return (
    <div
      className="flex-none w-28 cursor-pointer active:scale-[0.97] transition-transform"
      onClick={onClick}
      role="button"
      aria-label={`${product.name} 상세 보기`}
    >
      <div className="relative w-28 h-28">
        <img
          src={product.imageUrl}
          alt={product.name}
          className={`w-28 h-28 object-cover rounded-lg border${product.soldOut ? ' opacity-40' : ''}`}
          style={{ borderColor: 'var(--color-primary-500)' }}
          loading="lazy"
        />
        {product.soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
            <span className="text-white font-bold text-xs bg-black/60 px-2 py-0.5 rounded-full">품절</span>
          </div>
        )}
      </div>
      <h3 className="text-xs font-medium text-gray-800 leading-tight line-clamp-2 mt-1.5">{product.name}</h3>
      <div className="text-xs font-bold mt-0.5" style={{ color: 'var(--color-primary-700)' }}>
        {formatPrice(product.price)}
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
  const [cartCount, setCartCount] = useState(() => getCartTotalQuantity());
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
  const [searchOpen, setSearchOpen] = useState(false);

  // ── Fade transition state ──────────────────────────────────────────────────
  const [contentVisible, setContentVisible] = useState(true);
  const prevChipRef = useRef<null | 'recommended' | number>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Cart count sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setCartCount(getCartTotalQuantity());
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  // ── Popstate handling for dialog ──────────────────────────────────────────
  useEffect(() => {
    const onPop = () => {
      if (detailDialog.isOpen) {
        setDetailDialog({ isOpen: false, productId: 0 });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [detailDialog.isOpen]);

  // ── Body scroll lock when dialog is open ─────────────────────────────────
  useEffect(() => {
    if (detailDialog.isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev || ''; };
    }
  }, [detailDialog.isOpen]);

  // ── Initial load: recommended + by-category in parallel ──────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [recRes, catRes, configData] = await Promise.all([
          getRecommendedCourierProducts(8),
          getCourierProductsByCategory(),
          getCourierConfig().catch(() => null),
        ]);

        if (!alive) return;

        if (configData?.noticeText) {
          setNoticeText(configData.noticeText);
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

  // ── Search debounce ───────────────────────────────────────────────────────
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.trim() === '') {
      setSearchResults([]);
      setViewMode('search');
      return;
    }

    setViewMode('search');
    debounceRef.current = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const res = await searchCourierProducts(q.trim());
        if (!res.ok) return;
        const data = await res.json();
        const arr = Array.isArray(data?.response)
          ? data.response
          : Array.isArray(data)
          ? data
          : [];
        setSearchResults(arr.map(mapProduct));
      } catch (e: any) {
        safeErrorLog(e, 'CourierShopPage - search');
        show(getSafeErrorMessage(e, '검색 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setViewMode('main');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchInputRef.current?.focus();
  };

  const openSearch = () => {
    setSearchOpen(true);
    setViewMode('search');
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const closeSearch = () => {
    setSearchOpen(false);
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
            <button onClick={() => nav('/shop')} className="hover:opacity-80" aria-label="메인으로 이동">
              <img src={logoText} alt={theme.displayName} className="h-8 object-contain" />
            </button>
          </div>
          {/* Right: cart icon with badge */}
          <div className="flex-1 flex justify-end">
            <button
              onClick={() => nav('/shop/cart')}
              className="relative h-10 w-10 grid place-items-center rounded-md hover:bg-gray-50"
              aria-label="장바구니"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
              {cartCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
                  style={{ backgroundColor: 'var(--color-primary-500)' }}
                >
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
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
        {/* ── Search bar (slide-down, visible only when searchOpen) ── */}
        {searchOpen && (
          <div className="sticky top-14 z-40 w-full bg-white shadow-md border-b border-gray-100">
            <div className="max-w-md mx-auto px-4 py-2.5">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
                <svg
                  className="w-4 h-4 text-gray-400 flex-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                  />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="상품 검색"
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  aria-label="검색 닫기"
                  className="flex-none text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FAB search button ── */}
        {!searchOpen && (
          <button
            type="button"
            onClick={openSearch}
            aria-label="상품 검색"
            className="fixed bottom-20 right-4 z-40 w-12 h-12 text-white rounded-full flex items-center justify-center active:opacity-90 transition"
            style={{
              backgroundColor: 'var(--color-primary-500)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>
        )}

        {/* ── Sticky chip row ── */}
        {!loading && viewMode === 'main' && (
          <div
            className="sticky z-30 w-full bg-white shadow-sm border-b border-gray-100 pb-2 pt-2"
            style={{ top: searchOpen ? '110px' : '56px' }}
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
              <p className="text-xs text-gray-500 mb-3">
                {searchLoading ? '검색 중...' : `검색 결과: ${searchResults.length}건`}
              </p>

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
                    <>
                      {/* Selected category header */}
                      <div className="flex items-center justify-between mb-3 mt-1">
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
                    </>
                  ) : (
                    /* ── Section view (default) ── */
                    <>
                      {/* Recommended section — horizontal scroll */}
                      {recommendedProducts.length > 0 && (
                        <section className="mb-4 bg-white rounded-xl shadow-sm p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h2 className="text-base font-bold text-gray-800">추천</h2>
                          </div>
                          <div
                            className="flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden"
                            style={{ scrollbarWidth: 'none' }}
                          >
                            {recommendedProducts.map(product => (
                              <CompactProductCard
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
                              {group.products.length > 4 && (
                                <button
                                  type="button"
                                  onClick={() => handleChipSelect(group.categoryId)}
                                  className="text-xs font-medium transition"
                                  style={{ color: 'var(--color-primary-500)' }}
                                >
                                  더보기 &gt;
                                </button>
                              )}
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
