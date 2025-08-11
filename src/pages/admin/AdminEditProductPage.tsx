import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { deleteProduct as mockDelete, getProductById, mockUploadImage, updateProduct } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';

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
  const API_BASE = process.env.REACT_APP_API_BASE || '';

  const [form, setForm] = useState<ProductEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (USE_MOCKS) {
          const data = getProductById(Number(id!));
          if (!data) throw new Error('상품 정보를 불러오지 못했습니다.');
          if (alive) setForm(data as ProductEdit);
        } else {
          const res = await fetch(`${API_BASE}/api/admin/products/${id}`, { credentials: 'include' });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            await res.text();
            throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
          }
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
  }, [id, show, API_BASE]);

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
      return await mockUploadImage(file);
    }
    // 1) presigned url 발급 요청
    const pres = await fetch(`${API_BASE}/api/admin/presigned-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fileName: file.name }),
    });
    const presType = pres.headers.get('content-type') || '';
    if (!presType.includes('application/json')) {
      await pres.text();
      throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
    }
    if (!pres.ok) throw new Error('이미지 업로드 URL 발급 실패');
    const { url, imageUrl } = await pres.json();

    // 2) S3 업로드
    const put = await fetch(url, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    if (!put.ok) throw new Error('이미지 업로드 실패');

    // 3) 업로드된 최종 경로 반환
    return imageUrl as string;
  };

  const save = async () => {
    if (!form) return;
    try {
      setSaving(true);
      const newImageUrl = await uploadIfNeeded();

      const payload = {
        name: form.name?.trim(),
        price: form.price,
        stock: form.stock,
        imageUrl: newImageUrl ?? form.imageUrl,
        sellDate: form.sellDate?.trim() || null,
        description: form.description?.trim() || '',
        images: form.images && form.images.length ? form.images : undefined,
      };

      if (USE_MOCKS) {
        updateProduct({ id: form.id, ...payload });
      } else {
        const res = await fetch(`${API_BASE}/api/admin/products/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const resType = res.headers.get('content-type') || '';
        if (!resType.includes('application/json')) {
          await res.text();
          throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
        }
        if (!res.ok) throw new Error('저장에 실패했습니다.');
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
        const res = await fetch(`${API_BASE}/api/admin/products/${form.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        const resType = res.headers.get('content-type') || '';
        if (!resType.includes('application/json')) {
          await res.text();
          throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
        }
        if (!res.ok) throw new Error('삭제에 실패했습니다.');
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
            <label className="text-sm font-medium">상품명</label>
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
              <label className="text-sm font-medium">가격</label>
              <input
                name="price" type="number" min={0}
                value={form.price}
                onChange={onChange}
                className="mt-1 w-full h-10 border rounded px-3"
              />
            </div>
            <div>
              <label className="text-sm font-medium">재고</label>
              <input
                name="stock" type="number" min={0}
                value={form.stock}
                onChange={onChange}
                className="mt-1 w-full h-10 border rounded px-3"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">판매일 (선택)</label>
            <input
              name="sellDate" type="date"
              value={form.sellDate || ''}
              onChange={onChange}
              className="mt-1 w-full h-10 border rounded px-3"
            />
          </div>

          <div>
            <label className="text-sm font-medium">설명 (선택)</label>
            <textarea
              name="description"
              value={form.description || ''}
              onChange={onChange}
              rows={4}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="상품 소개를 작성하세요."
            />
          </div>

          {/* 텍스트 스타일 기능은 요청에 따라 제거됨 */}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-end">
            <div>
              <label className="text-sm font-medium">이미지</label>
              <div className="mt-1 flex items-center gap-3">
                <img
                  src={form.imageUrl}
                  alt={form.name}
                  className="w-24 h-24 rounded object-cover border"
                />
                <input ref={fileRef} type="file" accept="image/*" className="text-sm" />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                상품 목록에 노출되는 이미지가 교체됩니다.
              </p>
              {/* 추가 이미지 목록 (mock 전용) */}
              {USE_MOCKS && (
                <div className="mt-4">
                  <label className="text-sm font-medium">추가 이미지 (선택)</label>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {(form.images || []).map((src, i) => (
                      <div key={src + i} className="relative">
                        <img src={src} alt="thumb" className="w-16 h-16 rounded object-cover border" />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, images: (form.images || []).filter((_, idx) => idx !== i) })}
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = await mockUploadImage(f);
                        setForm({ ...form, images: [...(form.images || []), url] });
                        e.currentTarget.value = '';
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={del} className="h-10 px-4 rounded bg-red-500 text-white hover:bg-red-600">
                삭제
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