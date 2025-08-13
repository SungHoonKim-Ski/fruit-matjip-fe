import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';

export default function Error403Page() {
  const nav = useNavigate();
  const { show } = useSnackbar();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // 페이지 로드 시 저장된 에러 정보 확인
    const errorMessage = localStorage.getItem('error-message');
    const errorType = localStorage.getItem('error-type');
    const errorRedirect = localStorage.getItem('error-redirect');
    
    if (errorMessage) {
      show(errorMessage, { variant: 'error' });
      // 에러 정보 표시 후 삭제
      localStorage.removeItem('error-message');
      localStorage.removeItem('error-type');
      localStorage.removeItem('error-redirect');
    }
    
    // 리다이렉트 URL 결정
    const redirectUrl = errorRedirect || (errorType === 'admin' ? '/admin/login' : '/login');
    
    const t = setTimeout(() => nav(redirectUrl, { replace: true }), 3000);
    
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
    const errorType = localStorage.getItem('error-type');
    const isAdmin = errorType === 'admin';
    const pageName = isAdmin ? '관리자 로그인' : '로그인';
    
    if (countdown === 0) return `${pageName} 페이지로 이동합니다.`;
    return `${countdown}초 후 ${pageName} 페이지로 이동합니다.`;
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800">접근 권한이 없습니다 (403)</h1>
        <p className="mt-2 text-sm text-gray-500">{getCountdownText()}</p>
        <button
          className="mt-6 h-10 px-4 rounded bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => {
            const errorType = localStorage.getItem('error-type');
            const errorRedirect = localStorage.getItem('error-redirect');
            const redirectUrl = errorRedirect || (errorType === 'admin' ? '/admin/login' : '/login');
            nav(redirectUrl, { replace: true });
          }}
        >
          바로 이동
        </button>
      </div>
    </main>
  );
}


