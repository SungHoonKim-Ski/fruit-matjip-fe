import React, { useState } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

type ProductForm = {
  name: string;
  price: number;
  stock: number;
  image: File | null;
};

export default function ProductCreatePage() {
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
      if (!Number.isInteger(num) || num < 1) return; // 자연수만 허용
      setForm({ ...form, [name]: num });
    } else {
      setForm({ ...form, [name]: value });
    }
  };


  const handleSubmit = async () => {
    if (!form.name || !form.price || !form.stock || !form.image) {
      toast.error('모든 값을 입력해주세요.');
      return;
    }

    try {
      setUploading(true);

      // 1. presigned URL 요청 (서버에서 받아와야 함)
      const presignedUrlRes = await fetch('/api/admin/presigned-url', {
        method: 'POST',
        body: JSON.stringify({ fileName: form.image.name }),
        headers: { 'Content-Type': 'application/json' },
      });
      const { url, imageUrl } = await presignedUrlRes.json();

      // 2. 실제 이미지 업로드 (PUT 요청)
      await fetch(url, {
        method: 'PUT',
        body: form.image,
        headers: {
          'Content-Type': form.image.type,
        },
      });

      // 3. 상품 등록 요청
      const productPayload = {
        name: form.name,
        price: form.price,
        stock: form.stock,
        imageUrl,
      };
      await fetch('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify(productPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      toast.success('상품이 등록되었습니다!');
      setForm({ name: '', price: 0, stock: 0, image: null });
    } catch (err) {
      console.error(err);
      toast.error('상품 등록 중 오류가 발생했습니다.');
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
