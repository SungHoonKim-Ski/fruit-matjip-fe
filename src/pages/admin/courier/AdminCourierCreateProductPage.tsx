import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  createAdminCourierProduct,
  getAdminCourierProductPresignedUrl,
  getCourierCategories,
} from '../../../utils/api';
import { compressImage } from '../../../utils/image-compress';

type ProductForm = {
  name: string;
  price: number;
  stock: number;
  weight: string;
  description: string;
  orderIndex: number;
  visible: boolean;
};

type CategoryItem = {
  id: number;
  name: string;
};

const PRICE_MAX = 1_000_000;

export default function AdminCourierCreateProductPage() {
  const { show } = useSnackbar();
  const nav = useNavigate();

  const [form, setForm] = useState<ProductForm>({
    name: '',
    price: 0,
    stock: 0,
    weight: '',
    description: '',
    orderIndex: 0,
    visible: true,
  });
  const [uploading, setUploading] = useState(false);

  // Main image
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [mainPreview, setMainPreview] = useState<string | null>(null);

  // Detail images
  const [detailFiles, setDetailFiles] = useState<File[]>([]);
  const [detailPreviews, setDetailPreviews] = useState<string[]>([]);

  // Categories
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);

  const DETAIL_IMAGES_MAX = 10;

  // Cleanup preview URLs (unmount only)
  useEffect(() => {
    return () => {
      if (mainPreview) URL.revokeObjectURL(mainPreview);
      detailPreviews.forEach(u => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load categories
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getCourierCategories();
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data?.response) ? data.response : (Array.isArray(data) ? data : []);
        if (alive) {
          setCategories(list.map((c: any) => ({
            id: Number(c.id),
            name: String(c.name ?? ''),
          })));
        }
      } catch (err) {
        safeErrorLog(err, 'AdminCourierCreateProductPage - loadCategories');
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleNumberInput = (e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const value = input.value;
    if (value.length > 1 && value.startsWith('0')) {
      input.value = value.slice(1);
    }
  };

  const handleMainImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
      show('.PNG/.JPG 파일만 업로드할 수 있습니다.', { variant: 'error' });
      e.target.value = '';
      return;
    }
    try {
      const compressed = await compressImage(file);
      setMainFile(compressed);
      if (mainPreview) URL.revokeObjectURL(mainPreview);
      setMainPreview(URL.createObjectURL(compressed));
    } catch (err) {
      safeErrorLog(err, 'AdminCourierCreateProductPage - compressMainImage');
      show(getSafeErrorMessage(err, '이미지 처리 중 오류가 발생했습니다.'), { variant: 'error' });
    }
    e.target.value = '';
  };

  const handleDetailImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    const available = DETAIL_IMAGES_MAX - detailFiles.length;
    if (available <= 0) {
      show(`상세 이미지는 최대 ${DETAIL_IMAGES_MAX}장까지 등록할 수 있습니다.`, { variant: 'info' });
      e.target.value = '';
      return;
    }
    const allowed = files.slice(0, available);
    if (allowed.length < files.length) {
      show(`최대 ${DETAIL_IMAGES_MAX}장까지만 추가할 수 있습니다.`, { variant: 'info' });
    }
    const compressed = await Promise.all(
      allowed.map(async f => {
        try { return await compressImage(f); }
        catch { return f; }
      })
    );
    const previews = compressed.map(f => URL.createObjectURL(f));
    setDetailFiles(prev => [...prev, ...compressed]);
    setDetailPreviews(prev => [...prev, ...previews]);
    e.target.value = '';
  };

  const removeDetailImage = (index: number) => {
    URL.revokeObjectURL(detailPreviews[index]);
    setDetailFiles(prev => prev.filter((_, i) => i !== index));
    setDetailPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFileWithPresignedUrl = async (file: File): Promise<string> => {
    const presignedRes = await getAdminCourierProductPresignedUrl(file.name, file.type);
    if (!presignedRes.ok) {
      throw new Error(`이미지 업로드 URL 발급 실패: ${presignedRes.status}`);
    }
    const presigned = await presignedRes.json();
    const { url, key, method } = presigned;
    if (!url || !key) throw new Error('Presigned 응답에 url 또는 key가 없습니다.');

    const uploadRes = await fetch(url, {
      method: (method || 'PUT').toUpperCase(),
      body: file,
      mode: 'cors',
    });
    if (!uploadRes.ok) {
      throw new Error(`S3 업로드 실패: ${uploadRes.status}`);
    }
    return key;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      show('상품명을 입력해주세요.', { variant: 'error' });
      return;
    }
    if (form.price <= 0) {
      show('가격을 입력해주세요.', { variant: 'error' });
      return;
    }
    if (form.stock <= 0) {
      show('재고를 입력해주세요.', { variant: 'error' });
      return;
    }
    if (!mainFile) {
      show('대표 이미지를 업로드해주세요.', { variant: 'error' });
      return;
    }

    try {
      setUploading(true);

      // 1) Upload main image
      const mainKey = await uploadFileWithPresignedUrl(mainFile);

      // 2) Upload detail images
      const detailKeys: string[] = [];
      for (const file of detailFiles) {
        const key = await uploadFileWithPresignedUrl(file);
        detailKeys.push(key);
      }

      // 3) Create product
      const payload: any = {
        name: form.name.trim(),
        price: form.price,
        stock: form.stock,
        image_url: mainKey,
        visible: form.visible,
        order_index: form.orderIndex,
      };
      if (form.weight.trim()) payload.weight = form.weight.trim();
      if (form.description.trim()) payload.description = form.description.trim();
      if (detailKeys.length > 0) payload.detail_urls = detailKeys;
      if (selectedCategoryIds.length > 0) payload.category_ids = selectedCategoryIds;

      const res = await createAdminCourierProduct(payload);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return;
        throw new Error(`상품 등록 실패: ${res.status}`);
      }

      show('상품이 등록되었습니다!', { variant: 'success' });
      nav('/shop/admin/products', { replace: true });
    } catch (err: any) {
      safeErrorLog(err, 'AdminCourierCreateProductPage - handleSubmit');
      show(getSafeErrorMessage(err, '상품 등록 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <section className="max-w-md mx-auto p-6 bg-white rounded shadow space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">택배 상품 등록</h1>
          <button
            type="button"
            onClick={() => nav('/shop/admin/products')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            목록으로
          </button>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">상품명 <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full border px-3 py-2 rounded"
            placeholder="상품명을 입력하세요 (최대 30자)"
            maxLength={30}
          />
        </div>

        {/* Price + Stock */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">가격 <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={form.price}
              onChange={e => {
                const num = Number(e.target.value);
                if (!Number.isFinite(num) || num < 0) return;
                setForm(prev => ({ ...prev, price: Math.min(num, PRICE_MAX) }));
              }}
              onInput={handleNumberInput}
              className="w-full border px-3 py-2 rounded"
              step={100}
              max={PRICE_MAX}
              min={0}
            />
            <p className="text-xs text-gray-500">최대 1,000,000원</p>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">재고 수량 <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={form.stock}
              onChange={e => {
                const num = Number(e.target.value);
                if (!Number.isFinite(num) || num < 0) return;
                setForm(prev => ({ ...prev, stock: num }));
              }}
              onInput={handleNumberInput}
              className="w-full border px-3 py-2 rounded"
              step={1}
              min={0}
            />
          </div>
        </div>

        {/* Weight */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">중량 (선택)</label>
          <input
            type="text"
            value={form.weight}
            onChange={e => setForm(prev => ({ ...prev, weight: e.target.value }))}
            className="w-full border px-3 py-2 rounded"
            placeholder="예) 1kg, 500g"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">설명 (선택)</label>
          <textarea
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full border px-3 py-2 rounded min-h-[100px] resize-y"
            placeholder="상품 설명을 입력하세요"
            maxLength={500}
          />
          <p className="text-xs text-gray-500 text-right">{form.description.length} / 500</p>
        </div>

        {/* Order index */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">정렬순서</label>
          <input
            type="number"
            value={form.orderIndex}
            onChange={e => setForm(prev => ({ ...prev, orderIndex: Number(e.target.value) || 0 }))}
            className="w-full border px-3 py-2 rounded"
            min={0}
          />
          <p className="text-xs text-gray-500">숫자가 작을수록 먼저 표시됩니다</p>
        </div>

        {/* Categories */}
        {categories.length > 0 && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">카테고리</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => {
                const active = selectedCategoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryIds(prev =>
                        prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                      );
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Visible toggle */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">상품 노출 여부</label>
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, visible: !prev.visible }))}
            className={`h-8 w-full rounded font-medium transition text-sm ${
              form.visible
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-rose-500 hover:bg-rose-600 text-white'
            }`}
          >
            {form.visible ? '노출 O' : '노출 X'}
          </button>
        </div>

        {/* Main image */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">대표 이미지 <span className="text-red-500">*</span></label>
          {mainPreview && (
            <img
              src={mainPreview}
              alt="대표 이미지 미리보기"
              className="w-28 h-28 rounded object-cover border"
            />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              id="courier-main-image"
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleMainImageChange}
              className="hidden"
            />
            <label htmlFor="courier-main-image" className="h-9 px-3 inline-flex items-center rounded border text-sm cursor-pointer hover:bg-gray-50">
              파일 선택
            </label>
            {mainFile && (
              <span className="text-sm text-gray-700 truncate max-w-full">{mainFile.name}</span>
            )}
          </div>
        </div>

        {/* Detail images */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">상세 이미지 (최대 {DETAIL_IMAGES_MAX}장)</label>
          {detailPreviews.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {detailPreviews.map((src, i) => (
                <div key={src} className="relative w-28">
                  <img src={src} alt={`상세 ${i + 1}`} className="w-28 h-28 rounded object-cover border" />
                  <button
                    type="button"
                    onClick={() => removeDetailImage(i)}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white text-xs"
                    aria-label="이미지 제거"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              id="courier-detail-images"
              type="file"
              accept="image/png, image/jpeg"
              multiple
              onChange={handleDetailImagesChange}
              className="hidden"
            />
            <label htmlFor="courier-detail-images" className="h-9 px-3 inline-flex items-center rounded border text-sm cursor-pointer hover:bg-gray-50">
              파일 선택
            </label>
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={uploading}
          className="w-full bg-orange-500 text-white py-2.5 rounded hover:bg-orange-600 disabled:bg-gray-300 font-medium"
        >
          {uploading ? '등록 중...' : '상품 등록'}
        </button>
      </section>
    </main>
  );
}
