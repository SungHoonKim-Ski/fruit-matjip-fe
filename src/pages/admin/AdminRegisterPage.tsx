import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { adminSignup } from '../../utils/api';

export default function AdminRegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { show } = useSnackbar();
  
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 유효성 검사
    if (!name || !email || !password || !confirmPassword) {
      show('모든 필드를 입력해주세요.', { variant: 'error' });
      return;
    }

    // Email length: 5 ~ 15 chars
    if (email.length < 5 || email.length > 15) {
      show('아이디는 5~15자로 입력해주세요.', { variant: 'error' });
      return;
    }

    // Password min 8 chars with letters + numbers
    if (password.length < 8) {
      show('비밀번호는 8자 이상 입력해주세요.', { variant: 'error' });
      return;
    }

    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      show('비밀번호는 영문자와 숫자를 포함해야 합니다.', { variant: 'error' });
      return;
    }

    // Password confirmation
    if (password !== confirmPassword) {
      show('비밀번호가 일치하지 않습니다.', { variant: 'error' });
      return;
    }

    try {
      const res = await adminSignup({ name, email, password });
      if (res.ok) {
        show('회원가입이 완료되었습니다.');
        navigate('/admin/login');
      } else {
        show('회원가입에 실패했습니다.', { variant: 'error' });
      }
    } catch {
      setError('회원가입에 실패했습니다. 다시 시도해주세요.');
    }
  };

  return (
    <main className="w-full px-4 sm:px-6 lg:px-8 max-w-md mx-auto mt-10 bg-white p-6 rounded shadow space-y-4">
      <h1 className="text-xl font-bold text-gray-800">👤 관리자 등록</h1>

      <input
        name="name"
        placeholder="이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="email"
        type="text"
        placeholder="아이디"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="password"
        type="password"
        placeholder="비밀번호 (최소 8자, 영문/숫자 포함)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        className="w-full border px-3 py-2 rounded"
      />
      <input
        name="confirmPassword"
        type="password"
        placeholder="비밀번호 확인"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        className="w-full border px-3 py-2 rounded"
      />

      <button
        type="button"
        onClick={handleRegister}
        className="btn btn-cta btn-primary w-full"
      >
        관리자 등록
      </button>
    </main>
  );
}
