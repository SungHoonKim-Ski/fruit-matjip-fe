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
import { getAdminProductKeywords, deleteAdminProductKeyword, updateAdminProductKeywordOrder, getKeywordPresignedUrl, addAdminProductKeywordWithImage } from '../../utils/api';
import { compressImageSquare } from '../../utils/image-compress';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { theme, defaultKeywordImage } from '../../brand';

// 키워드 타입 정의
type KeywordItem = {
  keyword: string;
  keywordUrl?: string;
};

// 이미지 URL 절대경로 변환 유틸
const getDisplayUrl = (url?: string) => {
  if (!url) return defaultKeywordImage;
  if (url.startsWith('http')) return url;
  // S3 버킷 URL과 키 조합
  const baseUrl = theme.config.imgUrl;
  const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
  return `${baseUrl}/${cleanUrl}`;
};

function SortableItem({ item, onDelete, deleting }: { item: KeywordItem; onDelete: (keyword: string) => void; deleting: string | null }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.keyword });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center mb-2 text-base bg-gray-50 border rounded px-2 py-2"
    >
      {/* 이미지 썸네일 */}
      <img
        src={getDisplayUrl(item.keywordUrl)}
        alt={item.keyword}
        className="w-10 h-10 rounded object-cover mr-3 flex-shrink-0 border border-gray-200"
      />
      <span className="flex-1 font-mono cursor-move touch-none" {...listeners}>
        {item.keyword}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item.keyword);
        }}
        disabled={deleting === item.keyword}
        className="ml-2 text-xs px-3 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50"
      >
        삭제
      </button>
    </li>
  );
}

