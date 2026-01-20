import React, { useEffect, useState, useCallback } from 'react';
import { useSnackbar } from '../../components/snackbar';
import AdminHeader from '../../components/AdminHeader';
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
  getAdminProductCategories,
  deleteAdminProductCategory,
  updateAdminProductCategoryOrder,
  getCategoryPresignedUrl,
  addAdminProductCategory,
  updateAdminProductCategory
} from '../../utils/api';
import { compressImageSquare } from '../../utils/image-compress';
import { theme, defaultKeywordImage } from '../../brand';
import CategoryProductDialog from '../../components/admin/CategoryProductDialog';

// 카테고리 타입 정의
type CategoryItem = {
  id: number;
  name: string;
  imageUrl?: string;
  productIds: number[];
};

// 상단 설정
const MAX_CATEGORY_COUNT = 9;

// 이미지 URL 절대경로 변환 유틸
const getDisplayUrl = (url?: string) => {
  if (!url) return defaultKeywordImage;
  if (url.startsWith('http')) return url;
  const baseUrl = theme.config.imgUrl;
  const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
  return `${baseUrl}/${cleanUrl}`;
};

interface SortableItemProps {
  item: CategoryItem;
  onDelete: (name: string) => void;
  onEdit: (item: CategoryItem) => void;
  onManageProducts: (item: CategoryItem) => void;
  deleting: string | null;
}

function SortableItem({ item, onDelete, onEdit, onManageProducts, deleting }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.name });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center mb-2 text-sm bg-gray-50 border rounded px-2 py-2"
    >
      <div {...attributes} {...listeners} className="cursor-move mr-3 text-gray-400 hover:text-gray-600 px-1">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>

      <img
        src={getDisplayUrl(item.imageUrl)}
        alt={item.name}
        className="w-10 h-10 rounded object-cover mr-3 flex-shrink-0 border border-gray-100 shadow-sm"
      />

      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-800 truncate">{item.name}</div>
        <div className="text-[10px] text-gray-500">상품수: <span className="text-orange-600 font-semibold">{item.productIds?.length || 0}개</span></div>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center ml-auto">
        <button
          onClick={() => onManageProducts(item)}
          className="text-[10px] font-bold px-2 py-1 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-100 transition-colors whitespace-nowrap"
        >
          상품관리
        </button>
        <button
          onClick={() => onEdit(item)}
          className="text-[10px] font-bold px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 transition-colors whitespace-nowrap"
        >
          수정
        </button>
        <button
          onClick={() => onDelete(item.name)}
          disabled={!!deleting}
          className="text-[10px] font-bold px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-200 border border-red-100 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {deleting === item.name ? '...' : '삭제'}
        </button>
      </div>
    </li>
  );
}

