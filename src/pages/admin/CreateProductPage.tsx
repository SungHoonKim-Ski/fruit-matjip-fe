import React, { useState } from 'react';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';

type ProductForm = {
  name: string;
  price: number;
  stock: number;
  image: File | null;
  extraImages: File[]; // 추가 이미지
  sellDate: string; // Required now
  status: 'active' | 'inactive'; // Added status field
};

export default function ProductCreatePage() {
  const { show } = useSnackbar();
  
  // 오늘 날짜를 기본값으로 설정
  const today = new Date().toISOString().split('T')[0];
  
  const [form, setForm] = useState<ProductForm>({
    name: '',
    price: 0,
    stock: 0,
    image: null,
    extraImages: [],
    sellDate: today, // 오늘 날짜를 기본값으로
    status: 'active', // 기본값은 활성
  });
  const [uploading, setUploading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, files } = e.target as HTMLInputElement;

    if (name === 'image') {
      if (files?.[0]) {
        const file = files[0];
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
          show('PNG 또는 JPG 이미지만 업로드할 수 있습니다.', { variant: 'error' });
          e.target.value = '';
          return;
        }
        setForm({ ...form, image: file });
        e.target.value = '';
      }
      // 파일을 선택하지 않은 경우 아무 동작도 하지 않음 (기존 이미지 유지)
    } else if (name === 'extraImages') {
      if (files && files.length > 0) {
        // png, jpg만 허용
        const validFiles = Array.from(files).filter(f => {
          const ext = f.name.split('.').pop()?.toLowerCase();
          return ext === 'png' || ext === 'jpg' || ext === 'jpeg';
        });
        if (validFiles.length !== files.length) {
          show('이미지는 PNG, JPG만 업로드할 수 있습니다.', { variant: 'error' });
        }
        setForm({ ...form, extraImages: [...form.extraImages, ...validFiles] });
        e.target.value = '';
      }
    } else if (name === 'price' || name === 'stock') {
      const num = Number(value);
      if (!Number.isInteger(num) || num < 0) return;
      setForm({ ...form, [name]: num });
    } else if (name === 'sellDate') {
      setForm({ ...form, sellDate: value });
    } else if (name === 'status') {
      setForm({ ...form, status: value as 'active' | 'inactive' });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price || !form.stock || !form.image || !form.sellDate) {
      show('모든 값을 입력해주세요.', { variant: 'error' });
      return;
    }

    try {
      setUploading(true);

      // Mock implementation - 실제 API 호출 대신 mock 처리
      if (USE_MOCKS) {
        // Mock 이미지 URL 생성
        const mockImageUrl = URL.createObjectURL(form.image);
        
        // Mock 상품 등록 성공
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 지연
        
        show('상품이 등록되었습니다!', { variant: 'success' });
        setForm({ name: '', price: 0, stock: 0, image: null, extraImages: [], sellDate: today, status: 'active' });
      } else {
        // 1) presigned URL 요청
        const presignedUrlRes = await fetch('/api/admin/presigned-url', {
          method: 'POST',
          body: JSON.stringify({ fileName: form.image.name }),
          headers: { 'Content-Type': 'application/json' },
        });
        if (!presignedUrlRes.ok) throw new Error('이미지 업로드 URL 발급 실패');
        const { url, imageUrl } = await presignedUrlRes.json();

        // 2) 이미지 업로드
        await fetch(url, {
          method: 'PUT',
          body: form.image,
          headers: { 'Content-Type': form.image.type },
        });

        // 3) 상품 등록
        const productPayload = {
          name: form.name,
          price: form.price,
          stock: form.stock,
          imageUrl,
          sellDate: form.sellDate,
          status: form.status,
        };
        const res = await fetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(productPayload),
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error('상품 등록 실패');

        show('상품이 등록되었습니다!', { variant: 'success' });
        setForm({ name: '', price: 0, stock: 0, image: null, extraImages: [], sellDate: today, status: 'active' });
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
            placeholder="상품명을 입력하세요"
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
              className="w-full border px-3 py-2 rounded"
              placeholder="0"
              min="0"
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
              className="w-full border px-3 py-2 rounded"
              placeholder="0"
              min="0"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">판매일 <span className="text-red-500">*</span></label>
          <input
            type="date"
            name="sellDate"
            value={form.sellDate}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">노출 여부 <span className="text-red-500">*</span></label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
            required
          >
            <option value="active">상품 목록 노출 O</option>
            <option value="inactive">상품 목록 노출 X</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">상품 이미지 <span className="text-red-500">*</span></label>
          <input
            type="file"
            name="image"
            accept="image/png, image/jpeg"
            onChange={handleChange}
            className="w-full"
            required
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">추가 이미지 (복수 선택 가능, PNG/JPG만)</label>
          <input
            type="file"
            name="extraImages"
            accept="image/png, image/jpeg"
            multiple
            onChange={handleChange}
            className="w-full"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {form.extraImages.map((file, idx) => (
              <div key={file.name + idx} className="relative">
                <img src={URL.createObjectURL(file)} alt="추가 이미지 미리보기" className="w-16 h-16 object-cover rounded border" />
                <button
                  type="button"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white text-xs"
                  onClick={() => setForm({ ...form, extraImages: form.extraImages.filter((_, i) => i !== idx) })}
                >✕</button>
              </div>
            ))}
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
