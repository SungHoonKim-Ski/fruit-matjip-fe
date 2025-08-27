import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSnackbar } from './snackbar';
import { validateAdminSession } from '../utils/api';

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

export default function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();
  const { show } = useSnackbar();

  useEffect(() => {
    const checkAuth = async () => {
      
      try {
        // localStorage에서 admin 인증 정보 확인
        const adminAuth = localStorage.getItem('admin-auth');

        if (!adminAuth) {
          setIsAuthenticated(false);
          return;
        }


        // 서버에 세션 유효성 검사 요청
        const response = await validateAdminSession();

        // response.ok 대신 상태 코드로 직접 확인
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          
          // 401, 403 에러가 아닌 경우 (서버 에러 등) 일단 통과
          if (response.status !== 401 && response.status !== 403) {
            setIsAuthenticated(true);
            return;
          }
          
          // 401, 403 에러 시에만 인증 정보 삭제
          localStorage.removeItem('admin-auth');
          show('인증이 만료되었습니다. 다시 로그인해주세요.', { variant: 'error' });
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('🔍 ProtectedAdminRoute - Auth check failed:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [show]);

  // 로딩 중일 때
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  // 인증되지 않은 경우 로그인 페이지로 리다이렉트
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // 인증된 경우 자식 컴포넌트 렌더링
  return <>{children}</>;
}