export default function AdminCategoryPage() {
  const { show } = useSnackbar();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [managingItem, setManagingItem] = useState<CategoryItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminProductCategories();
      const rawList = Array.isArray(res) ? res : Array.isArray(res.response) ? res.response : [];
      const list = rawList.map((item: any) => ({
        id: item.id || 0,
        name: item.name || '',
        imageUrl: item.image_url || item.imageUrl || undefined,
        productIds: item.product_ids || item.productIds || []
      }));
      setCategories(list);
    } catch (e: any) {
      show(e.message || '불러오기 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const categoryNameList = categories.map(c => c.name);

  const canAdd = (
    input.trim().length > 0 &&
    input.trim().length <= 5 &&
    !categoryNameList.includes(input.trim()) &&
    categories.length < MAX_CATEGORY_COUNT
  );

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageSquare(file, 200);
      setSelectedImage(compressed);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(compressed));
    } catch (err) {
      show('이미지 처리 중 오류 발생', { variant: 'error' });
    }
    e.target.value = '';
  };

  const uploadImage = async (file: File) => {
    const presignedRes = await getCategoryPresignedUrl(file.name, file.type);
    if (!presignedRes.ok) throw new Error('이미지 업로드 URL 발급 실패');
    const { url, key, method } = await presignedRes.json();
    const uploadRes = await fetch(url, {
      method: (method || 'PUT').toUpperCase(),
      body: file,
      mode: 'cors',
    });
    if (!uploadRes.ok) throw new Error(`S3 업로드 실패: ${uploadRes.status}`);
    return key;
  };

  const handleAdd = async () => {
    if (!canAdd) return;
    setAdding(true);
    try {
      let imageKey: string | undefined;
      if (selectedImage) imageKey = await uploadImage(selectedImage);

      await addAdminProductCategory(input.trim(), imageKey);
      setInput('');
      setSelectedImage(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      show('카테고리가 추가되었습니다.', { variant: 'success' });
      await load();
    } catch (e: any) {
      show(e.message, { variant: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingItem) return;
    setAdding(true);
    try {
      let imageKey: string | undefined;
      if (selectedImage) imageKey = await uploadImage(selectedImage);

      await updateAdminProductCategory(editingItem.id, editName.trim(), imageKey);
      setEditingItem(null);
      setSelectedImage(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      show('카테고리가 수정되었습니다.', { variant: 'success' });
      await load();
    } catch (e: any) {
      show(e.message, { variant: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`'${name}' 카테고리를 삭제하시겠습니까? 연결된 상품과의 매핑도 해제됩니다.`)) return;
    setDeleting(name);
    try {
      await deleteAdminProductCategory(name);
      show('삭제 완료', { variant: 'success' });
      await load();
    } catch (e: any) {
      show(e.message, { variant: 'error' });
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
    const oldIndex = categoryNameList.indexOf(active.id);
    const newIndex = categoryNameList.indexOf(over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);
    try {
      await updateAdminProductCategoryOrder(reordered.map(c => ({ id: c.id, name: c.name, imageUrl: c.imageUrl })));
    } catch (e: any) {
      show(e.message, { variant: 'error' });
    }
  };

  return (
    <main className="max-w-lg mx-auto py-8 px-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">📁 카테고리 관리</h1>
        <AdminHeader />
      </div>

      <div className="border bg-white rounded-xl shadow mb-8 overflow-hidden">
        <div className="bg-gray-50 border-b px-6 py-4 flex justify-between items-center">
          <div className="text-sm font-semibold text-gray-700">
            {editingItem ? '✏️ 카테고리 수정' : '카테고리 추가'}
          </div>
          {editingItem && (
            <button onClick={() => {
              setEditingItem(null);
              setSelectedImage(null);
              if (previewUrl) setPreviewUrl(null);
            }} className="text-xs text-blue-600 font-bold hover:underline">취소</button>
          )}
        </div>

        <div className="p-6">
          <div className="flex gap-4 items-start">
            {/* 이미지 선택 */}
            <div className="flex-shrink-0">
              <div className="relative group">
                <div className={`w-16 h-16 rounded-full overflow-hidden border-2 flex items-center justify-center bg-gray-50 transition-colors ${selectedImage || editingItem?.imageUrl ? 'border-orange-400' : 'border-gray-200'}`}>
                  {previewUrl ? (
                    <img src={previewUrl} alt="미리보기" className="w-full h-full object-cover" />
                  ) : editingItem?.imageUrl ? (
                    <img src={getDisplayUrl(editingItem.imageUrl)} alt="기존이미지" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <span className="text-lg">📷</span>
                      <span className="text-[9px] leading-tight mt-0.5 text-center">이미지</span>
                    </div>
                  )}
                </div>
                <input
                  id="category-image"
                  type="file"
                  accept="image/png, image/jpeg"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <label htmlFor="category-image" className="absolute inset-0 cursor-pointer rounded-full" />
              </div>
            </div>

            {/* 입력 영역 */}
            <div className="flex-1 flex flex-col gap-2 min-w-0 pt-0.5">
              <div className="flex flex-col gap-1 font-medium">
                <label className="text-xs text-gray-500 ml-1">카테고리 명칭</label>
                <div className="flex gap-2 items-center">
                  <input
                    value={editingItem ? editName : input}
                    onChange={e => editingItem ? setEditName(e.target.value.replace(/\s/g, '').slice(0, 5)) : setInput(e.target.value.replace(/\s/g, '').slice(0, 5))}
                    maxLength={5}
                    placeholder="최대 5자"
                    className="w-24 sm:w-32 h-11 px-3 rounded-lg border-2 border-gray-100 focus:border-orange-400 focus:outline-none text-base transition-colors"
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
                  <p className="text-[10px] text-gray-400 font-medium">* 5자 이내</p>
                  <p className="text-[10px] text-gray-400 font-mono font-bold">{(editingItem ? editName : input).length}/5</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border-t px-6 py-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">등록된 카테고리 목록 ({categories.length} / {MAX_CATEGORY_COUNT})</div>
          {loading ? (
            <div className="text-gray-500 text-sm">로딩 중...</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={categoryNameList} strategy={verticalListSortingStrategy}>
                <ul>
                  {categories.length === 0 && (
                    <li className="text-gray-400 text-sm">등록된 카테고리가 없습니다.</li>
                  )}
                  {categories.map((item) => (
                    <SortableItem
                      key={item.name}
                      item={item}
                      onDelete={handleDelete}
                      onEdit={(i) => {
                        setEditingItem(i);
                        setEditName(i.name);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      onManageProducts={(i) => setManagingItem(i)}
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

      {/* 상품 관리 다이얼로그 */}
      {managingItem && (
        <CategoryProductDialog
          categoryId={managingItem.id}
          categoryName={managingItem.name}
          initialProductIds={managingItem.productIds}
          onClose={() => setManagingItem(null)}
          onSuccess={load}
        />
      )}
    </main>
  );
}
