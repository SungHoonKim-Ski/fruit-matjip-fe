import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  getAdminCourierProducts,
  getAdminCourierCategories,
  updateAdminCourierProductOrder,
  updateAdminCourierCategoryProductOrder,
} from '../../../utils/api';

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  orderIndex: number;
  categories: { id: number; name: string }[];
};

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return IMG_BASE ? `${IMG_BASE}/${url}` : url;
};

// orderIndex 정규화 함수 (중복 제거 및 순차 재배치)
const normalizeOrderIndexes = (products: Product[]): Map<number, number> => {
  const normalizedOrders = new Map<number, number>();

  const orderGroups = new Map<number, Product[]>();
  products.forEach(product => {
    const orderIndex = product.orderIndex || 0;
    if (!orderGroups.has(orderIndex)) {
      orderGroups.set(orderIndex, []);
    }
    orderGroups.get(orderIndex)!.push(product);
  });

  const sortedOrders = Array.from(orderGroups.keys()).sort((a, b) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });

  let currentOrder = 1;
  sortedOrders.forEach(orderIndex => {
    const productsInGroup = orderGroups.get(orderIndex)!;
    productsInGroup.forEach(product => {
      normalizedOrders.set(product.id, currentOrder);
      currentOrder++;
    });
  });

  return normalizedOrders;
};

