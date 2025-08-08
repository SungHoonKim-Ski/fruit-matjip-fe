import React, { useState } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function AdminRegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    const { name, email, password } = form;
    if (!name || !email || !password) {
      toast.error('모든 필드를 입력해주세요.');
      return;
    }

    try {
      setLoading(true);

      // 실제 API 연결 시 이 부분 변경
      await new Promise((resolve) => setTimeout(resolve, 1000));

      toast.success('관리자 계정이 등록되었습니다.');
      setForm({ name: '', email: '', password: '' });
    } catch (err) {
      toast.error('등록 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-md mx-auto mt-10 bg-white p-6 rounded shadow space-y-4">
      <h1 className="text-xl font-bold text-gray-800">👤 관리자 등록</h1>

      <input
        name="name"
        placeholder="이름"
        value={form.name}
        onChange={handleChange}
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="email"
        type="email"
        placeholder="이메일"
        value={form.email}
        onChange={handleChange}
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="password"
        type="password"
        placeholder="비밀번호"
        value={form.password}
        onChange={handleChange}
        className="w-full border px-3 py-2 rounded"
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-orange-500 text-white py-2 rounded hover:bg-orange-600 disabled:bg-gray-300"
      >
        {loading ? '등록 중...' : '관리자 등록'}
      </button>
    </main>
  );
}
