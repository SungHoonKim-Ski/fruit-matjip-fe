import React, { useState } from 'react';
import { useSnackbar } from '../../components/snackbar';

type ProductForm = {
  name: string;
  price: number;
  stock: number;
  image: File | null;
};

export default function ProductCreatePage() {
  const { show } = useSnackbar(); // ✅ 훅은 컴포넌트 최상단에서 한 번만
  const [form, setForm] = useState<ProductForm>({
    name: '',
    price: 0,
    stock: 0,
    image: null,
  });
  const [uploading, setUploading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, files } = e.target;

    if (name === 'image' && files?.[0]) {
      setForm({ ...form, image: files[0] });
    } else if (name === 'price' || name === 'stock') {
      const num = Number(value);
      if (!Number.isInteger(num) || num < 0) return; // 0 이상 정수만
      setForm({ ...form, [name]: num });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price || !form.stock || !form.image) {
      show('모든 값을 입력해주세요.', { variant: 'error' });
      return;
    }

    try {
      setUploading(true);

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
      };
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(productPayload),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('상품 등록 실패');

      show('상품이 등록되었습니다!', { variant: 'success' });
      setForm({ name: '', price: 0, stock: 0, image: null });
    } catch (err: any) {
      show(err?.message || '상품 등록 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="max-w-md mx-auto p-6 bg-white mt-10 rounded shadow space-y-4">
      <h1 className="text-xl font-bold">📦 상품 등록</h1>

      <div className="space-y-2">
        <label className="block text-sm font-medium">상품명</label>
        <input
          type="text"
          name="name"
          value={form.name}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">가격</label>
        <input
          type="number"
          name="price"
          value={form.price}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">재고 수량</label>
        <input
          type="number"
          name="stock"
          value={form.stock}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">상품 이미지</label>
        <input
          type="file"
          name="image"
          accept="image/*"
          onChange={handleChange}
          className="w-full"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={uploading}
        className="w-full bg-orange-500 text-white py-2 rounded hover:bg-orange-600 disabled:bg-gray-300"
      >
        {uploading ? '등록 중...' : '상품 등록'}
      </button>
    </main>
  );
}
