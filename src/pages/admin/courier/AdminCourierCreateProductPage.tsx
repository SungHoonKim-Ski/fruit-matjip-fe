import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
  createAdminCourierProduct,
  getAdminCourierProductPresignedUrl,
  getAdminCourierCategories,
  getAdminCourierShippingFeeTemplates,
  ShippingFeeTemplateResponse,
} from '../../../utils/api';
import { compressImage, DETAIL_IMAGE_OPTS } from '../../../utils/image-compress';

type ProductForm = {
  name: string;
  price: number;
  stock: number;
  description: string;
  visible: boolean;
};

type CategoryItem = {
  id: number;
  name: string;
};

type OptionItemForm = {
  name: string;
  additionalPrice: string;
  stock: string; // empty string = unlimited (null on BE)
};

type OptionGroupForm = {
  name: string;
  required: boolean;
  options: OptionItemForm[];
};

const PRICE_MAX = 1_000_000;
const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

export default function AdminCourierCreateProductPage() {
  const { show } = useSnackbar();
  const nav = useNavigate();
  const quillRef = useRef<any>(null);

  const [form, setForm] = useState<ProductForm>({
    name: '',
    price: 0,
    stock: 0,
    description: '',
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
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);

  // Shipping fee templates
  const [shippingFeeTemplates, setShippingFeeTemplates] = useState<ShippingFeeTemplateResponse[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  // Option groups
  const [optionGroups, setOptionGroups] = useState<OptionGroupForm[]>([]);

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
        const res = await getAdminCourierCategories();
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

  // Load shipping fee templates
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getAdminCourierShippingFeeTemplates();
        if (alive) setShippingFeeTemplates(data.templates ?? []);
      } catch (err) {
        safeErrorLog(err, 'AdminCourierCreateProductPage - loadShippingFeeTemplates');
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
        try { return await compressImage(f, DETAIL_IMAGE_OPTS); }
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

  // Option group helpers
  const addOptionGroup = () => {
    setOptionGroups(prev => [...prev, { name: '', required: true, options: [{ name: '', additionalPrice: '0', stock: '' }] }]);
  };

  const removeOptionGroup = (gi: number) => {
    setOptionGroups(prev => prev.filter((_, i) => i !== gi));
  };

  const updateOptionGroup = (gi: number, field: keyof Pick<OptionGroupForm, 'name' | 'required'>, value: string | boolean) => {
    setOptionGroups(prev => prev.map((g, i) => i === gi ? { ...g, [field]: value } : g));
  };

  const addOption = (gi: number) => {
    setOptionGroups(prev => prev.map((g, i) =>
      i === gi ? { ...g, options: [...g.options, { name: '', additionalPrice: '0', stock: '' }] } : g
    ));
  };

  const removeOption = (gi: number, oi: number) => {
    setOptionGroups(prev => prev.map((g, i) =>
      i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g
    ));
  };

  const updateOption = (gi: number, oi: number, field: keyof OptionItemForm, value: string) => {
    setOptionGroups(prev => prev.map((g, i) =>
      i === gi
        ? { ...g, options: g.options.map((o, j) => j === oi ? { ...o, [field]: value } : o) }
        : g
    ));
  };

  const imageHandler = useCallback(() => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/png, image/jpeg');
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file);
        const key = await uploadFileWithPresignedUrl(compressed);
        const imgUrl = IMG_BASE ? `${IMG_BASE}/${key}` : key;

        const quill = quillRef.current?.getEditor();
        if (quill) {
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'image', imgUrl);
          quill.setSelection(range.index + 1);
        }
      } catch (err) {
        safeErrorLog(err, 'imageHandler');
        show('이미지 업로드에 실패했습니다.', { variant: 'error' });
      }
    };
  }, [show]);

  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'image'],
        ['clean'],
      ],
      handlers: {
        image: imageHandler,
      },
    },
  }), [imageHandler]);

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
    if (!categoryConfirmed && selectedCategoryIds.length === 0) {
      show('카테고리를 선택해주세요.', { variant: 'error' });
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

      // 3) Build option groups payload
      const optionGroupsPayload = optionGroups
        .filter(g => g.name.trim())
        .map((g, gi) => ({
          name: g.name.trim(),
          required: g.required,
          sort_order: gi,
          options: g.options
            .filter(o => o.name.trim())
            .map((o, oi) => ({
              name: o.name.trim(),
              additional_price: Number(o.additionalPrice) || 0,
              sort_order: oi,
              stock: o.stock.trim() === '' ? null : Number(o.stock),
            })),
        }));

      // 4) Create product
      const payload: any = {
        name: form.name.trim(),
        price: form.price,
        stock: form.stock,
        product_url: mainKey,
        visible: form.visible,
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (detailKeys.length > 0) payload.detail_image_urls = detailKeys;
      if (selectedCategoryIds.length > 0) payload.category_ids = selectedCategoryIds;
      if (selectedTemplateId != null) payload.shipping_fee_template_id = selectedTemplateId;
      if (optionGroupsPayload.length > 0) payload.option_groups = optionGroupsPayload;

      const res = await createAdminCourierProduct(payload);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return;
        throw new Error(`상품 등록 실패: ${res.status}`);
      }

      show('상품이 등록되었습니다!', { variant: 'success' });
      nav('/admin/courier/products', { replace: true });
    } catch (err: any) {
      safeErrorLog(err, 'AdminCourierCreateProductPage - handleSubmit');
      show(getSafeErrorMessage(err, '상품 등록 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <div className="max-w-md mx-auto mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">택배 상품 등록</h1>
          <AdminCourierHeader />
        </div>
      </div>
      <section className="max-w-md mx-auto p-6 bg-white rounded shadow space-y-4">

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

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">설명 (선택)</label>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={form.description}
            onChange={(value: string) => setForm(prev => ({ ...prev, description: value }))}
            modules={quillModules}
            formats={['bold', 'italic', 'underline', 'list', 'link', 'image']}
            placeholder="상품 설명을 입력하세요"
            style={{ minHeight: '150px' }}
          />
        </div>

        {/* Shipping fee template */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">배송 정책</label>
          <select
            value={selectedTemplateId ?? ''}
            onChange={e => setSelectedTemplateId(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full border px-3 py-2 rounded bg-white"
          >
            <option value="">선택하세요</option>
            {shippingFeeTemplates.filter(t => t.active).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Categories */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">카테고리 <span className="text-red-500">*</span></label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryIds([]);
                setCategoryConfirmed(true);
              }}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                categoryConfirmed && selectedCategoryIds.length === 0
                  ? 'bg-gray-700 border-gray-700 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              없음
            </button>
            {categories.map(cat => {
              const active = selectedCategoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategoryConfirmed(true);
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

        {/* Option groups */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">옵션 그룹 (선택)</label>
            <button
              type="button"
              onClick={addOptionGroup}
              className="text-xs px-3 py-1.5 rounded border border-blue-500 text-blue-600 hover:bg-blue-50 transition"
            >
              + 옵션 그룹 추가
            </button>
          </div>
          {optionGroups.length > 0 && (
            <div className="space-y-3">
              {optionGroups.map((group, gi) => (
                <div key={gi} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                  {/* Group header */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={group.name}
                      onChange={e => updateOptionGroup(gi, 'name', e.target.value)}
                      className="flex-1 border px-2 py-1.5 rounded text-sm"
                      placeholder="그룹명 (예: 사이즈, 색상)"
                    />
                    <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={group.required}
                        onChange={e => updateOptionGroup(gi, 'required', e.target.checked)}
                        className="accent-orange-500"
                      />
                      필수
                    </label>
                    <button
                      type="button"
                      onClick={() => removeOptionGroup(gi)}
                      className="text-red-400 hover:text-red-600 text-xs px-1"
                      aria-label="그룹 삭제"
                    >
                      삭제
                    </button>
                  </div>
                  {/* Options */}
                  <div className="space-y-1.5 pl-1">
                    {group.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt.name}
                          onChange={e => updateOption(gi, oi, 'name', e.target.value)}
                          className="flex-1 border px-2 py-1 rounded text-sm"
                          placeholder="옵션명"
                        />
                        <input
                          type="number"
                          value={opt.additionalPrice}
                          onChange={e => updateOption(gi, oi, 'additionalPrice', e.target.value)}
                          className="w-24 border px-2 py-1 rounded text-sm"
                          placeholder="추가금액"
                          min={0}
                        />
                        <span className="text-xs text-gray-500 whitespace-nowrap">원</span>
                        <input
                          type="number"
                          value={opt.stock}
                          onChange={e => updateOption(gi, oi, 'stock', e.target.value)}
                          className="w-20 border px-2 py-1 rounded text-sm"
                          placeholder="재고"
                          min={0}
                        />
                        <span className="text-xs text-gray-500 whitespace-nowrap">개</span>
                        {group.options.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOption(gi, oi)}
                            className="text-gray-400 hover:text-red-500 text-xs"
                            aria-label="옵션 삭제"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => addOption(gi)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + 옵션 추가
                  </button>
                </div>
              ))}
            </div>
          )}
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
