import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { getProductById, deleteProduct as mockDelete, updateProduct as mockUpdateProduct, mockUploadImage } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { updateAdminProduct, getUpdateUrl, deleteAdminProduct, getAdminProduct, getDetailPresignedUrlsBatch } from '../../utils/api';

// 상품 설명 글자 수 제한
const DESCRIPTION_LIMIT = 300;
// 가격 상한
const PRICE_MAX = 1000000;

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

const addPrefix = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.REACT_APP_IMG_URL}/${url}`;
};

// 서버에는 S3 key만 전송해야 하므로, 절대 URL을 key로 변환
const toS3Key = (url: string) => {
  if (!url) return '';
  try {
    const base = process.env.REACT_APP_IMG_URL || '';
    if (base && url.startsWith(base)) {
      const rest = url.slice(base.length);
      return rest.replace(/^\//, '');
    }
    if (!url.startsWith('http')) return url.replace(/^\//, '');
    const u = new URL(url);
    return u.pathname.replace(/^\//, '');
  } catch {
    return url.replace(/^\//, '');
  }
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
  const editorRef = useRef<HTMLDivElement>(null);
  const editorHtmlRef = useRef<string>('');
  const shouldApplyEditorHtmlRef = useRef<boolean>(false);
  const [descLength, setDescLength] = useState<number>(0);
  const [selectedAdditionalNames, setSelectedAdditionalNames] = useState<string[]>([]);
  const [pendingDetailFiles, setPendingDetailFiles] = useState<File[]>([]);
  const [pendingDetailPreviews, setPendingDetailPreviews] = useState<string[]>([]);
  const [additionalStock, setAdditionalStock] = useState<number>(0);

  const initialStorageKey = useMemo(() => `adminEditInitial:${id ?? ''}`,[id]);

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
            try { sessionStorage.setItem(initialStorageKey, JSON.stringify(cloned)); } catch {}
            setAdditionalStock(0);
            shouldApplyEditorHtmlRef.current = true;
          }
        } else {
          const res = await getAdminProduct(Number(id));
          if (!res.ok) throw new Error('상품 정보를 불러오지 못했습니다.');
          const rawData = await res.json();

          // detail 이미지는 detail_urls만 사용
          const detailList: string[] = Array.isArray(rawData.detail_urls) ? rawData.detail_urls : [];

          // API 응답에서 image_url을 imageUrl로 매핑하고 절대 경로로 변환
          const data: ProductEdit = {
            id: rawData.id,
            name: rawData.name,
            price: Number(rawData.price),
            stock: Number(rawData.stock),
            imageUrl: addPrefix(rawData.product_url),
            images: detailList.map((u: string) => addPrefix(u)),
            sellDate: rawData.sell_date,
            description: rawData.description || ''
          };
          
          if (alive) {
            initialFormRef.current = data;
            setForm(data);
            try { sessionStorage.setItem(initialStorageKey, JSON.stringify(data)); } catch {}
            // editor HTML은 프로그램적으로 주입하도록 플래그 설정
            shouldApplyEditorHtmlRef.current = true;
          }
        }
      } catch (e: any) {
        safeErrorLog(e, 'AdminEditProductPage - loadProduct');
        show(getSafeErrorMessage(e, '상품 정보를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, show, initialStorageKey]);

  // 에디터 HTML 주입(프로그램적 변경시에만): 포커스 점프 방지
  useEffect(() => {
    if (!editorRef.current) return;
    if (!shouldApplyEditorHtmlRef.current) return;
    const html = form?.description || '';
    const el = editorRef.current;
    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      el.innerHTML = html;
      editorHtmlRef.current = html;
      const temp = document.createElement('div');
      temp.innerHTML = html;
      setDescLength((temp.innerText?.length || 0));
      shouldApplyEditorHtmlRef.current = false;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [form?.description]);

  // 페이지 이탈 시 초기값 저장본 제거 및 로컬 미리보기 URL 정리
  useEffect(() => {
    return () => {
      try { sessionStorage.removeItem(initialStorageKey); } catch {}
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      // 상세 이미지 미리보기 URL 정리
      try {
        for (const u of pendingDetailPreviews) {
          URL.revokeObjectURL(u);
        }
      } catch {}
    };
  }, [initialStorageKey]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!form) return;
    const { name, value } = e.target as HTMLInputElement;
    if (name === 'price' || name === 'stock') {
      if (name === 'price') {
        const raw = String(value ?? '');
        if (raw === '') return;
        const withHundreds = raw.endsWith('00') ? raw : raw + '00';
        let n = Number(withHundreds);
        if (!Number.isFinite(n) || n < 0) return;
        if (n > PRICE_MAX) n = PRICE_MAX;
        setForm({ ...form, price: n });
        return;
      }
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

      // 상세 이미지 신규 파일 업로드(저장 직전에 일괄 수행)
      if (pendingDetailFiles.length > 0) {
        const byType = new Map<string, { names: string[]; files: File[] }>();
        for (const f of pendingDetailFiles) {
          const key = f.type || 'image/jpeg';
          if (!byType.has(key)) byType.set(key, { names: [], files: [] });
          byType.get(key)!.names.push(f.name);
          byType.get(key)!.files.push(f);
        }
        const uploadedUrls: string[] = [];
        for (const [contentType, pack] of byType.entries()) {
          const presigned = await getDetailPresignedUrlsBatch(Number(id), pack.names, contentType);
          if (!presigned || presigned.length !== pack.files.length) throw new Error('상세 이미지 URL 발급 수 불일치');
          for (let i = 0; i < pack.files.length; i++) {
            const putUrl = presigned[i];
            const file = pack.files[i];
            const putRes = await fetch(putUrl, { method: 'PUT', body: file, mode: 'cors' });
            if (!putRes.ok) throw new Error('상세 이미지 업로드 실패');
            uploadedUrls.push(putUrl.split('?')[0]);
          }
        }
        if (uploadedUrls.length) {
          setForm(prev => prev ? { ...prev, images: [...(prev.images || []), ...uploadedUrls] } : prev);
        }
      }

      // 초기 스냅샷 불러오기 (세션 우선)
      const initialRaw = sessionStorage.getItem(initialStorageKey);
      const initial: ProductEdit | null = initialRaw
        ? JSON.parse(initialRaw)
        : (initialFormRef.current ? JSON.parse(JSON.stringify(initialFormRef.current)) : null);

      const currentName = (form.name || '').trim();
      const initialName = (initial?.name || '').trim();
      const nameChanged = currentName !== initialName;

      const currentPrice = form.price;
      const initialPrice = initial?.price ?? 0;
      const priceChanged = currentPrice !== initialPrice;

      // 재고는 합산값이 아니라 변경값(∆)만 전송. 음수 가능
      const stockChanged = additionalStock !== 0;

      const currentMainUrl = (newImageUrl ?? form.imageUrl) || '';
      const initialMainUrl = initial?.imageUrl || '';
      const currentMainKey = toS3Key(currentMainUrl);
      const initialMainKey = toS3Key(initialMainUrl);
      const productUrlChanged = currentMainKey !== initialMainKey;

      const currentSellDate = (form.sellDate || '').trim();
      const initialSellDate = (initial?.sellDate || '').trim();
      const sellDateChanged = currentSellDate !== initialSellDate;

      const normalizeHtml = (s: string) => s.replace(/\s+/g, ' ').trim();
      const currentDesc = normalizeHtml(form.description || '');
      const initialDesc = normalizeHtml(initial?.description || '');
      const descriptionChanged = currentDesc !== initialDesc;

      const arraysEqual = (a?: string[], b?: string[]) => {
        const aa = a || [];
        const bb = b || [];
        if (aa.length !== bb.length) return false;
        for (let i = 0; i < aa.length; i++) {
          if (aa[i] !== bb[i]) return false;
        }
        return true;
      };
      const currentDetail = form.images || [];
      const initialDetail = initial?.images || [];
      const currentDetailKeys = currentDetail.map(u => toS3Key(u));
      const initialDetailKeys = initialDetail.map(u => toS3Key(u));
      const detailChanged = !arraysEqual(currentDetailKeys, initialDetailKeys);

      const hasAnyChange = nameChanged || priceChanged || stockChanged || productUrlChanged || sellDateChanged || descriptionChanged || detailChanged;
      if (!hasAnyChange) {
        show('변경 사항이 없습니다.', { variant: 'info' });
        setSaving(false);
        try { sessionStorage.removeItem(initialStorageKey); } catch {}
        nav('/admin/products', { replace: true, state: { bustTs: Date.now(), bustProductId: form.id } });
        return;
      }

      // 변경 사항만 값, 미변경은 null. (sellDate를 비우고자 할 때는 빈 문자열로 전송해 구분)
      const payload: any = {
        name: nameChanged ? currentName : null,
        price: priceChanged ? currentPrice : null,
        stock_change: stockChanged ? additionalStock : null,
        product_url: productUrlChanged ? currentMainKey : null,
        sell_date: sellDateChanged ? currentSellDate : null, // ''은 값 초기화를 의미
        description: descriptionChanged ? (form.description || '') : null,
        detail_urls: detailChanged ? currentDetailKeys : null,
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
      try { sessionStorage.removeItem(initialStorageKey); } catch {}
      setPendingDetailFiles([]);
      nav('/admin/products', { replace: true, state: { bustTs: Date.now(), bustProductId: form.id } });
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
                    const editor = editorRef.current;
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
                    const editor = editorRef.current;
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
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  // 초기 내용은 마운트 후 주입해 포커스 점프 방지
                  dangerouslySetInnerHTML={undefined}
                  onInput={(e) => {
                    const target = e.target as HTMLDivElement;
                    const textContent = target.innerText || target.textContent || '';
                    // 글자 수 제한
                    if (textContent.length > DESCRIPTION_LIMIT) {
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
                    // 사용자가 입력할 때만 상태 갱신 (프로그램적 주입은 useEffect에서 처리)
                    editorHtmlRef.current = target.innerHTML;
                    setDescLength(textContent.length);
                    setForm(prev => prev ? { ...prev, description: target.innerHTML } : prev);
                  }}
                  className="w-full min-h-[144px] border-0 rounded-none px-3 py-2 focus:outline-none focus:ring-0 leading-relaxed"
                  style={{ 
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                />
                {/* 글자 수 카운터 - 에디터 우측 하단 고정 */}
                <div className="pointer-events-none absolute bottom-1 right-2 text-[11px] text-gray-500 bg-white/80 px-1 rounded">
                  {`${descLength} / ${DESCRIPTION_LIMIT}자`}
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
              {(
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
                        const names = files.map(f => f.name);
                        const urls = files.map(f => URL.createObjectURL(f));
                        setSelectedAdditionalNames(prev => [...prev, ...names]);
                        // 업로드는 저장 직전에 한 번에 수행 → 여기서는 파일과 미리보기만 보관
                        setPendingDetailFiles(prev => [...prev, ...files]);
                        setPendingDetailPreviews(prev => [...prev, ...urls]);
                        input.value = '';
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
                  {/* 추가 예정 이미지 미리보기 */}
                  {pendingDetailPreviews.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-gray-500 mb-2">추가 예정</div>
                      <div className="flex gap-3 flex-wrap">
                        {pendingDetailPreviews.map((src, i) => (
                          <div key={src + i} className="relative w-28">
                            <img src={src} alt="pending-thumb" className="w-28 h-28 rounded object-cover border" />
                            <button
                              type="button"
                              onClick={() => {
                                // 미리보기 URL 정리 후 목록에서 제거
                                try { URL.revokeObjectURL(pendingDetailPreviews[i]); } catch {}
                                setPendingDetailPreviews(prev => prev.filter((_, idx) => idx !== i));
                                setPendingDetailFiles(prev => prev.filter((_, idx) => idx !== i));
                                setSelectedAdditionalNames(prev => prev.filter((_, idx) => idx !== i));
                              }}
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white text-xs"
                              aria-label="추가 예정 이미지 제거"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  try {
                    const raw = sessionStorage.getItem(initialStorageKey);
                    const initial = raw ? (JSON.parse(raw) as ProductEdit) : initialFormRef.current;
                    if (!initial) return;
                    if (localPreviewUrlRef.current) {
                      URL.revokeObjectURL(localPreviewUrlRef.current);
                      localPreviewUrlRef.current = null;
                    }
                    // 추가 예정 미리보기 정리
                    try {
                      for (const u of pendingDetailPreviews) URL.revokeObjectURL(u);
                    } catch {}
                    // deep clone 후 복원
                    const cloned: ProductEdit = JSON.parse(JSON.stringify(initial));
                    initialFormRef.current = cloned;
                    // 에디터에 프로그램적 주입을 트리거
                    shouldApplyEditorHtmlRef.current = true;
                    setForm(cloned);
                    setAdditionalStock(0);
                    setSelectedAdditionalNames([]);
                    setPendingDetailFiles([]);
                    setPendingDetailPreviews([]);
                  } catch {
                    if (initialFormRef.current) {
                      const cloned: ProductEdit = JSON.parse(JSON.stringify(initialFormRef.current));
                      // 에디터에 프로그램적 주입을 트리거ㅋ
                      shouldApplyEditorHtmlRef.current = true;
                      setForm(cloned);
                      setAdditionalStock(0);
                      setSelectedAdditionalNames([]);
                      setPendingDetailFiles([]);
                      setPendingDetailPreviews([]);
                    }
                  }
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