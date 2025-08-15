import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { createAdminProduct, getUploadUrl } from '../../utils/api';

type ProductForm = {
  name: string;      // NotBlank, Size max=20
  price: number;     // NotNull, Min=1
  stock: number;     // NotNull, Min=1
  image_url: File | null;
  sell_date: string;  // NotBlank, Pattern: YYYY-MM-DD
  visible: boolean;  // NotNull
};

export default function ProductCreatePage() {
  const { show } = useSnackbar();
  const nav = useNavigate();
  
  // 오늘 날짜를 기본값으로 설정
  const today = new Date().toISOString().split('T')[0];
  
  const [form, setForm] = useState<ProductForm>({
    name: '',
    price: 1, // 최소값 1로 변경
    stock: 1, // 최소값 1로 변경
    image_url: null,
    sell_date: today, // 오늘 날짜를 기본값으로
    visible: true, // 기본값은 활성
  });
  const [uploading, setUploading] = useState(false);

  const handleNumberInput = (e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const value = input.value;
    
    // 0으로 시작하는 경우 (0 하나만 있는 경우 제외) 마지막 문자 제거
    if (value.length > 1 && value.startsWith('0')) {
      input.value = value.slice(1);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
        setForm({ ...form, image_url: file });
        e.target.value = '';
      }
      // 파일을 선택하지 않은 경우 아무 동작도 하지 않음 (기존 이미지 유지)
    } else if (name === 'price' || name === 'stock') {
      // 빈 문자열이거나 앞에 0이 오는 경우(0123, 0421 등) 처리
      if (value === '') {
        setForm({ ...form, [name]: 1 }); // 빈 값이면 최소값 1로 설정
        return;
      }
      
      // 앞에 0이 오는 경우 제거 (단, '0'만 입력한 경우는 허용하지 않음)
      if (value.length > 1 && value.startsWith('0')) {
        return; // 0123, 0421 같은 입력 무시
      }
      
      const num = Number(value);
      if (!Number.isInteger(num) || num < 1) return; // 최소값 1로 변경
      setForm({ ...form, [name]: num });
    } else if (name === 'sell_date') {
      setForm({ ...form, sell_date: value });
    } else if (name === 'visible') {
      setForm({ ...form, visible: value === 'true' });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price || !form.stock || !form.image_url || !form.sell_date) {
      show('모든 값을 입력해주세요.', { variant: 'error' });
      return;
    }

    try {
      setUploading(true);

      // Mock implementation - 실제 API 호출 대신 mock 처리
      if (USE_MOCKS) {
        // Mock 상품 등록 성공
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 지연
        
        show('상품이 등록되었습니다!', { variant: 'success' });
        setForm({ name: '', price: 1, stock: 1, image_url: null, sell_date: today, visible: true });
        nav('/admin/products', { replace: true });
      } else {
        // 1) presigned URL 요청
        try {
          const presignedUrlRes = await getUploadUrl(form.image_url!.name, form.image_url!.type);
          
          if (!presignedUrlRes.ok) {
            // 401, 403 에러는 통합 에러 처리로 위임
            if (presignedUrlRes.status === 401 || presignedUrlRes.status === 403) {
              return; // adminFetch에서 이미 처리됨
            }
            
            const errorText = await presignedUrlRes.text();
            throw new Error(`이미지 업로드 URL 발급 실패: ${presignedUrlRes.status} ${presignedUrlRes.statusText} - ${errorText}`);
          }
          
          const presignedData: {
            url: string;
            key: string;
            method: string;
            contentType: string;
            expiresIn: number;
          } = await presignedUrlRes.json();
          
          const { url, key, method, contentType, expiresIn } = presignedData;
          
          if (!url) {
            throw new Error('Presigned URL이 응답에 포함되지 않았습니다.');
          }

          // 2) 이미지 업로드
          const uploadResponse = await fetch(url, {
            method: method || 'PUT', // 서버에서 받은 method 사용, 기본값은 PUT
            body: form.image_url,
            // S3 presigned URL에서는 Content-Type을 헤더로 설정하지 않음 (URL에 포함됨)
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`S3 업로드 실패: ${uploadResponse.status} ${uploadResponse.statusText}`);
          }

          const imageUrl = key;
          
          const productPayload = {
            name: form.name,
            price: form.price,
            stock: form.stock,
            image_url: imageUrl,
            sell_date: form.sell_date,
            visible: form.visible,
          };
      
          const res = await createAdminProduct(productPayload);
          
          if (!res.ok) {
            // 401, 403 에러는 통합 에러 처리로 위임
            if (res.status === 401 || res.status === 403) {
              return; // adminFetch에서 이미 처리됨
            }
            
            const errorText = await res.text();
            throw new Error(`상품 등록 실패: ${res.status} ${res.statusText}`);
          }
          
          show('상품이 등록되었습니다!', { variant: 'success' });
          setForm({ name: '', price: 1, stock: 1, image_url: null, sell_date: today, visible: true });
          nav('/admin/products', { replace: true });
        } catch (uploadError) {
          throw uploadError;
        }
      }
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
        <h1 className="text-xl font-bold">📦 상품 등록</h1>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium">상품명 <span className="text-red-500">*</span></label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
            placeholder="상품명을 입력하세요 (최대 20자)"
            maxLength={20}
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
              placeholder="1"
              min="1"
              required
            />
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
              min="1"
              required
            />
          </div>
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
            {form.image_url && (
              <img
                src={URL.createObjectURL(form.image_url)}
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
                {form.image_url.name}
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
