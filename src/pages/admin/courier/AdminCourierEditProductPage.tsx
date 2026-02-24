import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
  getAdminCourierProduct,
  updateAdminCourierProduct,
  deleteAdminCourierProduct,
  getAdminCourierProductPresignedUrl,
  getAdminCourierCategories,
} from '../../../utils/api';
import { compressImage, DETAIL_IMAGE_OPTS } from '../../../utils/image-compress';

type ProductEdit = {
  id: number;
  name: string;
  price: number;
  description: string;
  visible: boolean;
  soldOut: boolean;
  imageUrl: string;
  categoryIds: number[];
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

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';
const PRICE_MAX = 1_000_000;

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return IMG_BASE ? `${IMG_BASE}/${url}` : url;
};

export default function AdminCourierEditProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [form, setForm] = useState<ProductEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const quillRef = useRef<any>(null);

  // Main image replacement
  const mainFileRef = useRef<HTMLInputElement>(null);
  const [newMainFile, setNewMainFile] = useState<File | null>(null);
  const [mainPreview, setMainPreview] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryConfirmed, setCategoryConfirmed] = useState(false);

  // Shipping fee
  const [shippingFee, setShippingFee] = useState<string>('');
  const [combinedShippingQuantity, setCombinedShippingQuantity] = useState<string>('1');

  // Option groups
  const [optionGroups, setOptionGroups] = useState<OptionGroupForm[]>([]);

  // Cleanup (unmount only)
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
        safeErrorLog(err, 'AdminCourierEditProductPage - loadCategories');
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load product
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getAdminCourierProduct(Number(id));
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return;
          throw new Error('상품 정보를 불러오지 못했습니다.');
        }
        const raw = await res.json();
        const data = raw?.response ?? raw;
        const catIds: number[] = Array.isArray(data.category_ids ?? data.categoryIds)
          ? (data.category_ids ?? data.categoryIds).map(Number)
          : [];

        // Parse option groups
        const rawGroups = data.option_groups ?? data.optionGroups;
        const parsedOptionGroups: OptionGroupForm[] = Array.isArray(rawGroups)
          ? rawGroups.map((g: any) => ({
              name: String(g.name ?? ''),
              required: Boolean(g.required ?? true),
              options: Array.isArray(g.options) && g.options.length > 0
                ? g.options.map((o: any) => ({
                    name: String(o.name ?? ''),
                    additionalPrice: String(o.additional_price ?? o.additionalPrice ?? 0),
                    stock: o.stock != null ? String(o.stock) : '',
                  }))
                : [{ name: '', additionalPrice: '0', stock: '' }],
            }))
          : [];

        if (alive) {
          setForm({
            id: Number(data.id),
            name: String(data.name ?? ''),
            price: Number(data.price ?? 0),
            description: String(data.description ?? ''),
            visible: typeof data.visible === 'boolean' ? data.visible : true,
            soldOut: typeof data.sold_out === 'boolean' ? data.sold_out : false,
            imageUrl: addImgPrefix(data.product_url ?? data.image_url ?? data.imageUrl ?? ''),
            categoryIds: catIds,
          });
          const rawFee = data.shipping_fee ?? data.shippingFee ?? 0;
          setShippingFee(String(Number(rawFee)));
          const rawQty = data.combined_shipping_quantity ?? data.combinedShippingQuantity ?? 1;
          setCombinedShippingQuantity(String(Number(rawQty)));
          setOptionGroups(parsedOptionGroups);
          setCategoryConfirmed(true);
        }
      } catch (e: any) {
        safeErrorLog(e, 'AdminCourierEditProductPage - load');
        show(getSafeErrorMessage(e, '상품 정보를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, show]);

  const handleMainImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setNewMainFile(compressed);
      if (mainPreview) URL.revokeObjectURL(mainPreview);
      setMainPreview(URL.createObjectURL(compressed));
    } catch (err) {
      safeErrorLog(err, 'AdminCourierEditProductPage - compressMainImage');
      show(getSafeErrorMessage(err, '이미지 처리 중 오류가 발생했습니다.'), { variant: 'error' });
    }
    e.target.value = '';
  };

  const uploadFileWithPresignedUrl = async (file: File): Promise<string> => {
    const presignedRes = await getAdminCourierProductPresignedUrl(file.name, file.type);
    if (!presignedRes.ok) throw new Error(`이미지 업로드 URL 발급 실패: ${presignedRes.status}`);
    const presigned = await presignedRes.json();
    const { url, key, method } = presigned;
    if (!url || !key) throw new Error('Presigned 응답에 url 또는 key가 없습니다.');

    const uploadRes = await fetch(url, {
      method: (method || 'PUT').toUpperCase(),
      body: file,
      mode: 'cors',
    });
    if (!uploadRes.ok) throw new Error(`S3 업로드 실패: ${uploadRes.status}`);
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

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      show('상품명을 입력해주세요.', { variant: 'error' });
      return;
    }
    if (form.price <= 0) {
      show('가격을 입력해주세요.', { variant: 'error' });
      return;
    }
    if (!categoryConfirmed && form.categoryIds.length === 0) {
      show('카테고리를 선택해주세요.', { variant: 'error' });
      return;
    }

    try {
      setSaving(true);

      // Upload new main image if changed
      let newMainKey: string | null = null;
      if (newMainFile) {
        newMainKey = await uploadFileWithPresignedUrl(newMainFile);
      }

      // Build option groups payload
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

      // Build payload
      const payload: any = {
        name: form.name.trim(),
        price: form.price,
        visible: form.visible,
        sold_out: form.soldOut,
      };
      if (newMainKey) payload.product_url = newMainKey;
      payload.description = form.description.trim() || null;
      if (form.categoryIds.length > 0) payload.category_ids = form.categoryIds;
      payload.shipping_fee = shippingFee.trim() === '' ? 0 : Number(shippingFee);
      payload.combined_shipping_quantity = combinedShippingQuantity.trim() === '' ? 1 : Number(combinedShippingQuantity);
      payload.option_groups = optionGroupsPayload;

      const res = await updateAdminCourierProduct(Number(id), payload);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return;
        throw new Error('저장에 실패했습니다.');
      }

      show('저장되었습니다.', { variant: 'success' });
      nav('/admin/courier/products', { replace: true });
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierEditProductPage - save');
      show(getSafeErrorMessage(e, '저장 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form) return;
    if (!window.confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    try {
      const res = await deleteAdminCourierProduct(form.id);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return;
        throw new Error('삭제에 실패했습니다.');
      }
      show('삭제되었습니다.', { variant: 'success' });
      nav('/admin/courier/products', { replace: true });
    } catch (e: any) {
      safeErrorLog(e, 'AdminCourierEditProductPage - delete');
      show(getSafeErrorMessage(e, '삭제 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-6">
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
      <main className="min-h-screen bg-gray-50 px-4 pt-6">
        <div className="max-w-md mx-auto text-center text-gray-500">상품을 찾을 수 없습니다.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <div className="max-w-md mx-auto mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">택배 상품 수정</h1>
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
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full border px-3 py-2 rounded"
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
              setForm({ ...form, price: Math.min(num, PRICE_MAX) });
            }}
            className="w-full border px-3 py-2 rounded"
            step={100}
            max={PRICE_MAX}
            min={0}
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">설명 (선택)</label>
          <div className="[&_.ql-editor_img]:w-full [&_.ql-editor_img]:h-auto [&_.ql-editor_img]:rounded">
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={form.description}
              onChange={(value: string) => setForm({ ...form, description: value })}
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
                setForm({ ...form, categoryIds: [] });
                setCategoryConfirmed(true);
              }}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                categoryConfirmed && form.categoryIds.length === 0
                  ? 'bg-gray-700 border-gray-700 text-white'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              없음
            </button>
            {categories.map(cat => {
              const active = form.categoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategoryConfirmed(true);
                    setForm({
                      ...form,
                      categoryIds: active
                        ? form.categoryIds.filter(cid => cid !== cat.id)
                        : [...form.categoryIds, cat.id],
                    });
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

        {/* Visible + SoldOut toggles (one row) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium">노출 여부</label>
            <button
              type="button"
              onClick={() => setForm({ ...form, visible: !form.visible })}
              className={`h-8 w-full rounded font-medium transition text-sm ${
                form.visible
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-rose-500 hover:bg-rose-600 text-white'
              }`}
            >
              {form.visible ? '노출 O' : '노출 X'}
            </button>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium">품절 여부</label>
            <button
              type="button"
              onClick={() => setForm({ ...form, soldOut: !form.soldOut })}
              className={`h-8 w-full rounded font-medium transition text-sm ${
                form.soldOut
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {form.soldOut ? '품절 O' : '품절 X'}
            </button>
          </div>
        </div>

        {/* Main image */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">대표 이미지</label>
          <img
            src={mainPreview || form.imageUrl}
            alt={form.name}
            className="max-w-xs max-h-60 rounded object-contain border"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              id="courier-edit-main-image"
              ref={mainFileRef}
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleMainImageChange}
              className="hidden"
            />
            <label htmlFor="courier-edit-main-image" className="h-9 px-3 inline-flex items-center rounded border text-sm cursor-pointer hover:bg-gray-50">
              파일 선택
            </label>
            {newMainFile && (
              <span className="text-sm text-gray-700 truncate max-w-full">{newMainFile.name}</span>
            )}
          </div>
        </div>

        {/* Option groups */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">옵션 그룹</label>
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

        {/* Action buttons */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`h-10 px-5 rounded text-white font-medium ${saving ? 'bg-gray-400' : ''}`}
            style={saving ? undefined : { backgroundColor: 'var(--color-primary-500)' }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-10 px-4 rounded border text-red-600 hover:bg-red-50"
          >
            삭제
          </button>
        </div>
      </section>
    </main>
  );
}
