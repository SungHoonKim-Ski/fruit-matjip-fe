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
} from '../../../utils/api';
import { compressImage, DETAIL_IMAGE_OPTS } from '../../../utils/image-compress';

type ProductForm = {
  name: string;
  price: number;
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
    description: '',
    visible: true,
  });
  const [uploading, setUploading] = useState(false);

  // Main image
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [mainPreview, setMainPreview] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);

  // Shipping fee
  const [shippingFee, setShippingFee] = useState<string>('');
  const [combinedShippingQuantity, setCombinedShippingQuantity] = useState<string>('1');

  // Option groups
  const [optionGroups, setOptionGroups] = useState<OptionGroupForm[]>([]);

  // Cleanup preview URLs (unmount only)
  useEffect(() => {
    return () => {
      if (mainPreview) URL.revokeObjectURL(mainPreview);
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
        const compressed = await compressImage(file, DETAIL_IMAGE_OPTS);
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
        [{ size: ['small', false, 'large', 'huge'] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'image'],
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

      // 2) Build option groups payload
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

      // 3) Create product
      const payload: any = {
        name: form.name.trim(),
        price: form.price,
        product_url: mainKey,
        visible: form.visible,
      };
      if (form.description.trim()) payload.description = form.description.trim();
      if (selectedCategoryIds.length > 0) payload.category_ids = selectedCategoryIds;
      payload.shipping_fee = shippingFee.trim() === '' ? 0 : Number(shippingFee);
      payload.combined_shipping_quantity = combinedShippingQuantity.trim() === '' ? 1 : Number(combinedShippingQuantity);
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

        {/* Price */}
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

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">설명 (선택)</label>
          <div className="[&_.ql-editor_img]:w-full [&_.ql-editor_img]:h-auto [&_.ql-editor_img]:rounded">
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={form.description}
              onChange={(value: string) => setForm(prev => ({ ...prev, description: value }))}
              modules={quillModules}
              formats={['size', 'bold', 'italic', 'underline', 'list', 'link', 'image']}
              placeholder="상품 설명을 입력하세요"
              style={{ minHeight: '150px' }}
            />
          </div>
        </div>

        {/* 배송비 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">배송비 (원)</label>
          <input
            type="number"
            value={shippingFee}
            onChange={e => setShippingFee(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="0 입력 시 무료배송"
            min={0}
            step={100}
          />
        </div>

        {/* 합배송 수량 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">합배송 수량</label>
          <input
            type="number"
            value={combinedShippingQuantity}
            onChange={e => setCombinedShippingQuantity(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="1"
            min={1}
            step={1}
          />
          <p className="text-xs text-gray-500">해당 수량까지 배송비 1건으로 합산됩니다 (예: 3이면 3개까지 배송비 1회)</p>
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
              className="max-w-xs max-h-60 rounded object-contain border"
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
                <div key={gi} className="border rounded-lg p-3 space-y-2 bg-gray-50 relative">
                  {/* Group delete button */}
                  <button
                    type="button"
                    onClick={() => removeOptionGroup(gi)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white text-red-500 hover:bg-red-50 text-sm flex items-center justify-center shadow"
                    aria-label="그룹 삭제"
                  >
                    -
                  </button>
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
                        className="accent-green-600"
                      />
                      필수
                    </label>
                  </div>
                  {/* Options */}
                  <div className="space-y-1.5">
                    {group.options.map((opt, oi) => (
                      <div key={oi} className="space-y-1.5 bg-white rounded p-2 border border-gray-200">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt.name}
                            onChange={e => updateOption(gi, oi, 'name', e.target.value)}
                            className="flex-1 border px-2 py-1 rounded text-sm"
                            placeholder="옵션명 (예: 대, 중, 소)"
                          />
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
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={opt.additionalPrice}
                            onChange={e => updateOption(gi, oi, 'additionalPrice', e.target.value)}
                            className="flex-1 border px-2 py-1 rounded text-sm"
                            placeholder="추가금액"
                            min={0}
                          />
                          <span className="text-xs text-gray-500 whitespace-nowrap">원</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={opt.stock}
                            onChange={e => updateOption(gi, oi, 'stock', e.target.value)}
                            className="flex-1 border px-2 py-1 rounded text-sm"
                            placeholder="재고 (미입력 시 무제한)"
                            min={0}
                          />
                          <span className="text-xs text-gray-500 whitespace-nowrap">개</span>
                        </div>
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
          className="w-full text-white py-2.5 rounded disabled:bg-gray-300 font-medium"
          style={uploading ? undefined : { backgroundColor: 'var(--color-primary-500)' }}
        >
          {uploading ? '등록 중...' : '상품 등록'}
        </button>
      </section>
    </main>
  );
}
