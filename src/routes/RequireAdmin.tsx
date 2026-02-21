import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { adminFetch } from '../utils/api';

const ADMIN_MODE_KEY = 'admin-mode';

export default function RequireAdmin() {
  const [state, setState] = React.useState<'checking' | 'ok' | 'deny'>('checking');
  const location = useLocation();
  const loginUrl = location.pathname.startsWith('/admin/courier') ? '/admin/courier/login' : '/admin/shop/login';

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
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

  // 현재 모드를 localStorage에 저장
  React.useEffect(() => {
    if (state === 'ok') {
      const mode = location.pathname.startsWith('/admin/courier') ? 'courier' : 'shop';
      localStorage.setItem(ADMIN_MODE_KEY, mode);
    }
  }, [state, location.pathname]);

  if (state === 'checking') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">관리자 권한 확인 중…</div>
      </main>
    );
  }

  if (state === 'deny') return <Navigate to={loginUrl} replace />;

  return <Outlet />;
}