import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';

type ErrCtx = {
  message?: string | null;
  type: 'admin' | 'user';
  redirectUrl: string;
};

export default function Error401Page() {
  const nav = useNavigate();
  const { show } = useSnackbar();
  const [countdown, setCountdown] = useState(2);
  const [ctx, setCtx] = useState<ErrCtx>({
    type: 'user',
    redirectUrl: '/login',
  });

  useEffect(() => {
    // 1) localStorage에서 ‘한 번만’ 읽고
    const message = localStorage.getItem('error-message');
    const type = (localStorage.getItem('error-type') === 'admin') ? 'admin' : 'user';
    const redirectStored = localStorage.getItem('error-redirect');
    const fallback = type === 'admin' ? '/admin/login' : '/login';
    const redirectUrl = (redirectStored && redirectStored.startsWith('/') && !redirectStored.startsWith('//')) ? redirectStored : fallback;

    setCtx({ message, type, redirectUrl });

    if (message) show(message, { variant: 'error' });

    // 2) 바로 지워도 OK (이후에는 state만 사용)
    localStorage.removeItem('error-message');
    localStorage.removeItem('error-type');
    localStorage.removeItem('error-redirect');

    // 3) 자동 이동
    const t = setTimeout(() => nav(redirectUrl, { replace: true }), 2000);

    // 4) 카운트다운
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [nav, show]);

  const getCountdownText = () => {
    const errorType = localStorage.getItem('error-type');
    const isAdmin = errorType === 'admin';
    const pageName = isAdmin ? '관리자 로그인' : '로그인';
    
    if (countdown === 0) return `${pageName} 페이지로 이동합니다.`;
    return `${countdown}초 후 ${pageName} 페이지로 이동합니다.`;
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800">인증이 만료되었습니다 (401)</h1>
        <p className="mt-2 text-sm text-gray-500">{getCountdownText()}</p>
        <button
          className="mt-6 h-10 px-4 rounded bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => nav(ctx.redirectUrl, { replace: true })} // localStorage 다시 읽지 않음
        >
          바로 이동
        </button>
      </div>
    </main>
  );
}