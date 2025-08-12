import React, { useState } from 'react';
import { useSnackbar } from '../../components/snackbar';

export default function AdminRegisterPage() {
  const { show } = useSnackbar(); 
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    const { name, email, password, confirmPassword } = form;

    // Required
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      show('모든 필드를 입력해주세요.', { variant: 'error' });
      return;
    }

    // Email length: 5 ~ 15 chars
    if (email.length < 5 || email.length > 15) {
      show('아이디(이메일)는 5~15자로 입력해주세요.', { variant: 'error' });
      return;
    }

    // Password rules: min 8, letters+numbers
    const pwMin = 8;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    if (password.length < pwMin || !hasLetter || !hasNumber) {
      show('비밀번호는 최소 8자, 영문과 숫자를 포함해야 합니다.', { variant: 'error' });
      return;
    }

    // Confirm match
    if (password !== confirmPassword) {
      show('비밀번호가 일치하지 않습니다.', { variant: 'error' });
      return;
    }

    try {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 1000));
      show('관리자 계정이 등록되었습니다.');
      setForm({ name: '', email: '', password: '', confirmPassword: '' });
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
        type="text"
        placeholder="아이디"
        value={form.email}
        onChange={handleChange}
        autoComplete="username"
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="password"
        type="password"
        placeholder="비밀번호 (최소 8자, 영문/숫자 포함)"
        value={form.password}
        onChange={handleChange}
        autoComplete="new-password"
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="confirmPassword"
        type="password"
        placeholder="비밀번호 확인"
        value={form.confirmPassword}
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
