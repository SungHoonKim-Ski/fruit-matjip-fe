import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { addCategoryToProduct, createAdminProduct, getAdminProductCategories, getUploadUrl } from '../../utils/api';
import { compressImage } from '../../utils/image-compress';

type ProductForm = {
  name: string;      // NotBlank, Size max=20
  price: number;     // NotNull, Min=1
  stock: number;     // NotNull, Min=1
  image_url: File | null;
  sell_date: string;  // NotBlank, Pattern: YYYY-MM-DD
  visible: boolean;  // NotNull
};
const PRICE_MAX = 1_000_000;
type CategoryItem = {
  id: number;
  name: string;
  imageUrl?: string;
};

// KST 기준 오늘 날짜 반환 함수
function getKstTodayStr() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kstNow.toISOString().split('T')[0];
}

export default function ProductCreatePage() {
  const { show } = useSnackbar();
  const nav = useNavigate();
  
  // 오늘 날짜를 기본값으로 설정 (KST 기준)
  const today = (() => {
    const now = new Date();
    // 브라우저가 이미 KST 시간대를 인식하고 있으므로 현재 시간을 그대로 사용
    const kstNow = now;
    return kstNow.toISOString().split('T')[0];
  })();
  
  const [form, setForm] = useState<ProductForm>({
    name: '',
    price: 0, // step 1000 사용 시 자연스럽도록 기본 1000
    stock: 0,   // step 10 사용 시 자연스럽도록 기본 10
    image_url: null,
    sell_date: getKstTodayStr(),
    visible: true,
  });
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCompressed, setIsCompressed] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);

  // 미리보기 URL 정리
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let alive = true;
    const loadCategories = async () => {
      if (USE_MOCKS) {
        if (alive) setCategories([]);
        return;
      }
      try {
        const data = await getAdminProductCategories();
        const list = Array.isArray(data?.response) ? data.response : (Array.isArray(data) ? data : []);
        if (alive) {
          setCategories(list.map((c: any) => ({
            id: Number(c.id),
            name: String(c.name ?? ''),
            imageUrl: c.imageUrl ?? c.image_url ?? undefined,
          })));
        }
      } catch (err) {
        safeErrorLog(err, 'ProductCreatePage - loadCategories');
      }
    };
    loadCategories();
    return () => { alive = false; };
  }, []);

  const handleNumberInput = (e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const value = input.value;
    if (value.length > 1 && value.startsWith('0')) {
      input.value = value.slice(1);
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, files } = e.target as HTMLInputElement;

    if (name === 'image_url') {
      if (files?.[0]) {
        const file = files[0];
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
          show('.PNG/.JPG 파일만 업로드할 수 있습니다.', { variant: 'error' });
          e.target.value = '';
          return;
        }
        try {
          // 선택 즉시 클라이언트 압축 (5MB 목표, utils 기본값 사용)
          const compressed = await compressImage(file);
          setForm(prev => ({ ...prev, image_url: compressed }));
          setIsCompressed(true);
          // 미리보기 교체
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(URL.createObjectURL(compressed));
        } catch (err) {
          safeErrorLog(err, 'ProductCreatePage - compress (on change)');
          show(getSafeErrorMessage(err, '이미지 처리 중 오류가 발생했습니다.'), { variant: 'error' });
        } finally {
          // 파일 입력값 초기화(같은 파일 다시 선택 가능)
          e.target.value = '';
        }
      }
      return;
    }

    if (name === 'price') {
      if (value === '') {
        setForm({ ...form, price: 1000 });
        return;
      }
      if (value.length > 1 && value.startsWith('0')) return;
      const num = Number(value);
      if (!Number.isInteger(num) || num < 1) return;
      const capped = Math.min(num, PRICE_MAX);
      setForm({ ...form, price: capped });
      return;
    }

    if (name === 'stock') {
      if (value === '') {
        setForm({ ...form, stock: 10 });
        return;
      }
      if (value.length > 1 && value.startsWith('0')) return;
      const num = Number(value);
      if (!Number.isInteger(num) || num < 1) return;
      setForm({ ...form, stock: num });
      return;
    }

    if (name === 'sell_date') {
      setForm({ ...form, sell_date: value });
      return;
    }

    if (name === 'visible') {
      setForm({ ...form, visible: value === 'true' });
      return;
    }

    setForm({ ...form, [name]: value } as any);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price || !form.stock || !form.image_url || !form.sell_date) {
      show('모든 값을 입력해주세요.', { variant: 'error' });
      return;
    }

    try {
      setUploading(true);

      if (USE_MOCKS) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        show('상품이 등록되었습니다!', { variant: 'success' });
        setForm({ name: '', price: 1000, stock: 10, image_url: null, sell_date: today, visible: true });
        if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
        nav('/admin/products', { replace: true });
        return;
      }

      // 1) 업로드할 파일 준비(필요 시 안전 재압축)
      let fileToUpload = form.image_url as File;
      if (!isCompressed) {
        try {
          fileToUpload = await compressImage(fileToUpload);
        } catch (err) {
          safeErrorLog(err, 'ProductCreatePage - compress (on submit)');
        }
      }

      // 2) presigned URL 요청 (압축된 파일의 이름/타입으로 요청)
      const presignedUrlRes = await getUploadUrl(fileToUpload.name, fileToUpload.type);
      if (!presignedUrlRes.ok) {
        if (presignedUrlRes.status === 401 || presignedUrlRes.status === 403) return; // adminFetch에서 처리됨
        const errorText = await presignedUrlRes.text();
        throw new Error(`이미지 업로드 URL 발급 실패: ${presignedUrlRes.status} ${presignedUrlRes.statusText} - ${errorText}`);
      }

      const presignedData: {
        url: string;
        key: string;
        method?: string;
        contentType?: string;
        expiresIn?: number;
      } = await presignedUrlRes.json();

      const { url, key, method } = presignedData;
      if (!url || !key) throw new Error('Presigned 응답에 url 또는 key가 없습니다.');

      // 3) S3 업로드 (Content-Type은 URL에 서명으로 포함되어 있으므로 보통 헤더 설정 불필요)
      const uploadResponse = await fetch(url, {
        method: (method || 'PUT').toUpperCase(),
        body: fileToUpload,
        mode: 'cors',
      });
      if (!uploadResponse.ok) {
        throw new Error(`S3 업로드 실패: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      // 4) 상품 생성 API 호출 (키만 전달)
      const productPayload = {
        name: form.name,
        price: form.price,
        stock: form.stock,
        image_url: key, // 서버는 S3 key 저장
        sell_date: form.sell_date,
        visible: form.visible,
      };

      const res = await createAdminProduct(productPayload);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return; // adminFetch에서 처리됨
        throw new Error(`상품 등록 실패: ${res.status} ${res.statusText}`);
      }

      let createdId: number | null = null;
      try {
        const body = await res.json();
        if (typeof body === 'number') {
          createdId = body;
        } else if (body && typeof body === 'object') {
          createdId = Number(body.id ?? body.product_id ?? body.productId ?? 0) || null;
        }
      } catch {
        createdId = null;
      }

      if (createdId && selectedCategoryIds.length > 0) {
        try {
          await Promise.all(selectedCategoryIds.map(id => addCategoryToProduct(createdId as number, id)));
        } catch (err) {
          safeErrorLog(err, 'ProductCreatePage - attach categories');
          show('카테고리 연결 중 오류가 발생했습니다.', { variant: 'error' });
        }
      }

      show('상품이 등록되었습니다!', { variant: 'success' });
      setForm({ name: '', price: 1000, stock: 10, image_url: null, sell_date: today, visible: true });
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      setIsCompressed(false);
      setSelectedCategoryIds([]);
      nav('/admin/products', { replace: true });
    } catch (err: any) {
      safeErrorLog(err, 'ProductCreatePage - handleSubmit');
      show(getSafeErrorMessage(err, '상품 등록 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-16 pb-24">
      <section className="max-w-md mx-auto p-6 bg-white rounded shadow space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">📦 상품 등록</h1>
          
          {/* 데스크탑: AdminHeader / 모바일: 햄버거 */}
          <div className="relative">

          </div>
        </div>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium">상품명 <span className="text-red-500">*</span></label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
            placeholder="상품명을 입력하세요 (최대 30자)"
            maxLength={30}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">가격 <span className="text-red-500">*</span></label>
            <input
              type="number"
              name="price"
              value={form.price}
              onChange={handleChange}
              onInput={handleNumberInput}
              className="w-full border px-3 py-2 rounded"
              step={100}
              max={PRICE_MAX}
              placeholder="100"
              min={100}
              required
            />
            <p className="text-xs text-gray-500">최대 1,000,000원</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">재고 수량 <span className="text-red-500">*</span></label>
            <input
              type="number"
              name="stock"
              value={form.stock}
              onChange={handleChange}
              onInput={handleNumberInput}
              className="w-full border px-3 py-2 rounded"
              placeholder="1"
              step={1}
              min={1}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">카테고리</label>
          {categories.length === 0 ? (
            <div className="text-xs text-gray-500">등록된 카테고리가 없습니다.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map(category => {
                const active = selectedCategoryIds.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryIds(prev =>
                        prev.includes(category.id)
                          ? prev.filter(id => id !== category.id)
                          : [...prev, category.id]
                      );
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-gray-400">여러 개 선택 가능합니다.</p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">판매일 <span className="text-red-500">*</span></label>
          <input
            type="date"
            name="sell_date"
            value={form.sell_date}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">노출 여부 <span className="text-red-500">*</span></label>
          <select
            name="visible"
            value={form.visible ? 'true' : 'false'}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
            required
          >
            <option value="true">상품 목록 노출 O</option>
            <option value="false">상품 목록 노출 X</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">상품 이미지<span className="text-red-500">*</span></label>
          <div className="mt-2">
            {(previewUrl || form.image_url) && (
              <img
                src={previewUrl || URL.createObjectURL(form.image_url as File)}
                alt="상품 이미지 미리보기"
                className="w-28 h-28 rounded object-cover border"
              />
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <input
              id="main-image"
              type="file"
              name="image_url"
              accept="image/png, image/jpeg"
              onChange={handleChange}
              className="hidden"
              required
            />
            <label htmlFor="main-image" className="h-9 px-3 inline-flex items-center rounded border text-sm cursor-pointer hover:bg-gray-50">
              파일 선택
            </label>
            {form.image_url && (
              <span className="text-sm text-gray-700 truncate max-w-full">
                {(form.image_url as File).name}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="w-full bg-orange-500 text-white py-2 rounded hover:bg-orange-600 disabled:bg-gray-300"
        >
          {uploading ? '등록 중...' : '상품 등록'}
        </button>
      </section>
    </main>
  );
}
