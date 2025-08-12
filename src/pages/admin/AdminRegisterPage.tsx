import React, { useState } from 'react';
import { useSnackbar } from '../../components/snackbar';

export default function AdminRegisterPage() {
  const { show } = useSnackbar(); 
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    const { name, email, password } = form;
    if (!name || !email || !password) {
      show('모든 필드를 입력해주세요.', { variant: 'error' });
      return;
    }

    try {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 1000));
      show('관리자 계정이 등록되었습니다.');
      setForm({ name: '', email: '', password: '' });
    } catch {
      show('등록 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="w-full px-4 sm:px-6 lg:px-8 max-w-md mx-auto mt-10 bg-white p-6 rounded shadow space-y-4">
      <h1 className="text-xl font-bold text-gray-800">👤 관리자 등록</h1>

      <input
        name="name"
        placeholder="이름"
        value={form.name}
        onChange={handleChange}
        autoComplete="name"
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="email"
        type="email"
        placeholder="아이디"
        value={form.email}
        onChange={handleChange}
        autoComplete="email"
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="password"
        type="password"
        placeholder="비밀번호"
        value={form.password}
        onChange={handleChange}
        autoComplete="new-password"
        className="w-full border px-3 py-2 rounded"
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className={`btn btn-cta ${loading ? 'btn-disabled' : 'btn-primary'} w-full`}
      >
        {loading ? '등록 중...' : '관리자 등록'}
      </button>
    </main>
  );
}
