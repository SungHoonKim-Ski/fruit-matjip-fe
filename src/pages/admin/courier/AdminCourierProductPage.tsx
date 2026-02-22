import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  getAdminCourierProducts,
} from '../../../utils/api';

type Product = {
  id: number;
  name: string;
  price: number;
  visible: boolean;
  soldOut: boolean;
  imageUrl: string;
  categories: Array<{ id: number; name: string }>;
};

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return IMG_BASE ? `${IMG_BASE}/${url}` : url;
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function AdminCourierProductPage() {
  const navigate = useNavigate();
  const { show } = useSnackbar();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  // Load products
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getAdminCourierProducts();
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
            visible: typeof p.visible === 'boolean' ? p.visible : (typeof p.is_visible === 'boolean' ? p.is_visible : true),
            soldOut: typeof p.sold_out === 'boolean' ? p.sold_out : false,
            imageUrl: addImgPrefix(p.product_url ?? p.image_url ?? p.imageUrl ?? ''),
            categories: Array.isArray(p.categories) ? p.categories.map((c: any) => ({ id: Number(c.id), name: String(c.name ?? '') })) : [],
          })));
        }
      } catch (e: any) {
        safeErrorLog(e, 'AdminCourierProductPage - load');
        show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [show]);

  const uniqueCategories = useMemo(() => {
    const catMap = new Map<number, string>();
    products.forEach(p => {
      p.categories.forEach(c => {
        if (!catMap.has(c.id)) catMap.set(c.id, c.name);
      });
    });
    return Array.from(catMap.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategoryId !== null) {
      result = result.filter(p => p.categories.some(c => c.id === selectedCategoryId));
    }
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(keyword));
    }
    return result;
  }, [products, selectedCategoryId, searchKeyword]);

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">택배 상품 관리</h1>
          <AdminCourierHeader />
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                placeholder="상품명 검색..."
                className="w-full h-10 pl-10 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'var(--color-primary-300)' } as React.CSSProperties}
                autoFocus
              />
              <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Category chips */}
        {!loading && uniqueCategories.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: '전체', isActive: selectedCategoryId === null, onClick: () => setSelectedCategoryId(null) },
                ...uniqueCategories.map(cat => ({ key: String(cat.id), label: cat.name, isActive: selectedCategoryId === cat.id, onClick: () => setSelectedCategoryId(cat.id) })),
              ].map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onClick}
                  className="px-3 py-1.5 rounded-full border text-xs font-medium transition"
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

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl shadow p-3 animate-pulse">
                <div className="aspect-square bg-gray-200 rounded-lg mb-2" />
                <div className="h-3.5 bg-gray-200 rounded w-3/4 mb-1.5" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && products.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            등록된 상품이 없습니다.
          </div>
        )}

        {!loading && products.length > 0 && filteredProducts.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            검색 결과가 없습니다.
          </div>
        )}

        {/* Product grid */}
        {!loading && filteredProducts.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                type="button"
                onClick={() => navigate(`/admin/courier/products/${product.id}/edit`)}
                className="bg-white rounded-xl shadow hover:shadow-md transition-all text-left group cursor-pointer overflow-hidden"
              >
                <div className="aspect-square overflow-hidden bg-gray-100">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                </div>
                <div className="p-3 space-y-1.5">
                  <h3 className="text-sm font-semibold text-gray-800 truncate">{product.name}</h3>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold text-gray-900">{formatPrice(product.price)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {!product.visible && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-600">
                        숨김
                      </span>
                    )}
                    {product.soldOut && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-orange-100 text-orange-600">
                        품절
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search FAB */}
      <button
        type="button"
        onClick={() => setSearchOpen(prev => !prev)}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full text-white shadow-lg transition flex items-center justify-center active:opacity-90"
        style={{ backgroundColor: 'var(--color-primary-500)' }}
        aria-label="검색"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </main>
  );
}
