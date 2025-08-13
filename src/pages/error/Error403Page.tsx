import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';

export default function Error403Page() {
  const nav = useNavigate();
  const { show } = useSnackbar();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // 페이지 로드 시 저장된 에러 메시지가 있으면 표시
    const errorMessage = localStorage.getItem('user-error-message');
    if (errorMessage) {
      show(errorMessage, { variant: 'error' });
      localStorage.removeItem('user-error-message'); // 메시지 표시 후 삭제
    }
    
    const t = setTimeout(() => nav('/login', { replace: true }), 3000);
    
    // 카운트다운 업데이트
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [nav, show]);

  const getCountdownText = () => {
    if (countdown === 0) return '로그인 페이지로 이동합니다.';
    return `${countdown}초 후 로그인 페이지로 이동합니다.`;
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800">접근 권한이 없습니다 (403)</h1>
        <p className="mt-2 text-sm text-gray-500">{getCountdownText()}</p>
        <button
          className="mt-6 h-10 px-4 rounded bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => nav('/login', { replace: true })}
        >
          바로 이동
        </button>
      </div>
    </main>
  );
}