export default function AdminKeywordPage() {
  const { show } = useSnackbar();
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // 이미지 업로드 상태
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAdminProductKeywords();
      let list: KeywordItem[] = [];

      // 응답 형식에 따라 처리
      const rawList = Array.isArray(res) ? res : Array.isArray(res.response) ? res.response : [];

      // 문자열 배열 또는 객체 배열 모두 지원
      list = rawList.map((item: string | any) => {
        if (typeof item === 'string') {
          return { keyword: item, keywordUrl: undefined };
        }
        return {
          keyword: item.keyword || '',
          keywordUrl: item.keywordUrl || item.keyword_url || undefined,
        };
      });

      setKeywords(list);
    } catch (e: any) {
      show(e.message || '불러오기 실패', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // 미리보기 URL 정리
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const keywordList = keywords.map(k => k.keyword);

  const canAdd = (
    input.trim().length > 0 &&
    input.trim().length <= 5 &&
    !keywordList.includes(input.trim()) &&
    keywords.length < 10
  );

  // 이미지 선택 핸들러
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
      show('.PNG/.JPG 파일만 업로드할 수 있습니다.', { variant: 'error' });
      e.target.value = '';
      return;
    }

    try {
      const compressed = await compressImageSquare(file, 200);
      setSelectedImage(compressed);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(compressed));
    } catch (err) {
      safeErrorLog(err, 'AdminKeywordPage - compress');
      show(getSafeErrorMessage(err, '이미지 처리 중 오류가 발생했습니다.'), { variant: 'error' });
    }
    e.target.value = '';
  };

  const handleAdd = async () => {
    if (!canAdd) return;
    setAdding(true);
    try {
      let imageKey: string | undefined;

      // 이미지가 선택된 경우 업로드
      if (selectedImage) {
        // 1) presigned URL 요청
        const presignedRes = await getKeywordPresignedUrl(selectedImage.name, selectedImage.type);
        if (!presignedRes.ok) {
          if (presignedRes.status === 401 || presignedRes.status === 403) return;
          throw new Error('이미지 업로드 URL 발급 실패');
        }

        const presignedData = await presignedRes.json();
        const { url, key, method } = presignedData;
        if (!url || !key) throw new Error('Presigned 응답에 url 또는 key가 없습니다.');

        // 2) S3 업로드
        const uploadRes = await fetch(url, {
          method: (method || 'PUT').toUpperCase(),
          body: selectedImage,
          mode: 'cors',
        });
        if (!uploadRes.ok) {
          throw new Error(`S3 업로드 실패: ${uploadRes.status}`);
        }

        imageKey = key;
      }

      // 3) 키워드 추가 API 호출
      await addAdminProductKeywordWithImage(input.trim(), imageKey);

      setInput('');
      setSelectedImage(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
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
    const oldIndex = keywordList.indexOf(active.id);
    const newIndex = keywordList.indexOf(over.id);
    const reordered = arrayMove(keywords, oldIndex, newIndex);
    setKeywords(reordered);
    try {
      await updateAdminProductKeywordOrder(reordered.map(k => ({ keyword: k.keyword, keywordUrl: k.keywordUrl })));
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

      <div className="border bg-white rounded-xl shadow mb-8 overflow-hidden">
        <div className="bg-gray-50 border-b px-6 py-4">
          <div className="text-sm font-semibold text-gray-700">추천 검색어 추가</div>
        </div>

        <div className="p-6">
          <div className="flex gap-4 items-start">
            {/* 이미지 선택 부분 */}
            <div className="flex-shrink-0">
              <div className="relative group">
                <div className={`w-16 h-16 rounded-full overflow-hidden border-2 flex items-center justify-center bg-gray-50 transition-colors ${selectedImage ? 'border-orange-400' : 'border-gray-200'}`}>
                  {previewUrl ? (
                    <img src={previewUrl} alt="미리보기" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <span className="text-lg">📷</span>
                      <span className="text-[9px] leading-tight mt-0.5 text-center">이미지</span>
                    </div>
                  )}
                </div>
                <input
                  id="keyword-image"
                  type="file"
                  accept="image/png, image/jpeg"
                  onChange={handleImageChange}
                  className="hidden"
                  disabled={adding || keywords.length >= 10}
                />
                <label
                  htmlFor="keyword-image"
                  className="absolute inset-0 cursor-pointer rounded-full"
                  title="이미지 선택"
                />
                {selectedImage && (
                  <button
                    onClick={() => {
                      setSelectedImage(null);
                      if (previewUrl) {
                        URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(null);
                      }
                    }}
                    className="absolute -top-1 -right-1 bg-white border shadow-sm rounded-full w-5 h-5 flex items-center justify-center text-red-500 hover:text-red-600 z-10 text-sm"
                    title="제거"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* 텍스트 입력 및 추가 버튼 */}
            <div className="flex-1 flex flex-col gap-2 min-w-0 pt-0.5">
              <div className="flex flex-col gap-1 font-medium">
                <label className="text-xs text-gray-500 ml-1">키워드 명칭</label>
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value.replace(/\s/g, '').slice(0, 5))}
                    maxLength={5}
                    placeholder="최대 5자"
                    className="w-24 flex-1 h-11 px-3 rounded-lg border-2 border-gray-100 focus:border-orange-400 focus:outline-none text-base transition-colors"
                    disabled={adding || keywords.length >= 10}
                  />
                  <button
                    onClick={handleAdd}
                    disabled={!canAdd || adding}
                    className={`h-11 px-4 rounded-lg text-white font-bold transition-all shadow-sm flex-shrink-0 ${canAdd && !adding
                      ? 'bg-orange-500 hover:bg-orange-600 hover:shadow active:scale-95'
                      : 'bg-gray-300 cursor-not-allowed'
                      }`}
                  >
                    {adding ? '...' : '추가'}
                  </button>
                </div>
                <div className="flex justify-between items-center mt-0.5 px-1">
                  <p className="text-[10px] text-gray-400">* 5자 이내</p>
                  <p className="text-[10px] text-gray-400">{input.length}/5</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border-t px-6 py-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">등록된 키워드 목록 ({keywords.length} / 10)</div>
          {loading ? <div className="text-gray-500">로딩 중...</div> :
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={keywordList} strategy={verticalListSortingStrategy}>
                <ul>
                  {keywords.length === 0 && <li className="text-gray-400">등록된 추천 검색어가 없습니다.</li>}
                  {keywords.map((item) => (
                    <SortableItem key={item.keyword} item={item} onDelete={handleDelete} deleting={deleting} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          }
        </div>
        <p className="text-xs text-gray-500 px-6 py-4 mt-5"> * 중복 불가, 추가/삭제 및 순서 변경 시 자동 저장 (드래그로 이동 가능)</p>
      </div>
    </main>
  );
}
