import React, { useEffect, useState } from 'react';
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
import { getAdminProductKeywords, addAdminProductKeyword, deleteAdminProductKeyword, updateAdminProductKeywordOrder } from '../../utils/api';

function SortableItem({ id, onDelete, deleting }: { id: string; onDelete: (id: string) => void; deleting: string | null }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center mb-2 text-base bg-gray-50 border rounded px-2 py-1"
    >
      <span className="flex-1 font-mono cursor-move touch-none" {...listeners}>
        {id}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(id);
        }}
        disabled={deleting === id}
        className="ml-2 text-xs px-3 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50"
      >
        삭제
      </button>
    </li>
  );
}

export default function AdminKeywordPage() {
  const { show } = useSnackbar();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAdminProductKeywords();
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res.response)
          ? res.response
          : [];
      setKeywords(list);
    } catch (e: any) {
      show(e.message || '불러오기 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const canAdd = (
    input.trim().length > 0 &&
    input.trim().length <= 5 &&
    !keywords.includes(input.trim()) &&
    keywords.length < 7
  );

  const handleAdd = async () => {
    if (!canAdd) return;
    setAdding(true);
    try {
      await addAdminProductKeyword(input.trim());
      setInput('');
      show('추천 검색어가 추가되었습니다.', { variant: 'success' });
      await load();
    } catch (e: any) {
      show(e.message, { variant: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (word: string) => {
    setDeleting(word);
    try {
      await deleteAdminProductKeyword(word);
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
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = keywords.indexOf(active.id);
    const newIndex = keywords.indexOf(over.id);
    const reordered = arrayMove(keywords, oldIndex, newIndex);
    setKeywords(reordered);
    try {
      await updateAdminProductKeywordOrder(reordered);
      show('순서가 저장되었습니다.', { variant: 'success' });
    } catch (e: any) {
      show(e.message, { variant: 'error' });
    }
  };

  return (
    <main className="max-w-lg mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">🔎 추천 검색어 관리</h1>
            <div className="flex justify-end">
                <AdminHeader />
            </div>
        </div>
        </div>
      
      <div className="border bg-white rounded-xl p-6 shadow mb-8">
        <div className="mb-3">현재 추천 검색어 <b className="text-orange-500">{keywords.length}</b>/7개</div>
        <div className="flex items-center mb-4">
          <input
            value={input}
            onChange={e=>setInput(e.target.value.replace(/\s/g, '').slice(0,5))}
            maxLength={5}
            placeholder="검색어(최대 5자)"
            className="h-10 px-3 rounded border w-40 text-base focus:ring-orange-400"
            disabled={adding || keywords.length >= 7}
          />
          <div className="flex-1" />
          <button
            onClick={handleAdd}
            disabled={!canAdd || adding}
            className={`h-10 px-5 rounded text-white font-semibold ${canAdd && !adding ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-300'} transition`}
          >
            추가
          </button>
        </div>
        <div className="mt-3">
          {loading ? <div className="text-gray-500">로딩 중...</div>:
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={keywords} strategy={verticalListSortingStrategy}>
                <ul>
                  {keywords.length === 0 && <li className="text-gray-400">등록된 추천 검색어가 없습니다.</li>}
                  {keywords.map((word) => (
                    <SortableItem key={word} id={word} onDelete={handleDelete} deleting={deleting} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          }
        </div>
        <p className="text-xs text-gray-500 mt-5">* 최대 7개, 중복 불가, 추가/삭제 및 순서 변경 시 자동 저장 (드래그로 이동 가능)</p>
      </div>
    </main>
  );
}
