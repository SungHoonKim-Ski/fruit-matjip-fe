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
} from '../../../utils/api';

type CategoryItem = {
  id: number;
  name: string;
  sortOrder: number;
};

interface SortableItemProps {
  item: CategoryItem;
  onDelete: (item: CategoryItem) => void;
  onEdit: (item: CategoryItem) => void;
  deleting: number | null;
}

function SortableItem({ item, onDelete, onEdit, deleting }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center mb-2 text-sm bg-gray-50 border rounded px-3 py-2.5"
    >
      <div {...attributes} {...listeners} className="cursor-move mr-3 text-gray-400 hover:text-gray-600 px-1">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </div>
      <span className="flex-1 font-medium text-gray-800">{item.name}</span>
      <div className="flex gap-1.5 ml-auto">
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
    </li>
  );
}

export default function AdminCourierCategoryPage() {
  const { show } = useSnackbar();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminCourierCategoriesList();
      if (!res.ok) throw new Error('카테고리 목록을 불러오지 못했습니다.');
      const data = await res.json();
      const list = Array.isArray(data?.response) ? data.response : (Array.isArray(data) ? data : []);
      setCategories(list.map((c: any) => ({
        id: Number(c.id),
        name: String(c.name ?? ''),
        sortOrder: Number(c.sortOrder ?? 0),
      })));
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierCategoryPage - load');
      show(getSafeErrorMessage(e, '카테고리 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <main className="max-w-lg mx-auto py-8 px-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">택배 카테고리 관리</h1>
        <AdminCourierHeader />
      </div>

      <div className="border bg-white rounded-xl shadow mb-8 overflow-hidden">
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
          <div className="text-sm font-semibold text-gray-700 mb-3">등록된 카테고리 ({categories.length}개)</div>
          {loading ? (
            <div className="text-gray-500 text-sm">로딩 중...</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <ul>
                  {categories.length === 0 && (
                    <li className="text-gray-400 text-sm">등록된 카테고리가 없습니다.</li>
                  )}
                  {categories.map(item => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      onDelete={handleDelete}
                      onEdit={i => {
                        setEditingItem(i);
                        setEditName(i.name);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
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
    </main>
  );
}
