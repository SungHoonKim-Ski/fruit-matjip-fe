import React, { useEffect, useState, useCallback } from 'react';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getAdminCourierCategoriesList,
  createAdminCourierCategory,
  updateAdminCourierCategory,
  deleteAdminCourierCategory,
  updateAdminCourierCategoryOrder,
  getAdminCourierProducts,
  toggleAdminCourierProductRecommend,
  getAdminCourierCategoryProducts,
  updateAdminCourierCategoryProducts,
} from '../../../utils/api';

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

type CategoryItem = {
  id: number;
  name: string;
  sortOrder: number;
};

type CourierProduct = {
  id: number;
  name: string;
  price: number;
  productUrl?: string;
  recommended?: boolean;
};

// ===== Courier Product Dialog =====

interface CourierProductDialogProps {
  title: string;
  allProducts: CourierProduct[];
  initialSelectedIds: number[];
  onClose: () => void;
  onSave: (selectedIds: number[]) => Promise<void>;
}

function CourierProductDialog({ title, allProducts, initialSelectedIds, onClose, onSave }: CourierProductDialogProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedIds);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalStyle; };
  }, []);

  const filteredProducts = allProducts.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.includes(p.id));

  const handleSelectAll = () => {
    const filteredIds = filteredProducts.map(p => p.id);
    setSelectedIds(prev => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleDeselectAll = () => {
    const filteredIds = filteredProducts.map(p => p.id);
    setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
  };

  const handleToggle = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selectedIds);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 bg-gray-50 border-b">
          <input
            type="text"
            placeholder="상품명 검색"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
          {filteredProducts.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">상품이 없습니다.</div>
          ) : (
            <div className="space-y-1">
              {filteredProducts.map(p => {
                const isSelected = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => handleToggle(p.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                      isSelected ? 'bg-orange-50 border-orange-100' : 'hover:bg-gray-50 border-transparent'
                    } border`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-300'
                    }`}>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {p.productUrl && (
                      <img
                        src={`${IMG_BASE}/${p.productUrl}`}
                        className="w-10 h-10 rounded object-cover border bg-gray-100"
                        alt=""
                      />
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.price.toLocaleString()}원</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex flex-col gap-3">
          <button
            onClick={isAllSelected ? handleDeselectAll : handleSelectAll}
            className={`w-full py-2 rounded-lg text-xs font-bold transition-all border ${
              isAllSelected
                ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                : 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100'
            }`}
          >
            {isAllSelected ? '전체 선택 해제' : '전체 선택'}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-[2] py-3 rounded-xl font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-all shadow-md active:scale-95 flex items-center justify-center"
            >
              {saving ? '저장 중...' : `${selectedIds.length}개 저장`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Sortable Category Item =====

interface SortableItemProps {
  item: CategoryItem;
  products: CourierProduct[];
  onDelete: (item: CategoryItem) => void;
  onEdit: (item: CategoryItem) => void;
  onManageProducts: (item: CategoryItem) => void;
  deleting: number | null;
}

function SortableItem({ item, products, onDelete, onEdit, onManageProducts, deleting }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="mb-2 text-sm bg-gray-50 border rounded px-3 py-2.5"
    >
      <div className="flex items-center">
        <div {...attributes} {...listeners} className="cursor-move mr-3 text-gray-400 hover:text-gray-600 px-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
        <span className="flex-1 font-medium text-gray-800">{item.name}</span>
        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={() => onManageProducts(item)}
            className="text-[11px] font-bold px-2.5 py-1 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-100 transition-colors"
          >
            상품관리
          </button>
          <button
            onClick={() => onEdit(item)}
            className="text-[11px] font-bold px-2.5 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 transition-colors"
          >
            수정
          </button>
          <button
            onClick={() => onDelete(item)}
            disabled={deleting === item.id}
            className="text-[11px] font-bold px-2.5 py-1 rounded bg-red-50 text-red-600 hover:bg-red-200 border border-red-100 disabled:opacity-50 transition-colors"
          >
            {deleting === item.id ? '...' : '삭제'}
          </button>
        </div>
      </div>
      {products.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
          {products.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700 border border-orange-200">
              {p.name}
            </span>
          ))}
        </div>
      )}
      {products.length === 0 && (
        <div className="mt-1 pl-8 text-[11px] text-gray-400">연결된 상품 없음</div>
      )}
    </li>
  );
}

// ===== Main Page =====

export default function AdminCourierCategoryPage() {
  const { show } = useSnackbar();

  // Categories
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [editName, setEditName] = useState('');

  // All courier products
  const [allProducts, setAllProducts] = useState<CourierProduct[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);

  // Category products map: categoryId -> product list
  const [categoryProductsMap, setCategoryProductsMap] = useState<Record<number, CourierProduct[]>>({});

  // Dialog state
  type DialogMode =
    | { type: 'recommended' }
    | { type: 'category'; categoryId: number; categoryName: string };

  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);

  const loadAllProducts = useCallback(async () => {
    try {
      const res = await getAdminCourierProducts();
      if (!res.ok) throw new Error('상품 목록을 불러오지 못했습니다.');
      const data = await res.json();
      const list: CourierProduct[] = Array.isArray(data?.response)
        ? data.response
        : Array.isArray(data) ? data : [];
      setAllProducts(list.map((p: any) => ({
        id: Number(p.id),
        name: String(p.name ?? ''),
        price: Number(p.price ?? 0),
        productUrl: p.productUrl ?? p.product_url ?? undefined,
        recommended: Boolean(p.recommended ?? false),
      })));
      setProductsLoaded(true);
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - loadAllProducts');
      show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  }, [show]);

  const loadCategoryProducts = useCallback(async (categoryId: number) => {
    try {
      const res = await getAdminCourierCategoryProducts(categoryId);
      if (!res.ok) return;
      const data = await res.json();
      const list: CourierProduct[] = Array.isArray(data?.response)
        ? data.response
        : Array.isArray(data) ? data : [];
      setCategoryProductsMap(prev => ({
        ...prev,
        [categoryId]: list.map((p: any) => ({
          id: Number(p.id),
          name: String(p.name ?? ''),
          price: Number(p.price ?? 0),
          productUrl: p.productUrl ?? p.product_url ?? undefined,
        })),
      }));
    } catch (e: any) {
      safeErrorLog(e, `AdminCourierCategoryPage - loadCategoryProducts(${categoryId})`);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminCourierCategoriesList();
      if (!res.ok) throw new Error('카테고리 목록을 불러오지 못했습니다.');
      const data = await res.json();
      const list: CategoryItem[] = (Array.isArray(data?.response) ? data.response : (Array.isArray(data) ? data : [])).map((c: any) => ({
        id: Number(c.id),
        name: String(c.name ?? ''),
        sortOrder: Number(c.sortOrder ?? 0),
      }));
      setCategories(list);
      list.forEach(c => loadCategoryProducts(c.id));
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - load');
      show(getSafeErrorMessage(e, '카테고리 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [show, loadCategoryProducts]);

  useEffect(() => {
    load();
    loadAllProducts();
  }, [load, loadAllProducts]);

  const categoryNames = categories.map(c => c.name);
  const canAdd = input.trim().length > 0 && input.trim().length <= 10 && !categoryNames.includes(input.trim());

  const handleAdd = async () => {
    if (!canAdd) return;
    setAdding(true);
    try {
      const res = await createAdminCourierCategory({ name: input.trim() });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || '카테고리 추가에 실패했습니다.');
      }
      setInput('');
      show('카테고리가 추가되었습니다.', { variant: 'success' });
      await load();
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - handleAdd');
      show(getSafeErrorMessage(e, '카테고리 추가 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingItem || !editName.trim()) return;
    setAdding(true);
    try {
      const res = await updateAdminCourierCategory(editingItem.id, { name: editName.trim() });
      if (!res.ok) throw new Error('카테고리 수정에 실패했습니다.');
      setEditingItem(null);
      show('카테고리가 수정되었습니다.', { variant: 'success' });
      await load();
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - handleUpdate');
      show(getSafeErrorMessage(e, '카테고리 수정 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (item: CategoryItem) => {
    if (!window.confirm(`'${item.name}' 카테고리를 삭제하시겠습니까?`)) return;
    setDeleting(item.id);
    try {
      const res = await deleteAdminCourierCategory(item.id);
      if (!res.ok) throw new Error('카테고리 삭제에 실패했습니다.');
      show('카테고리가 삭제되었습니다.', { variant: 'success' });
      await load();
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - handleDelete');
      show(getSafeErrorMessage(e, '카테고리 삭제 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setDeleting(null);
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex(c => c.id === active.id);
    const newIndex = categories.findIndex(c => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);
    try {
      const res = await updateAdminCourierCategoryOrder(reordered.map(c => c.id));
      if (!res.ok) throw new Error('순서 변경에 실패했습니다.');
      show('순서가 저장되었습니다.', { variant: 'success' });
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - handleDragEnd');
      show(getSafeErrorMessage(e, '순서 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  // Recommended products (from product recommended flag)
  const recommendedProducts = allProducts.filter(p => p.recommended);

  const handleSaveRecommended = async (selectedIds: number[]) => {
    const currentRecommendedIds = new Set(recommendedProducts.map(p => p.id));
    const nextIds = new Set(selectedIds);
    const toEnable = selectedIds.filter(id => !currentRecommendedIds.has(id));
    const toDisable = [...currentRecommendedIds].filter(id => !nextIds.has(id));
    const toToggle = [...toEnable, ...toDisable];
    try {
      await Promise.all(toToggle.map(id => toggleAdminCourierProductRecommend(id)));
      show('추천 상품이 업데이트되었습니다.', { variant: 'success' });
      await loadAllProducts();
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - handleSaveRecommended');
      throw new Error(getSafeErrorMessage(e, '추천 상품 저장 중 오류가 발생했습니다.'));
    }
  };

  const handleSaveCategoryProducts = async (categoryId: number, selectedIds: number[]) => {
    try {
      const res = await updateAdminCourierCategoryProducts(categoryId, selectedIds);
      if (!res.ok) throw new Error('카테고리 상품 저장에 실패했습니다.');
      show('카테고리 상품이 업데이트되었습니다.', { variant: 'success' });
      await loadCategoryProducts(categoryId);
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - handleSaveCategoryProducts');
      throw new Error(getSafeErrorMessage(e, '카테고리 상품 저장 중 오류가 발생했습니다.'));
    }
  };

  const openRecommendedDialog = () => {
    if (!productsLoaded) return;
    setDialogMode({ type: 'recommended' });
  };

  const openCategoryDialog = (item: CategoryItem) => {
    if (!productsLoaded) return;
    setDialogMode({ type: 'category', categoryId: item.id, categoryName: item.name });
  };

  const getDialogInitialIds = (): number[] => {
    if (!dialogMode) return [];
    if (dialogMode.type === 'recommended') {
      return recommendedProducts.map(p => p.id);
    }
    return (categoryProductsMap[dialogMode.categoryId] ?? []).map(p => p.id);
  };

  return (
    <main className="max-w-lg mx-auto py-8 px-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">택배 카테고리 관리</h1>
        <AdminCourierHeader />
      </div>

      <div className="border bg-white rounded-xl shadow mb-6 overflow-hidden">
        <div className="bg-gray-50 border-b px-6 py-4 flex justify-between items-center">
          <div className="text-sm font-semibold text-gray-700">
            {editingItem ? '카테고리 수정' : '카테고리 추가'}
          </div>
          {editingItem && (
            <button onClick={() => setEditingItem(null)} className="text-xs text-blue-600 font-bold hover:underline">취소</button>
          )}
        </div>

        <div className="p-6">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 ml-1">카테고리 명칭</label>
            <div className="flex gap-2 items-center">
              <input
                value={editingItem ? editName : input}
                onChange={e => editingItem ? setEditName(e.target.value.replace(/\s/g, '').slice(0, 10)) : setInput(e.target.value.replace(/\s/g, '').slice(0, 10))}
                maxLength={10}
                placeholder="최대 10자"
                className="flex-1 h-11 px-3 rounded-lg border-2 border-gray-100 focus:border-orange-400 focus:outline-none text-base transition-colors"
                onKeyDown={e => { if (e.key === 'Enter') editingItem ? handleUpdate() : handleAdd(); }}
              />
              <button
                onClick={editingItem ? handleUpdate : handleAdd}
                disabled={(!editingItem && !canAdd) || adding}
                className={`h-11 px-6 rounded-lg font-bold transition-all flex-shrink-0 ${(editingItem || canAdd) && !adding
                  ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-100'
                  : 'bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed'
                }`}
              >
                {adding ? '...' : editingItem ? '저장' : '추가'}
              </button>
            </div>
            <div className="flex justify-between items-center mt-1 px-1">
              <p className="text-[10px] text-gray-400 font-medium">* 10자 이내</p>
              <p className="text-[10px] text-gray-400 font-mono font-bold">{(editingItem ? editName : input).length}/10</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border-t px-6 py-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">등록된 카테고리 ({categories.length + 1}개)</div>
          {loading ? (
            <div className="text-gray-500 text-sm">로딩 중...</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <ul>
                  {/* 추천 상품: FE static 항목 — 수정/삭제/드래그 불가, 상품관리만 가능 */}
                  <li className="mb-2 text-sm bg-orange-50 border border-orange-200 rounded px-3 py-2.5">
                    <div className="flex items-center">
                      <div className="mr-3 text-orange-300 px-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </div>
                      <span className="flex-1 font-medium text-orange-700">추천 상품</span>
                      <button
                        onClick={openRecommendedDialog}
                        disabled={!productsLoaded}
                        className="text-[11px] font-bold px-2.5 py-1 rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                      >
                        상품관리
                      </button>
                    </div>
                    {recommendedProducts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
                        {recommendedProducts.map(p => (
                          <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700 border border-orange-200">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {recommendedProducts.length === 0 && (
                      <div className="mt-1 pl-8 text-[11px] text-orange-400">연결된 상품 없음</div>
                    )}
                  </li>

                  {categories.map(item => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      products={categoryProductsMap[item.id] ?? []}
                      onDelete={handleDelete}
                      onEdit={i => {
                        setEditingItem(i);
                        setEditName(i.name);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      onManageProducts={openCategoryDialog}
                      deleting={deleting}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          <p className="text-[10px] text-gray-500 mt-4 leading-relaxed">
            * 추가/삭제 및 순서 변경 시 자동 저장 (드래그로 이동 가능)
          </p>
        </div>
      </div>

      {/* Dialog */}
      {dialogMode && (
        <CourierProductDialog
          title={
            dialogMode.type === 'recommended'
              ? '추천 상품 관리'
              : `"${dialogMode.categoryName}" 카테고리 상품 관리`
          }
          allProducts={allProducts}
          initialSelectedIds={getDialogInitialIds()}
          onClose={() => setDialogMode(null)}
          onSave={async (selectedIds) => {
            if (dialogMode.type === 'recommended') {
              await handleSaveRecommended(selectedIds);
            } else {
              await handleSaveCategoryProducts(dialogMode.categoryId, selectedIds);
            }
          }}
        />
      )}
    </main>
  );
}