const AdminCourierProductOrderPage = () => {
  const { show } = useSnackbar();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [productOrders, setProductOrders] = useState<Map<number, number>>(new Map());
  const [sortedProducts, setSortedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      try {
        const res = await getAdminCourierProducts();
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return;
          throw new Error('상품 목록을 불러오지 못했습니다.');
        }
        const data = await res.json();
        const arr = Array.isArray(data?.response) ? data.response : (Array.isArray(data) ? data : []);
        const mapped: Product[] = arr.map((p: any) => ({
          id: Number(p.id),
          name: String(p.name ?? ''),
          price: Number(p.price ?? 0),
          stock: Number(p.stock ?? 0),
          imageUrl: addImgPrefix(p.product_url ?? p.image_url ?? p.imageUrl ?? ''),
          orderIndex: Number(p.sort_order ?? p.order_index ?? p.orderIndex ?? 0),
          categories: (p.categories ?? []).map((c: any) => ({ id: Number(c.id), name: String(c.name ?? '') })),
        }));
        setProducts(mapped);
        initializeOrders(mapped);
      } catch (e: any) {
        safeErrorLog(e, 'AdminCourierProductOrderPage - loadProducts');
        show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        setIsLoading(false);
      }
    };
    loadProducts();
  }, [show]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getAdminCourierCategories();
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
        safeErrorLog(e, 'AdminCourierProductOrderPage - loadCategories');
      }
    })();
    return () => { alive = false; };
  }, []);

  const initializeOrders = (productList: Product[]) => {
    const normalized = normalizeOrderIndexes(productList);
    setProductOrders(normalized);
    const sorted = [...productList].sort((a, b) => {
      const orderA = normalized.get(a.id) || 0;
      const orderB = normalized.get(b.id) || 0;
      return orderA - orderB;
    });
    setSortedProducts(sorted);
  };

  const filteredProducts = selectedCategoryId === null
    ? products
    : products.filter(p => p.categories.some(c => c.id === selectedCategoryId));

  const filteredSortedProducts = selectedCategoryId === null
    ? sortedProducts
    : sortedProducts.filter(p => p.categories.some(c => c.id === selectedCategoryId));

  const handleCategorySelect = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId);
    const targetProducts = categoryId === null
      ? products
      : products.filter(p => p.categories.some(c => c.id === categoryId));
    const normalized = normalizeOrderIndexes(targetProducts);
    setProductOrders(prev => {
      const next = new Map(prev);
      targetProducts.forEach(p => {
        next.set(p.id, normalized.get(p.id) || 0);
      });
      return next;
    });
    const sorted = [...targetProducts].sort((a, b) => {
      const orderA = normalized.get(a.id) || 0;
      const orderB = normalized.get(b.id) || 0;
      return orderA - orderB;
    });
    setSortedProducts(prev => {
      if (categoryId === null) return sorted;
      const otherProducts = prev.filter(p => !p.categories.some(c => c.id === categoryId));
      return [...sorted, ...otherProducts];
    });
  };

  const handleOrderChange = (productId: number, newOrder: number) => {
    const currentOrder = productOrders.get(productId);
    if (currentOrder === newOrder) return;

    const newOrders = new Map(productOrders);
    newOrders.set(productId, newOrder);

    if (currentOrder !== undefined) {
      filteredProducts.forEach(p => {
        if (p.id !== productId) {
          const order = newOrders.get(p.id) || 0;
          if (currentOrder > newOrder) {
            if (order >= newOrder && order < currentOrder) {
              newOrders.set(p.id, order + 1);
            }
          } else if (currentOrder < newOrder) {
            if (order > currentOrder && order <= newOrder) {
              newOrders.set(p.id, order - 1);
            }
          }
        }
      });
    }

    setProductOrders(newOrders);

    const newSortedFiltered = [...filteredProducts].sort((a, b) => {
      const orderA = newOrders.get(a.id) || 0;
      const orderB = newOrders.get(b.id) || 0;
      return orderA - orderB;
    });

    if (selectedCategoryId === null) {
      setSortedProducts(newSortedFiltered);
    } else {
      setSortedProducts(prev => {
        const otherProducts = prev.filter(p => !p.categories.some(c => c.id === selectedCategoryId));
        return [...newSortedFiltered, ...otherProducts];
      });
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const productIds = filteredSortedProducts.map(p => p.id);
      let res: Response;
      if (selectedCategoryId === null) {
        res = await updateAdminCourierProductOrder(productIds);
      } else {
        res = await updateAdminCourierCategoryProductOrder(selectedCategoryId, productIds);
      }
      if (!res.ok) throw new Error('순서 변경에 실패했습니다.');
      show('노출순서가 저장되었습니다.', { variant: 'success' });
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierProductOrderPage - handleSave');
      show(getSafeErrorMessage(e, '순서 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCategoryName = selectedCategoryId !== null
    ? categories.find(c => c.id === selectedCategoryId)?.name
    : null;

  const pageTitle = selectedCategoryName
    ? `택배 노출순서 변경 - ${selectedCategoryName}`
    : '택배 노출순서 변경';

  if (isLoading) {
    return (
      <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto flex items-center justify-center h-64">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <AdminCourierHeader />
        </div>

        {categories.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-4 px-3 py-2 overflow-x-auto">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCategorySelect(null)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                  selectedCategoryId === null
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                전체
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategorySelect(selectedCategoryId === cat.id ? null : cat.id)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition ${
                    selectedCategoryId === cat.id
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            {products.length === 0 ? '등록된 상품이 없습니다.' : '해당 카테고리에 상품이 없습니다.'}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">상품</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 w-24">순서</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSortedProducts.map(product => {
                    const currentOrder = productOrders.get(product.id) || 1;
                    return (
                      <tr
                        key={product.id}
                        className="border-b last:border-b-0 hover:bg-gray-50"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-6 h-6 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                              {currentOrder}
                            </div>
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-10 h-10 object-cover rounded border flex-shrink-0"
                            />
                            <div>
                              <div className="font-medium text-sm text-gray-900">{product.name}</div>
                              <div className="text-xs text-gray-500">
                                {product.price.toLocaleString()}원 · 재고 {product.stock}개
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={currentOrder}
                            onChange={e => handleOrderChange(product.id, parseInt(e.target.value))}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-orange-500 focus:border-orange-500"
                          >
                            {Array.from({ length: filteredProducts.length }, (_, i) => i + 1).map(num => (
                              <option key={num} value={num}>
                                {num}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="h-10 px-6 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:bg-gray-300 transition"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default AdminCourierProductOrderPage;
