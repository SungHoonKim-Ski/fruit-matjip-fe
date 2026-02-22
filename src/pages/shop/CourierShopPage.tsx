import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import {
  getRecommendedCourierProducts,
  searchCourierProducts,
  getCourierProductsByCategory,
} from '../../utils/api';
import CourierBottomNav from '../../components/shop/CourierBottomNav';

type CourierProduct = {
  id: number;
  name: string;
  price: number;
  stock: number;
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
  stock: Number(p.stock ?? 0),
  imageUrl: addImgPrefix(p.product_url ?? p.image_url ?? p.imageUrl ?? ''),
  weight: p.weight ?? undefined,
  totalSold: p.total_sold ?? p.totalSold ?? 0,
  orderIndex: p.sort_order ?? p.order_index ?? p.orderIndex ?? 0,
});

// ── Product card (shared) ─────────────────────────────────────────────────────
function ProductCard({ product, onClick }: { product: CourierProduct; onClick: () => void }) {
  return (
    <div
      className="bg-white rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
      onClick={onClick}
      role="button"
      aria-label={`${product.name} 상세 보기`}
    >
      <div className="relative w-full aspect-square bg-gray-100">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white font-bold text-sm bg-black/60 px-3 py-1 rounded-full">품절</span>
          </div>
        )}
        {product.stock > 0 && product.stock <= 10 && (
          <span className="absolute top-2 right-2 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-medium">
            마감임박
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-800 leading-tight line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>
        <div className="mt-1 text-sm font-bold text-orange-500">
          {formatPrice(product.price)}
        </div>
        {product.stock > 0 && (
          <div className="mt-0.5 text-[11px] text-gray-400">재고 {product.stock}개</div>
        )}
      </div>
    </div>
  );
}

// ── Grid skeleton ─────────────────────────────────────────────────────────────
function GridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow animate-pulse">
          <div className="w-full aspect-square bg-gray-200 rounded-t-lg" />
          <div className="p-3 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500 mt-4">
      <svg
        className="mx-auto mb-3 w-12 h-12 text-gray-300"
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
      <p className="text-sm font-medium">등록된 상품이 없습니다</p>
      <p className="text-xs text-gray-400 mt-1">곧 새로운 상품이 등록될 예정입니다.</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CourierShopPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CourierProduct[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<CourierProduct[]>([]);
  const [categoryProducts, setCategoryProducts] = useState<CategoryGroup[]>([]);
  const [selectedChip, setSelectedChip] = useState<'recommended' | number>('recommended');
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Initial load: recommended + by-category in parallel ──────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [recRes, catRes] = await Promise.all([
          getRecommendedCourierProducts(8),
          getCourierProductsByCategory(),
        ]);

        if (!alive) return;

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
            .filter((g: any) => Array.isArray(g.products) && g.products.length > 0)
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
      setViewMode('main');
      setSearchResults([]);
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="bg-[#f6f6f6] min-h-screen flex flex-col items-center pb-24">
      {/* ── Search bar (sticky) ── */}
      <div className="sticky top-0 z-40 w-full bg-white shadow-sm">
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
            {searchQuery.length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="검색 초기화"
                className="flex-none text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="w-full max-w-md px-4 pt-4">
        {/* ════════════════════════════════════════════════════════════════
            VIEW: SEARCH
        ════════════════════════════════════════════════════════════════ */}
        {viewMode === 'search' && (
          <>
            <p className="text-xs text-gray-500 mb-3">
              {searchLoading ? '검색 중...' : `검색 결과: ${searchResults.length}건`}
            </p>

            {searchLoading && <GridSkeleton count={4} />}

            {!searchLoading && searchResults.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {searchResults.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => nav(`/shop/${product.id}`)}
                  />
                ))}
              </div>
            )}

            {!searchLoading && searchResults.length === 0 && (
              <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500">
                <svg
                  className="mx-auto mb-3 w-12 h-12 text-gray-300"
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
                <p className="text-sm font-medium">검색 결과가 없습니다</p>
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
            {loading && (
              <>
                {/* Chip placeholders */}
                <div className="flex gap-2 mb-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-7 w-14 bg-gray-200 rounded-full animate-pulse flex-none" />
                  ))}
                </div>
                <GridSkeleton count={4} />
              </>
            )}

            {!loading && (
              <>
                {/* ── Chip row ── */}
                <div
                  className="flex gap-2 overflow-x-auto pb-2 mb-4 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: 'none' }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedChip('recommended')}
                    className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium border transition whitespace-nowrap ${
                      selectedChip === 'recommended'
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    추천
                  </button>
                  {categoryProducts.map(group => (
                    <button
                      key={group.categoryId}
                      type="button"
                      onClick={() => setSelectedChip(group.categoryId)}
                      className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium border transition whitespace-nowrap ${
                        selectedChip === group.categoryId
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {group.categoryName}
                    </button>
                  ))}
                </div>

                {/* ── Selected chip content ── */}
                {selectedChip === 'recommended' ? (
                  recommendedProducts.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {recommendedProducts.map(product => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          onClick={() => nav(`/shop/${product.id}`)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState />
                  )
                ) : (
                  (() => {
                    const group = categoryProducts.find(g => g.categoryId === selectedChip);
                    const products = group?.products ?? [];
                    return products.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {products.map(product => (
                          <ProductCard
                            key={product.id}
                            product={product}
                            onClick={() => nav(`/shop/${product.id}`)}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState />
                    );
                  })()
                )}
              </>
            )}
          </>
        )}
      </div>

      <CourierBottomNav />
    </main>
  );
}
