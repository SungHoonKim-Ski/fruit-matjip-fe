import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  getAdminCourierProducts,
  deleteAdminCourierProduct,
  toggleAdminCourierProductVisible,
  toggleAdminCourierProductRecommend,
} from '../../../utils/api';

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  visible: boolean;
  recommended: boolean;
  imageUrl: string;
  totalSold: number;
  orderIndex: number;
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

  // Dialog state
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; productId: number; productName: string }>({
    isOpen: false, productId: 0, productName: '',
  });
  const [toggleDialog, setToggleDialog] = useState<{ isOpen: boolean; productId: number; productName: string; newVisible: boolean }>({
    isOpen: false, productId: 0, productName: '', newVisible: true,
  });

  const suppressNextPop = useRef(false);

  // Push history for dialog
  const pushDialogState = () => {
    window.history.pushState({ modal: true }, '');
  };

  const programmaticCloseDialog = () => {
    suppressNextPop.current = true;
    window.history.back();
  };

  // Handle back button for dialogs
  useEffect(() => {
    const onPop = () => {
      if (suppressNextPop.current) {
        suppressNextPop.current = false;
        return;
      }
      if (deleteDialog.isOpen || toggleDialog.isOpen) {
        setDeleteDialog(prev => ({ ...prev, isOpen: false }));
        setToggleDialog(prev => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [deleteDialog.isOpen, toggleDialog.isOpen]);

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
            stock: Number(p.stock ?? 0),
            visible: typeof p.visible === 'boolean' ? p.visible : (typeof p.is_visible === 'boolean' ? p.is_visible : true),
            recommended: typeof p.recommended === 'boolean' ? p.recommended : false,
            imageUrl: addImgPrefix(p.product_url ?? p.image_url ?? p.imageUrl ?? ''),
            totalSold: Number(p.total_sold ?? p.totalSold ?? 0),
            orderIndex: Number(p.sort_order ?? p.order_index ?? p.orderIndex ?? 0),
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

  const handleDelete = async () => {
    const { productId } = deleteDialog;
    setDeleteDialog({ isOpen: false, productId: 0, productName: '' });
    programmaticCloseDialog();
    try {
      const res = await deleteAdminCourierProduct(productId);
      if (!res.ok) throw new Error('상품 삭제에 실패했습니다.');
      setProducts(prev => prev.filter(p => p.id !== productId));
      show('상품이 삭제되었습니다.', { variant: 'success' });
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierProductPage - handleDelete');
      show(getSafeErrorMessage(e, '상품 삭제 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  const handleToggleVisible = async () => {
    const { productId, newVisible } = toggleDialog;
    setToggleDialog({ isOpen: false, productId: 0, productName: '', newVisible: true });
    programmaticCloseDialog();
    try {
      const res = await toggleAdminCourierProductVisible(productId);
      if (!res.ok) throw new Error('노출 상태 변경에 실패했습니다.');
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, visible: newVisible } : p));
      show(`상품이 ${newVisible ? '노출' : '숨김'} 처리되었습니다.`, { variant: 'success' });
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierProductPage - handleToggleVisible');
      show(getSafeErrorMessage(e, '노출 상태 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  const handleToggleRecommend = async (productId: number) => {
    try {
      const res = await toggleAdminCourierProductRecommend(productId);
      if (!res.ok) throw new Error('추천 상태 변경에 실패했습니다.');
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, recommended: !p.recommended } : p));
      const target = products.find(p => p.id === productId);
      show(`추천 상태가 ${target?.recommended ? '해제' : '설정'}되었습니다.`, { variant: 'success' });
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierProductPage - handleToggleRecommend');
      show(getSafeErrorMessage(e, '추천 상태 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">택배 상품 관리</h1>
          <AdminCourierHeader />
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-20 h-20 bg-gray-200 rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                  </div>
                </div>
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

        {/* Product list */}
        {!loading && products.length > 0 && (
          <div className="space-y-3">
            {products.map(product => (
              <div key={product.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex gap-4">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-20 h-20 object-cover rounded border flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <h3 className="text-sm font-semibold text-gray-800 truncate">{product.name}</h3>
                    <p className="text-sm text-gray-500">가격: {formatPrice(product.price)}</p>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span>재고: {product.stock}개</span>
                      <span>판매: {product.totalSold}개</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border ${
                        product.visible
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-red-100 text-red-700 border-red-300'
                      }`}>
                        {product.visible ? '노출 O' : '노출 X'}
                      </span>
                      {product.stock === 0 && (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border bg-blue-100 text-blue-700 border-blue-300">
                          품절
                        </span>
                      )}
                      {product.recommended && (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border bg-yellow-100 text-yellow-700 border-yellow-300">
                          추천
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-3 grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/courier/products/${product.id}/edit`)}
                    className="h-8 rounded border border-gray-300 hover:bg-gray-50 text-sm text-gray-700"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setToggleDialog({
                        isOpen: true,
                        productId: product.id,
                        productName: product.name,
                        newVisible: !product.visible,
                      });
                      pushDialogState();
                    }}
                    className={`h-8 rounded font-medium text-sm text-white transition ${
                      product.visible
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-rose-500 hover:bg-rose-600'
                    }`}
                  >
                    {product.visible ? '노출 O' : '노출 X'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleRecommend(product.id)}
                    className={`h-8 rounded font-medium text-sm text-white transition ${
                      product.recommended
                        ? 'bg-yellow-500 hover:bg-yellow-600'
                        : 'bg-gray-400 hover:bg-gray-500'
                    }`}
                  >
                    {product.recommended ? '추천 O' : '추천 X'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteDialog({ isOpen: true, productId: product.id, productName: product.name });
                      pushDialogState();
                    }}
                    className="h-8 rounded bg-gray-700 text-white hover:bg-gray-800 text-sm"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toggle visible dialog */}
      {toggleDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">노출 상태 변경</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{toggleDialog.productName}"</span> 상품을
              {toggleDialog.newVisible ? ' 목록에 노출' : ' 목록에서 숨김'} 처리합니다.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setToggleDialog({ isOpen: false, productId: 0, productName: '', newVisible: true });
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleToggleVisible}
                className={`flex-1 h-10 rounded text-white font-medium ${
                  toggleDialog.newVisible ? 'bg-green-500 hover:bg-green-600' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      {deleteDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">상품 삭제</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{deleteDialog.productName}"</span> 상품을 삭제합니다.
              <br />
              <span className="text-sm text-red-600">이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteDialog({ isOpen: false, productId: 0, productName: '' });
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 h-10 rounded bg-red-500 text-white hover:bg-red-600"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
