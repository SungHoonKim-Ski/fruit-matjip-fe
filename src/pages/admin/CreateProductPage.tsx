import React, { useState } from 'react';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';

type ProductForm = {
  name: string;
  price: number;
  stock: number;
  image: File | null;
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
    sellDate: today, // 오늘 날짜를 기본값으로
    status: 'active', // 기본값은 활성
  });
  const [uploading, setUploading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, files } = e.target as HTMLInputElement;

    if (name === 'image' && files?.[0]) {
      setForm({ ...form, image: files[0] });
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
        setForm({ name: '', price: 0, stock: 0, image: null, sellDate: today, status: 'active' });
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
        setForm({ name: '', price: 0, stock: 0, image: null, sellDate: today, status: 'active' });
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
            accept="image/*"
            onChange={handleChange}
            className="w-full"
            required
          />
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
