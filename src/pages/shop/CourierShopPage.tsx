import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getCourierProducts, getCourierCategories } from '../../utils/api';
import { getCartTotalQuantity } from '../../utils/courierCart';
import CourierNav from '../../components/shop/CourierNav';

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

type CategoryItem = {
  id: number;
  name: string;
};

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return IMG_BASE ? `${IMG_BASE}/${url}` : url;
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function CourierShopPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [products, setProducts] = useState<CourierProduct[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(() => getCartTotalQuantity());

  // Listen to storage changes for cart count updates
  useEffect(() => {
    const onStorage = () => setCartCount(getCartTotalQuantity());
    window.addEventListener('storage', onStorage);
    // Also poll on focus for same-tab updates
    const onFocus = () => setCartCount(getCartTotalQuantity());
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Load categories
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getCourierCategories();
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data?.response) ? data.response : (Array.isArray(data) ? data : []);
        if (alive) {
          setCategories(list.map((c: any) => ({
            id: Number(c.id),
            name: String(c.name ?? ''),
          })));
        }
      } catch (e) {
        safeErrorLog(e, 'CourierShopPage - loadCategories');
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load products
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getCourierProducts(activeCategoryId ?? undefined);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return;
          throw new Error('상품 목록을 불러오지 못했습니다.');
        }
        const data = await res.json();
        const arr = Array.isArray(data?.response) ? data.response : (Array.isArray(data) ? data : []);
        if (alive) {
          setProducts(arr.map((p: any) => ({
            id: Number(p.id),
            name: String(p.name ?? ''),
            price: Number(p.price ?? 0),
            stock: Number(p.stock ?? 0),
            imageUrl: addImgPrefix(p.image_url ?? p.imageUrl ?? p.product_url ?? ''),
            weight: p.weight ?? undefined,
            totalSold: p.total_sold ?? p.totalSold ?? 0,
            orderIndex: p.order_index ?? p.orderIndex ?? 0,
          })));
        }
      } catch (e: any) {
        safeErrorLog(e, 'CourierShopPage - loadProducts');
        show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [activeCategoryId, show]);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      // In stock first
      if (a.stock > 0 && b.stock === 0) return -1;
      if (a.stock === 0 && b.stock > 0) return 1;
      // Then by orderIndex asc
      const oa = a.orderIndex ?? 999;
      const ob = b.orderIndex ?? 999;
      if (oa !== ob) return oa - ob;
      // Then by totalSold desc
      return (b.totalSold ?? 0) - (a.totalSold ?? 0);
    });
  }, [products]);

  return (
    <main className="bg-[#f6f6f6] min-h-screen flex flex-col items-center pt-14 pb-24">
      <CourierNav title="택배 주문" showBack={true} backTo="/" />

      <section className="w-full max-w-md px-4">
        {/* Category chips */}
        {categories.length > 0 && (
          <div className="bg-white rounded-lg shadow mt-3 px-3 py-2 overflow-x-auto">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveCategoryId(null)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                  activeCategoryId === null
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                전체
              </button>
              {categories.map(cat => {
                const active = activeCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategoryId(active ? null : cat.id)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                      active
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-lg shadow animate-pulse">
                <div className="w-full aspect-square bg-gray-200 rounded-t-lg" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Product Grid */}
        {!loading && sortedProducts.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {sortedProducts.map(product => (
              <div
                key={product.id}
                className="bg-white rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
                onClick={() => nav(`/shop/${product.id}`)}
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
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      재고 {product.stock}개
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sortedProducts.length === 0 && (
          <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500 mt-4">
            <svg className="mx-auto mb-3 w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm font-medium">등록된 상품이 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">곧 새로운 상품이 등록될 예정입니다.</p>
          </div>
        )}
      </section>

      {/* Cart FAB */}
      <button
        type="button"
        onClick={() => nav('/shop/cart')}
        className="fixed bottom-6 right-4 z-30 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-lg w-14 h-14 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="장바구니"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 01-8 0" />
        </svg>
        {cartCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1">
            {cartCount > 99 ? '99+' : cartCount}
          </span>
        )}
      </button>
    </main>
  );
}
