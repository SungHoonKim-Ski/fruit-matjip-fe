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
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [tempSearch, setTempSearch] = useState('');
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

  const getFilteredProductsBySearch = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q));
  };

  const highlightSearchTerm = (text: string, term: string) => {
    if (!term.trim()) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, idx) =>
      regex.test(part) ? <mark key={idx} className="bg-yellow-200 px-0.5 rounded">{part}</mark> : part
    );
  };

  const openSearchModal = () => {
    setTempSearch(searchKeyword);
    setSearchModalOpen(true);
  };

  const closeSearchModal = () => {
    setSearchModalOpen(false);
    setTempSearch('');
  };

  const applySearch = () => {
    setSearchKeyword(tempSearch);
    setSearchModalOpen(false);
    setTempSearch('');
  };

  const clearSearch = () => {
    setSearchKeyword('');
    setTempSearch('');
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">택배 상품 관리</h1>
          <AdminCourierHeader />
        </div>

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
        onClick={searchKeyword ? clearSearch : openSearchModal}
        aria-label={searchKeyword ? '검색 초기화' : '상품 검색'}
        className="fixed bottom-4 right-4 z-40 bg-white rounded-full shadow-lg border-2 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          borderColor: 'var(--color-primary-500)',
          width: searchKeyword ? 'auto' : '48px',
          height: '48px',
          paddingLeft: searchKeyword ? '16px' : '0',
          paddingRight: searchKeyword ? '16px' : '0',
          gap: searchKeyword ? '6px' : '0',
        }}
      >
        {searchKeyword ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-500)" strokeWidth="2">
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-500)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}
        {searchKeyword && <span className="text-sm font-bold text-gray-900">초기화</span>}
      </button>

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
                    onClick={() => setTempSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center"
                    aria-label="검색어 지우기"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* 검색 결과 상품별 미리보기 */}
            {tempSearch && (
              <div className="px-4 pb-4">
                {(() => {
                  const results = getFilteredProductsBySearch(tempSearch);
                  if (results.length > 0) {
                    return (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {results.slice(0, 20).map(product => (
                          <div
                            key={product.id}
                            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => {
                              setSearchKeyword(product.name);
                              setSearchModalOpen(false);
                              setTempSearch('');
                            }}
                          >
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-12 h-12 rounded object-cover border flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate">
                                {highlightSearchTerm(product.name, tempSearch)}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">{formatPrice(product.price)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div className="text-center text-gray-500 py-6">
                      <div className="text-sm">
                        <span className="font-medium" style={{ color: 'var(--color-primary-600)' }}>"{tempSearch}"</span>에 대한 검색 결과가 없습니다.
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        다른 검색어를 시도해보세요.
                      </div>
                    </div>
                  );
                })()}
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
                className="flex-1 h-10 rounded-lg text-white font-medium transition-colors hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary-500)' }}
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
