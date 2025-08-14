import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { getProductById, deleteProduct as mockDelete, updateProduct as mockUpdateProduct, mockUploadImage } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { updateAdminProduct, getUpdateUrl, deleteAdminProduct, getAdminProduct } from '../../utils/api';

// 상품 설명 글자 수 제한
const DESCRIPTION_LIMIT = 300;

type ProductEdit = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  sellDate?: string;       // YYYY-MM-DD
  description?: string;
  images?: string[];
};

export default function AdminEditProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { show } = useSnackbar();
  const API_BASE = process.env.REACT_APP_API_BASE ;

  const [form, setForm] = useState<ProductEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const additionalFileRef = useRef<HTMLInputElement>(null);
  const localPreviewUrlRef = useRef<string | null>(null);
  const initialFormRef = useRef<ProductEdit | null>(null);
  const [selectedAdditionalNames, setSelectedAdditionalNames] = useState<string[]>([]);
  const [additionalStock, setAdditionalStock] = useState<number>(0);

  const formatPrice = (price: number) =>
    price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

  const extractFileName = (url: string): string => {
    try {
      const withoutQuery = url.split('?')[0];
      const name = withoutQuery.substring(withoutQuery.lastIndexOf('/') + 1);
      return name || 'image';
    } catch {
      return 'image';
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (USE_MOCKS) {
          const data = getProductById(Number(id!));
          if (!data) throw new Error('상품 정보를 불러오지 못했습니다.');
          if (alive) {
            // 초기 상태 보관 (deep clone)
            const cloned: ProductEdit = JSON.parse(JSON.stringify(data));
            initialFormRef.current = cloned;
            setForm(cloned);
            setAdditionalStock(0);
          }
        } else {
          const res = await getAdminProduct(Number(id));
          if (!res.ok) throw new Error('상품 정보를 불러오지 못했습니다.');
          const data = (await res.json()) as ProductEdit;
          if (alive) setForm(data);
        }
      } catch (e: any) {
        safeErrorLog(e, 'AdminEditProductPage - loadProduct');
        show(getSafeErrorMessage(e, '상품 정보를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, show]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!form) return;
    const { name, value } = e.target as HTMLInputElement;
    if (name === 'price' || name === 'stock') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return;
      setForm({ ...form, [name]: n });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const uploadIfNeeded = async (): Promise<string | null> => {
    if (!fileRef.current?.files?.[0]) return null;
    const file = fileRef.current.files[0];
    
    if (USE_MOCKS) {
      // Mock 업로드 - 실제 파일 URL 반환
      await new Promise(resolve => setTimeout(resolve, 1000));
      return URL.createObjectURL(file);
    } else {
      try {

        
        const res = await getUpdateUrl(Number(id), file.name, file.type);
        if (!res.ok) {
          // 401, 403 에러는 통합 에러 처리로 위임
          if (res.status === 401 || res.status === 403) {
            return null; // adminFetch에서 이미 처리됨
          }
          throw new Error('업로드 URL을 가져오지 못했습니다.');
        }
        
        const { uploadUrl } = await res.json();
        
        // 파일 업로드
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          mode: 'cors',
          // S3 presigned URL에서는 Content-Type을 헤더로 설정하지 않음 (URL에 포함됨)
        });
        
        if (!uploadRes.ok) throw new Error('파일 업로드에 실패했습니다.');
        
        // 업로드된 파일 URL 반환 (실제로는 presigned URL에서 파일 URL을 추출해야 함)
        return uploadUrl.split('?')[0];
      } catch (e: any) {
        safeErrorLog(e, 'AdminEditProductPage - uploadIfNeeded');
        show(getSafeErrorMessage(e, '파일 업로드 중 오류가 발생했습니다.'), { variant: 'error' });
        return null;
      }
    }
  };

  const validateForm = () => {
    if (!form) return false;
    
    // 필수 필드 검증
    if (!form.name?.trim()) {
      show('상품명을 입력해주세요.', { variant: 'error' });
      return false;
    }
    
    if (form.price <= 0) {
      show('가격은 0보다 큰 값을 입력해주세요.', { variant: 'error' });
      return false;
    }
    
    if (form.stock < 0) {
      show('재고는 0 이상의 값을 입력해주세요.', { variant: 'error' });
      return false;
    }
    
    if (!form.imageUrl && !fileRef.current?.files?.[0]) {
      show('상품 이미지를 업로드해주세요.', { variant: 'error' });
      return false;
    }
    
    // 상품명 길이 검증
    if (form.name.trim().length > 100) {
      show('상품명은 100자 이하로 입력해주세요.', { variant: 'error' });
      return false;
    }
    
    // 설명 길이 검증 (HTML 태그 제외한 텍스트 길이)
    if (form.description) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = form.description;
      const textLength = tempDiv.innerText?.length || 0;
      if (textLength > DESCRIPTION_LIMIT) {
        show(`상품 설명은 ${DESCRIPTION_LIMIT}자 이하로 입력해주세요.`, { variant: 'error' });
        return false;
      }
    }
    
    return true;
  };

  const save = async () => {
    if (!form) return;
    
    // 유효성 검증
    if (!validateForm()) return;
    
    try {
      setSaving(true);
      const newImageUrl = await uploadIfNeeded();

      const payload = {
        name: form.name?.trim(),
        price: form.price,
        stock: Math.max(0, form.stock + additionalStock),
        imageUrl: newImageUrl ?? form.imageUrl,
        sellDate: form.sellDate?.trim() || null,
        description: form.description?.trim() || '',
        images: form.images && form.images.length ? form.images : undefined,
      };

      if (USE_MOCKS) {
        mockUpdateProduct({ id: form.id, ...payload });
      } else {
        const res = await updateAdminProduct(Number(id), payload);
        if (!res.ok) {
          // 401, 403 에러는 통합 에러 처리로 위임
          if (res.status === 401 || res.status === 403) {
            return; // adminFetch에서 이미 처리됨
          }
          throw new Error('저장에 실패했습니다.');
        }
      }

      show('저장되었습니다.');
      nav('/admin/products', { replace: true });
    } catch (e: any) {
      safeErrorLog(e, 'AdminEditProductPage - save');
      show(getSafeErrorMessage(e, '저장 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!form) return;
    if (!window.confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    try {
      if (USE_MOCKS) {
        mockDelete(form.id);
      } else {
        const res = await deleteAdminProduct(form.id);
        if (!res.ok) {
          // 401, 403 에러는 통합 에러 처리로 위임
          if (res.status === 401 || res.status === 403) {
            return; // adminFetch에서 이미 처리됨
          }
          throw new Error('삭제에 실패했습니다.');
        }
      }
      show('삭제되었습니다.');
      nav('/admin/products', { replace: true });
    } catch (e: any) {
      safeErrorLog(e, 'AdminEditProductPage - delete');
      show(getSafeErrorMessage(e, '삭제 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-16">
        <div className="max-w-md mx-auto">
          <div className="h-6 w-40 bg-gray-200 animate-pulse rounded" />
          <div className="mt-4 h-8 bg-gray-200 animate-pulse rounded" />
          <div className="mt-2 h-40 bg-gray-200 animate-pulse rounded" />
        </div>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-16">
        <div className="max-w-md mx-auto text-center text-gray-500">상품이 없습니다.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-16 pb-24">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b">
        <div className="mx-auto max-w-2xl h-14 flex items-center justify-between px-4">
          <button onClick={() => nav(-1)} className="text-sm text-gray-600">← 뒤로</button>
          <div className="font-bold text-gray-800">상품 수정</div>
          <div className="w-8" />
        </div>
      </header>

      <section className="max-w-2xl mx-auto bg-white rounded-lg shadow p-5">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="text-sm font-medium">상품명 <span className="text-red-500">*</span></label>
            <input
              name="name"
              value={form.name}
              onChange={onChange}
              className="mt-1 w-full h-10 border rounded px-3"
              placeholder="예) 신선한 토마토 1kg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
              <div>
              <label className="text-sm font-medium">가격 <span className="text-red-500">*</span></label>
              <div className="mt-1 relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-sm text-gray-500">₩</span>
                <input
                  name="price" type="number" min={0}
                  value={form.price}
                  onChange={onChange}
                  className="w-full h-10 border rounded pl-7 pr-3 text-center"
                />
              </div>
            </div>
              <div>
                <label className="text-sm font-medium">현재 재고</label>
                <div className="mt-1 relative">
                  <input
                    name="stock" type="number" min={0}
                    value={form.stock + additionalStock}
                    readOnly
                    aria-readonly="true"
                    className={`w-full h-10 border rounded pl-3 pr-12 text-center cursor-not-allowed select-none caret-transparent ${
                      form.stock + additionalStock > form.stock 
                        ? 'bg-green-100 text-green-700 border-green-300' 
                        : form.stock + additionalStock < form.stock 
                        ? 'bg-red-100 text-red-700 border-red-300' 
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-500">개</span>
                </div>
              </div>
          </div>          
        {/* 추가 재고 - 한 줄 전체 UI: "추가 재고"  - 0 + */}
        <div>
          <span className="text-sm font-medium text-gray-800">재고 변경</span>
            <div className="mt-1 h-10 grid grid-cols-[1fr_4fr_1fr] items-center border rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAdditionalStock(n => (form.stock + n - 1 >= 0 ? n - 1 : n))}
                  disabled={form.stock + additionalStock <= 0}
                  className={`h-full w-full text-base leading-none border-r ${form.stock + additionalStock <= 0 ? 'text-gray-300 bg-gray-50' : 'hover:bg-gray-50'}`}
                  aria-label="추가 재고 감소"
                >
                  −
                </button>
                <div className="h-full w-full flex items-center justify-center text-base">
                  {additionalStock}
                </div>
                <button
                  type="button"
                  onClick={() => setAdditionalStock(n => Math.min(9999, n + 1))}
                  className="h-full w-full text-base leading-none border-l hover:bg-gray-50"
                  aria-label="추가 재고 증가"
                >
                  +
                </button>
              </div>
          </div>
          <div>
            <label className="text-sm font-medium">판매일</label>
            <input
              name="sellDate" type="date"
              value={form.sellDate || ''}
              onChange={onChange}
              className="mt-1 w-full h-10 border rounded px-3"
            />
          </div>

          <div>
            <label className="text-sm font-medium">설명</label>
            <div className="mt-1 border rounded">
              {/* 텍스트 에디터 툴바 */}
              <div className="flex items-center gap-1 p-2 border-b bg-gray-50">
                <select
                  onChange={(e) => {
                    const editor = document.getElementById('description-editor');
                    if (editor && e.target.value) {
                      const selection = window.getSelection();
                      if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if (!range.collapsed) {
                          const span = document.createElement('span');
                          span.style.fontSize = e.target.value;
                          try {
                            range.surroundContents(span);
                          } catch (err) {
                            // 복잡한 선택 영역의 경우 내용을 추출해서 감싸기
                            const contents = range.extractContents();
                            span.appendChild(contents);
                            range.insertNode(span);
                          }
                          // HTML을 form에 저장
                          setForm({ ...form, description: editor.innerHTML });
                        }
                      }
                      editor.focus();
                    }
                    e.target.value = '';
                  }}
                  className="h-8 px-2 rounded text-sm bg-white border-0"
                  defaultValue=""
                >
                  <option value="" disabled>크기</option>
                  <option value="14px">보통</option>
                  <option value="24px">크게</option>
                  <option value="40px">매우 크게</option>
                </select>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const editor = document.getElementById('description-editor');
                    if (editor) {
                      document.execCommand('bold', false);
                      editor.focus();
                      // HTML을 form에 저장
                      setForm({ ...form, description: editor.innerHTML });
                    }
                  }}
                  className="h-8 px-2 rounded hover:bg-white text-sm font-bold"
                  title="굵게"
                >
                  굵게
                </button>
              </div>
              {/* 텍스트 에디터 입력 영역 */}
              <div className="relative">
                <div
                  id="description-editor"
                  contentEditable
                  dangerouslySetInnerHTML={{ __html: form.description || '' }}
                  onInput={(e) => {
                    const target = e.target as HTMLDivElement;
                    const textContent = target.innerText || target.textContent || '';
                    
                    // 글자 수 제한
                    if (textContent.length > DESCRIPTION_LIMIT) {
                      // 제한 글자까지만 자르기
                      const truncatedText = textContent.substring(0, DESCRIPTION_LIMIT);
                      target.innerText = truncatedText;
                      
                      // 커서를 끝으로 이동
                      const range = document.createRange();
                      const sel = window.getSelection();
                      range.selectNodeContents(target);
                      range.collapse(false);
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                    }
                    
                    setForm({ ...form, description: target.innerHTML });
                  }}
                  className="w-full min-h-[144px] border-0 rounded-none px-3 py-2 focus:outline-none focus:ring-0 leading-relaxed"
                  style={{ 
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                />
                {/* 글자 수 카운터 - 에디터 우측 하단 고정 */}
                <div className="pointer-events-none absolute bottom-1 right-2 text-[11px] text-gray-500 bg-white/80 px-1 rounded">
                  {(() => {
                    if (!form.description) return `0 / ${DESCRIPTION_LIMIT}자`;
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = form.description;
                    return `${tempDiv.innerText?.length || 0} / ${DESCRIPTION_LIMIT}자`;
                  })()}
                </div>
                {(!form.description || form.description === '') && (
                  <div 
                    className="absolute top-2 left-3 text-gray-400 pointer-events-none"
                    style={{ fontSize: '14px' }}
                  >
                    상품 소개를 작성하세요. 크기 변경, 굵게 기능을 사용할 수 있습니다.
                  </div>
                )}
              </div>
              {/* 글자 수 카운터 (에디터 내부 고정으로 대체) */}
            </div>
          </div>

          {/* 텍스트 스타일 기능은 요청에 따라 제거됨 */}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-end">
            <div>
              <label className="text-sm font-medium">이미지 <span className="text-red-500">*</span></label>
              <p className="text-xs text-gray-500 mt-1">상품 목록에 노출되는 이미지가 교체됩니다.</p>
              <div className="mt-2">
                <img
                  src={localPreviewUrlRef.current || form.imageUrl}
                  alt={form.name}
                  className="w-28 h-28 rounded object-cover border"
                />
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <input
                  id="main-image"
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    // 로컬 미리보기 생성
                    if (localPreviewUrlRef.current) {
                      URL.revokeObjectURL(localPreviewUrlRef.current);
                    }
                    localPreviewUrlRef.current = URL.createObjectURL(f);
                    setForm({ ...form });
                  }}
                />
                <label htmlFor="main-image" className="h-9 px-3 inline-flex items-center rounded border text-sm cursor-pointer hover:bg-gray-50">
                  파일 선택
                </label>
                {fileRef.current?.files?.[0] && (
                  <span className="text-sm text-gray-700 truncate max-w-full">
                    {fileRef.current.files[0].name}
                  </span>
                )}
              </div>
              {/* 추가 이미지 목록 (mock 전용) */}
              {USE_MOCKS && (
                <div className="mt-4">
                  <label className="text-sm font-medium">추가 이미지</label>
                  <div className="mt-2 flex gap-3 flex-wrap">
                    {(form.images || []).map((src, i) => (
                      <div key={src + i} className="relative w-28">
                        <img src={src} alt="thumb" className="w-28 h-28 rounded object-cover border" />
                       
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, images: (form.images || []).filter((_, idx) => idx !== i) })}
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white text-xs"
                          aria-label="추가 이미지 삭제"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <input
                      id="additional-files"
                      ref={additionalFileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const input = e.currentTarget as HTMLInputElement;
                        const files = input.files ? Array.from(input.files) : [];
                        if (!files.length) return;
                        setSelectedAdditionalNames(files.map(f => f.name));
                        try {
                          const uploadedUrls: string[] = [];
                          for (const file of files) {
                            const url = await mockUploadImage(file);
                            uploadedUrls.push(url);
                          }
                          setForm(prev => prev ? { ...prev, images: [...(prev.images || []), ...uploadedUrls] } : prev);
                        } finally {
                          input.value = '';
                        }
                      }}
                    />
                    <label htmlFor="additional-files" className="h-9 px-3 inline-flex items-center rounded border text-sm cursor-pointer hover:bg-gray-50">
                      파일 선택
                    </label>
                    {selectedAdditionalNames.length > 0 && (
                      <span className="text-sm text-gray-700 truncate max-w-full">
                        {selectedAdditionalNames.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!initialFormRef.current) return;
                  // 로컬 프리뷰 URL 정리
                  if (localPreviewUrlRef.current) {
                    URL.revokeObjectURL(localPreviewUrlRef.current);
                    localPreviewUrlRef.current = null;
                  }
                  setForm(JSON.parse(JSON.stringify(initialFormRef.current)));
                  setAdditionalStock(0);
                  setSelectedAdditionalNames([]);
                }}
                className="h-10 px-4 rounded border text-gray-700"
              >
                초기화
              </button>
              <button
                onClick={save}
                disabled={saving}
                className={`h-10 px-5 rounded text-white ${saving ? 'bg-gray-400' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}