// src/pages/admin/AdminEditProductPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import {
  getProductById as mockGetById,
  deleteProduct as mockDelete,
  updateProduct as mockUpdateProduct,
} from '../../mocks/products';
import {
  updateAdminProduct,
  getUploadUrl,
  deleteAdminProduct,
  getAdminProduct,
  getDetailPresignedUrlsBatch,
} from '../../utils/api';
import { compressImage } from '../../utils/image-compress';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';

// 글자수/가격 제한
const DESCRIPTION_LIMIT = 300;
const PRICE_MAX = 1_000_000;

// ✅ 업로드 동시성 상수화 (환경 맞춰 3~6 권장)
const UPLOAD_CONCURRENCY = 5;

type ProductEdit = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  sellDate?: string; // YYYY-MM-DD
  description?: string;
  images?: string[];
};

// 절대 URL prefix 부여
const addPrefix = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${process.env.REACT_APP_IMG_URL}/${url}`;
};

// 절대 URL → S3 key 로 환원
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

// 동시성 제한 유틸
async function withLimit<T>(limit: number, tasks: Array<() => Promise<T>>) {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const cur = idx++;
      try {
        const v = await tasks[cur]();
        results[cur] = { status: 'fulfilled', value: v } as PromiseFulfilledResult<T>;
      } catch (e) {
        results[cur] = { status: 'rejected', reason: e } as PromiseRejectedResult;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export default function AdminEditProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [form, setForm] = useState<ProductEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [descLength, setDescLength] = useState(0);

  // 파일/미리보기 refs
  const fileRef = useRef<HTMLInputElement>(null);
  const additionalFileRef = useRef<HTMLInputElement>(null);
  const localPreviewUrlRef = useRef<string | null>(null);

  // 상세 이미지 업로드 대기
  const [selectedAdditionalNames, setSelectedAdditionalNames] = useState<string[]>([]);
  const [pendingDetailFiles, setPendingDetailFiles] = useState<File[]>([]);
  const [pendingDetailPreviews, setPendingDetailPreviews] = useState<string[]>([]);

  // 재고 증감
  const [additionalStock, setAdditionalStock] = useState<number>(0);

  // 에디터 refs
  const editorRef = useRef<HTMLDivElement>(null);
  const editorHtmlRef = useRef<string>('');
  const shouldApplyEditorHtmlRef = useRef<boolean>(false);

  // 초기 상태 백업
  const initialFormRef = useRef<ProductEdit | null>(null);
  const initialStorageKey = useMemo(() => `adminEditInitial:${id ?? ''}`, [id]);

  // Undo/Redo
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isApplyingHistoryRef = useRef<boolean>(false);

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

  /** ===== Focus/Selection/Scroll 안전 래퍼 ===== */
  const withEditorFocus = (mutateDom: () => void) => {
    const editor = editorRef.current;
    if (!editor) return;

    const sel = window.getSelection();
    const hadSel = !!(sel && sel.rangeCount > 0);
    const savedRange = hadSel ? sel!.getRangeAt(0).cloneRange() : null;
    const savedScrollTop = editor.scrollTop;

    mutateDom();

    requestAnimationFrame(() => {
      editor.focus();
      const s = window.getSelection();
      if (s) {
        s.removeAllRanges();
        if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
          s.addRange(savedRange);
        } else {
          const end = document.createRange();
          end.selectNodeContents(editor);
          end.collapse(false);
          s.addRange(end);
        }
      }
      editor.scrollTop = savedScrollTop;
    });
  };

  /** ===== 히스토리 기록 ===== */
  const pushHistory = (html: string) => {
    if (isApplyingHistoryRef.current) return;
    const arr = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx < arr.length - 1) arr.splice(idx + 1);
    if (arr.length === 0 || arr[arr.length - 1] !== html) {
      arr.push(html);
      historyIndexRef.current = arr.length - 1;
    }
  };

  const applyHtmlFromHistory = (html: string) => {
    const el = editorRef.current;
    if (!el) return;
    isApplyingHistoryRef.current = true;
    withEditorFocus(() => {
      el.innerHTML = html;
      editorHtmlRef.current = html;
      const temp = document.createElement('div');
      temp.innerHTML = html;
      setDescLength(temp.innerText?.length || 0);
      setForm(prev => (prev ? { ...prev, description: html } : prev));
    });
    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);
  };

  const undo = () => {
    const idx = historyIndexRef.current;
    if (idx > 0) {
      historyIndexRef.current = idx - 1;
      applyHtmlFromHistory(historyRef.current[historyIndexRef.current]);
    }
  };

  const redo = () => {
    const arr = historyRef.current;
    const idx = historyIndexRef.current;
    if (idx < arr.length - 1) {
      historyIndexRef.current = idx + 1;
      applyHtmlFromHistory(historyRef.current[historyIndexRef.current]);
    }
  };

  /** ===== HTML/상태 동기화 공통 ===== */
  const normalizeAfterChange = (editor: HTMLElement) => {
    const html = editor.innerHTML;
    editorHtmlRef.current = html;
    const temp = document.createElement('div');
    temp.innerHTML = html;
    setDescLength(temp.innerText?.length || 0);
    setForm(prev => (prev ? { ...prev, description: html } : prev));
    pushHistory(html);
  };

  /** ===== 폰트 크기 적용 ===== */
  const applyFontSize = (size: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    withEditorFocus(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;

      const fragment = range.extractContents();

      const stripFontSize = (node: Node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.style && (el.style as any).fontSize) {
            el.style.fontSize = '';
            if ((el.getAttribute('style') || '').trim() === '') el.removeAttribute('style');
          }
          if (el.tagName.toLowerCase() === 'font' && el.hasAttribute('size')) {
            el.removeAttribute('size');
          }
        }
        node.childNodes.forEach(stripFontSize);
      };
      stripFontSize(fragment);

      const wrapper = document.createElement('span');
      wrapper.style.fontSize = size;
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);

      const newRange = document.createRange();
      newRange.setStartAfter(wrapper);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      normalizeAfterChange(editor);
    });
  };

  /** ===== 굵게 적용 ===== */
  const applyBold = () => {
    const editor = editorRef.current;
    if (!editor) return;
    withEditorFocus(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;

      const fragment = range.extractContents();

      const stripBold = (node: Node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tn = el.tagName.toLowerCase();
          if (tn === 'b' || tn === 'strong') {
            const parent = el.parentNode;
            if (parent) {
              while (el.firstChild) parent.insertBefore(el.firstChild, el);
              parent.removeChild(el);
            }
          } else {
            const fw = el.style?.fontWeight || '';
            if (fw) {
              el.style.fontWeight = '';
              if ((el.getAttribute('style') || '').trim() === '') el.removeAttribute('style');
            }
          }
        }
        node.childNodes.forEach(stripBold);
      };
      stripBold(fragment);

      const wrapper = document.createElement('span');
      wrapper.style.fontWeight = '700';
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);

      const newRange = document.createRange();
      newRange.setStartAfter(wrapper);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      normalizeAfterChange(editor);
    });
  };

  /** ===== 데이터 로드 ===== */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (USE_MOCKS) {
          const data = mockGetById(Number(id!));
          if (!data) throw new Error('상품 정보를 불러오지 못했습니다.');
          const cloned: ProductEdit = JSON.parse(JSON.stringify(data));
          if (!alive) return;
          initialFormRef.current = cloned;
          setForm(cloned);
          try {
            sessionStorage.setItem(initialStorageKey, JSON.stringify(cloned));
          } catch {}
          shouldApplyEditorHtmlRef.current = true;
          setDescLength((cloned.description || '').replace(/<[^>]+>/g, '').length);
        } else {
          const res = await getAdminProduct(Number(id));
          if (!res.ok) throw new Error('상품 정보를 불러오지 못했습니다.');
          const raw = await res.json();
          const detailList: string[] = Array.isArray(raw.detail_urls) ? raw.detail_urls : [];
          const data: ProductEdit = {
            id: raw.id,
            name: raw.name,
            price: Number(raw.price),
            stock: Number(raw.stock),
            imageUrl: addPrefix(raw.product_url),
            images: detailList.map((u: string) => addPrefix(u)),
            sellDate: raw.sell_date,
            description: raw.description || '',
          };
          if (!alive) return;
          initialFormRef.current = data;
          setForm(data);
          try {
            sessionStorage.setItem(initialStorageKey, JSON.stringify(data));
          } catch {}
          shouldApplyEditorHtmlRef.current = true;
          setDescLength((data.description || '').replace(/<[^>]+>/g, '').length);
        }
      } catch (e: any) {
        safeErrorLog(e, 'AdminEditProductPage - loadProduct');
        show(getSafeErrorMessage(e, '상품 정보를 불러오는 중 오류가 발생했습니다.'), {
          variant: 'error',
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, show, initialStorageKey]);

  /** 에디터 HTML 주입 (프로그램틱 변경시에만) */
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
      setDescLength(temp.innerText?.length || 0);
      shouldApplyEditorHtmlRef.current = false;
      // 히스토리 초기화
      historyRef.current = [];
      historyIndexRef.current = -1;
      if (html) {
        historyRef.current.push(html);
        historyIndexRef.current = 0;
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [form?.description]);

  /** 초기 렌더 타이밍 이슈 보강(비어 보이면 한 번 더 주입) */
  useEffect(() => {
    if (loading) return;
    const el = editorRef.current;
    if (!el) return;
    const html = form?.description || '';
    if (html && el.innerHTML.trim() === '') {
      el.innerHTML = html;
      editorHtmlRef.current = html;
      const temp = document.createElement('div');
      temp.innerHTML = html;
      setDescLength(temp.innerText?.length || 0);
      if (historyRef.current.length === 0) {
        historyRef.current.push(html);
        historyIndexRef.current = 0;
      }
    }
  }, [loading, form?.description]);

  /** 단축키(undo/redo) */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown as any);
    return () => window.removeEventListener('keydown', onKeyDown as any);
  }, []);

  /** 언마운트 정리 */
  useEffect(() => {
    return () => {
      try {
        sessionStorage.removeItem(initialStorageKey);
      } catch {}
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
      try {
        for (const u of pendingDetailPreviews) URL.revokeObjectURL(u);
      } catch {}
    };
  }, [initialStorageKey, pendingDetailPreviews]);

  /** 공통 onChange */
  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!form) return;
    const { name, value } = e.target as HTMLInputElement;
    if (name === 'price') {
      const raw = String(value ?? '');
      if (raw === '') return;
      // 1000단위 step 보조(원한다면 제거)
      let n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return;
      if (n > PRICE_MAX) n = PRICE_MAX;
      setForm({ ...form, price: n });
      return;
    }
    if (name === 'stock') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return;
      setForm({ ...form, stock: n });
      return;
    }
    setForm({ ...form, [name]: value });
  };

  /** 메인 이미지 업로드 */
  const uploadIfNeeded = async (): Promise<string | null> => {
    if (!fileRef.current?.files?.[0]) return null;
    const original = fileRef.current.files[0];
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 600));
      return URL.createObjectURL(original); // mock
    }
    try {
      const compressed = await compressImage(original);
      const presigned = await getUploadUrl(compressed.name, compressed.type);
      if (!presigned.ok) throw new Error('업로드 URL을 가져오지 못했습니다.');
      const data = await presigned.json();
      const url: string = data.url || data.uploadUrl;
      const key: string = data.key;
      const method: string = (data.method || 'PUT').toUpperCase();
      if (!url || !key) throw new Error('Presigned 응답에 url 또는 key가 없습니다.');

      const put = await fetch(url, {
        method,
        headers: { 'Content-Type': compressed.type },
        body: compressed,
        mode: 'cors',
      });
      if (!put.ok) throw new Error('파일 업로드에 실패했습니다.');
      return key; // 서버에는 key만 보냄
    } catch (e: any) {
      safeErrorLog(e, 'AdminEditProductPage - uploadIfNeeded');
      show(getSafeErrorMessage(e, '파일 업로드 중 오류가 발생했습니다.'), { variant: 'error' });
      return null;
    }
  };

  /** 유효성 검사 */
  const validateForm = () => {
    if (!form) return false;
    if (!form.name?.trim()) {
      show('상품명을 입력해주세요.', { variant: 'error' });
      return false;
    }
    if (form.price <= 0) {
      show('가격은 0보다 큰 값을 입력해주세요.', { variant: 'error' });
      return false;
    }
    if (form.stock < 0) {
      show('재고는 0 이상이어야 합니다.', { variant: 'error' });
      return false;
    }
    if (!form.imageUrl && !fileRef.current?.files?.[0]) {
      show('상품 이미지를 업로드해주세요.', { variant: 'error' });
      return false;
    }
    if (form.name.trim().length > 20) {
      show('상품명은 20자 이하로 입력해주세요.', { variant: 'error' });
      return false;
    }
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

  /** 저장 */
  const save = async () => {
    if (!form) return;
    if (!validateForm()) return;

    try {
      setSaving(true);
      // 메인 이미지
      const newMainKey = await uploadIfNeeded();

      // 상세 이미지 신규 업로드
      const uploadedDetailKeys: string[] = [];
      if (pendingDetailFiles.length > 0 && !USE_MOCKS) {
        // ✅ 1) 압축 병렬화
        const compressed: File[] = await Promise.all(
          pendingDetailFiles.map(async (f) => {
            try { return await compressImage(f); }
            catch { return f; }
          })
        );

        // 2) 타입별 그룹
        const groups = new Map<string, { names: string[]; files: File[] }>();
        for (const f of compressed) {
          const t = f.type || 'image/jpeg';
          if (!groups.has(t)) groups.set(t, { names: [], files: [] });
          groups.get(t)!.names.push(f.name);
          groups.get(t)!.files.push(f);
        }

        // 3) presigned → 업로드 (task로 쌓고 withLimit로 병렬 실행)
        const uploadTasks: Array<() => Promise<string>> = [];
        for (const [contentType, pack] of groups.entries()) {
          const presignedList = await getDetailPresignedUrlsBatch(Number(id), pack.names, contentType);
          if (!presignedList || presignedList.length !== pack.files.length) {
            throw new Error('상세 이미지 URL 발급 수 불일치');
          }

          presignedList.forEach((item: { url: string; key?: string; method?: string }, i: number) => {
            const method = (item.method || 'PUT').toUpperCase();
            uploadTasks.push(async () => {
              const res = await fetch(item.url, {
                method,
                headers: { 'Content-Type': contentType },
                body: pack.files[i],
                mode: 'cors',
              });
              if (!res.ok) throw new Error('상세 이미지 업로드 실패');
              return item.key || new URL(item.url).pathname.replace(/^\//, '');
            });
          });
        }

        // ✅ 3) 동시성 상수 적용
        const settled = await withLimit(UPLOAD_CONCURRENCY, uploadTasks);
        const okKeys = settled
          .filter((s): s is PromiseFulfilledResult<string> => s.status === 'fulfilled')
          .map(s => s.value);
        const failed = settled.filter(s => s.status === 'rejected').length;

        uploadedDetailKeys.push(...okKeys);

        if (failed > 0) {
          throw new Error(`${failed}개 이미지 업로드 실패`);
        }

        // 화면 미리보기 갱신
        if (uploadedDetailKeys.length) {
          setForm(prev =>
            prev ? { ...prev, images: [...(prev.images || []), ...uploadedDetailKeys.map(addPrefix)] } : prev,
          );
        }
      }

      // 변경점 비교
      const initialRaw = sessionStorage.getItem(initialStorageKey);
      const initial: ProductEdit | null = initialRaw
        ? JSON.parse(initialRaw)
        : initialFormRef.current
          ? JSON.parse(JSON.stringify(initialFormRef.current))
          : null;

      const nameChanged = (form.name || '').trim() !== (initial?.name || '').trim();
      const priceChanged = form.price !== (initial?.price ?? 0);
      const stockChanged = additionalStock !== 0;
      const productUrlChanged = toS3Key(newMainKey ?? form.imageUrl) !== toS3Key(initial?.imageUrl || '');
      const sellDateChanged = (form.sellDate || '').trim() !== (initial?.sellDate || '').trim();

      const normalizeHtml = (s: string) => s.replace(/\s+/g, ' ').trim();
      const descriptionChanged = normalizeHtml(form.description || '') !== normalizeHtml(initial?.description || '');

      const arraysEqual = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
      const initialDetailKeys = (initial?.images || []).map(u => toS3Key(u));
      let currentDetailKeys = (form.images || []).map(u => toS3Key(u));
      if (uploadedDetailKeys.length) currentDetailKeys = [...currentDetailKeys, ...uploadedDetailKeys];
      const detailChanged = !arraysEqual(currentDetailKeys, initialDetailKeys);

      const hasAnyChange =
        nameChanged || priceChanged || stockChanged || productUrlChanged || sellDateChanged || descriptionChanged || detailChanged;

      if (!hasAnyChange) {
        show('변경 사항이 없습니다.', { variant: 'info' });
        setSaving(false);
        try { sessionStorage.removeItem(initialStorageKey); } catch {}
        nav('/admin/products', { replace: true, state: { bustTs: Date.now(), bustProductId: form.id } });
        return;
      }

      const payload: any = {
        name: nameChanged ? (form.name || '').trim() : null,
        price: priceChanged ? form.price : null,
        stock_change: stockChanged ? additionalStock : null,
        product_url: productUrlChanged ? toS3Key(newMainKey ?? form.imageUrl) : null, // key만
        sell_date: sellDateChanged ? (form.sellDate || '').trim() : null,
        description: descriptionChanged ? (form.description || '') : null,
        detail_urls: detailChanged ? currentDetailKeys : null,
      };

      if (USE_MOCKS) {
        mockUpdateProduct({ id: form.id, ...payload });
      } else {
        const res = await updateAdminProduct(Number(id), payload);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return; // adminFetch 내부 처리
          throw new Error('저장에 실패했습니다.');
        }
      }

      show('저장되었습니다.');
      try { sessionStorage.removeItem(initialStorageKey); } catch {}
      setPendingDetailFiles([]);
      setPendingDetailPreviews([]);
      setSelectedAdditionalNames([]);
      nav('/admin/products', { replace: true, state: { bustTs: Date.now(), bustProductId: form.id } });
    } catch (e: any) {
      safeErrorLog(e, 'AdminEditProductPage - save');
      show(getSafeErrorMessage(e, e?.message || '저장 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /** 삭제 */
  const del = async () => {
    if (!form) return;
    if (!window.confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    try {
      if (USE_MOCKS) {
        mockDelete(form.id);
      } else {
        const res = await deleteAdminProduct(form.id);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return;
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

  /** ===== 렌더 ===== */
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
          {/* 이름/가격/재고 */}
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
                  name="price"
                  type="number"
                  min={0}
                  step={100}
                  max={PRICE_MAX}
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
                  name="stock"
                  type="number"
                  min={0}
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

          <div>
            <span className="text-sm font-medium text-gray-800">재고 변경</span>
            <div className="mt-1 h-10 grid grid-cols-[1fr_4fr_1fr] items-center border rounded overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setAdditionalStock(n => (form.stock + n - 10 >= 0 ? n - 10 : n))
                }
                disabled={form.stock + additionalStock < 10}
                className={`h-full w-full text-base leading-none border-r ${
                  form.stock + additionalStock < 10 ? 'text-gray-300 bg-gray-50' : 'hover:bg-gray-50'
                }`}
                aria-label="추가 재고 감소"
              >
                −
              </button>
              <div className="h-full w-full flex items-center justify-center text-base">
                <input
                  type="number"
                  min={-form.stock}
                  max={9999}
                  step={1}
                  value={additionalStock}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    const clamped = Math.max(-form.stock, Math.min(9999, Math.trunc(v)));
                    setAdditionalStock(clamped);
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') setAdditionalStock(0);
                  }}
                  className="w-full h-full border-0 text-center focus:ring-0 outline-none no-spinner"
                  aria-label="재고 변경 수량 직접 입력"
                />
              </div>
              <button
                type="button"
                onClick={() => setAdditionalStock(n => Math.min(9999, n + 10))}
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
              name="sellDate"
              type="date"
              value={form.sellDate || ''}
              onChange={onChange}
              className="mt-1 w-full h-10 border rounded px-3"
            />
          </div>

          {/* 설명 에디터 */}
          <div>
            <label className="text-sm font-medium">설명</label>
            <div className="mt-1 border rounded">
              {/* 툴바 */}
              <div className="flex items-center gap-1 p-2 border-b bg-gray-50">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFontSize('14px')}
                    className="h-8 px-2 rounded text-sm border bg-white hover:bg-gray-100 active:scale-[0.98]"
                    title="글자 크기: 보통"
                  >
                    보통
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFontSize('24px')}
                    className="h-8 px-2 rounded text-sm border bg-white hover:bg-gray-100 active:scale-[0.98]"
                    title="글자 크기: 크게"
                  >
                    크게
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFontSize('40px')}
                    className="h-8 px-2 rounded text-sm border bg-white hover:bg-gray-100 active:scale-[0.98]"
                    title="글자 크기: 매우 크게"
                  >
                    매우 크게
                  </button>
                </div>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={applyBold}
                  className="h-8 px-2 rounded hover:bg-white text-sm font-bold"
                  title="굵게"
                >
                  굵게
                </button>
                <span className="ml-auto text-xs text-gray-500">{`${descLength} / ${DESCRIPTION_LIMIT}자`}</span>
              </div>

              {/* 편집 영역 */}
              <div className="relative">
                <div
                  id="description-editor"
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => {
                    const editor = e.currentTarget as HTMLDivElement;
                    withEditorFocus(() => {
                      const text = editor.innerText || editor.textContent || '';
                      if (text.length > DESCRIPTION_LIMIT) {
                        const truncated = text.substring(0, DESCRIPTION_LIMIT);
                        editor.innerText = truncated;
                        const r = document.createRange();
                        r.selectNodeContents(editor);
                        r.collapse(false);
                        const s = window.getSelection();
                        s?.removeAllRanges();
                        s?.addRange(r);
                      }
                      normalizeAfterChange(editor);
                    });
                  }}
                  className="w-full min-h-[144px] border-0 rounded-none px-3 py-2 focus:outline-none focus:ring-0 leading-relaxed"
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                />
                {!(form.description && form.description.replace(/(?:<br\s*\/?>(?:\s|&nbsp;)*|\s|&nbsp;)+/gi, '').length) && (
                  <div className="absolute top-2 left-3 text-gray-400 pointer-events-none" style={{ fontSize: '14px' }}>
                    상품 소개를 작성하세요. 크기 변경, 굵게 기능을 사용할 수 있습니다.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 이미지들 */}
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
                    onChange={(e) => {
                      const input = e.currentTarget as HTMLInputElement;
                      const files = input.files ? Array.from(input.files) : [];
                      if (!files.length) return;
                      const names = files.map(f => f.name);
                      const urls = files.map(f => URL.createObjectURL(f));
                      setSelectedAdditionalNames(prev => [...prev, ...names]);
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
            </div>

            {/* 우측 버튼 */}
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
                    try {
                      for (const u of pendingDetailPreviews) URL.revokeObjectURL(u);
                    } catch {}
                    const cloned: ProductEdit = JSON.parse(JSON.stringify(initial));
                    initialFormRef.current = cloned;
                    shouldApplyEditorHtmlRef.current = true;
                    setForm(cloned);
                    setAdditionalStock(0);
                    setSelectedAdditionalNames([]);
                    setPendingDetailFiles([]);
                    setPendingDetailPreviews([]);
                  } catch {
                    if (initialFormRef.current) {
                      const cloned: ProductEdit = JSON.parse(JSON.stringify(initialFormRef.current));
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
              <button
                onClick={del}
                className="h-10 px-4 rounded border text-red-600 hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}