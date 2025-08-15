import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { adminFetch } from '../utils/api';

export default function RequireAdmin() {
  const [state, setState] = React.useState<'checking' | 'ok' | 'deny'>('checking');

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 인증만 확인하는 경량 엔드포인트 권장: /api/admin/auth-check
        const res = await adminFetch('/api/admin/validate', {}, true);
        if (!alive) return;
        setState(res.ok ? 'ok' : 'deny');
      } catch {
        if (!alive) return;
        setState('deny');
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state === 'checking') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">관리자 권한 확인 중…</div>
      </main>
    );
  }

  // autoRedirect=true 인 경우 401/403이면 이미 /403(→/admin/login)으로 유도됨.
  // 혹시 서버가 리다이렉트 안 했을 때 폴백:
  if (state === 'deny') return <Navigate to="/admin/login" replace />;

  // 통과 시 중첩 라우트 렌더
  return <Outlet />;
}