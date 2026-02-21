import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { validateAdminSession } from '../utils/api';
import { safeErrorLog } from '../utils/environment';
import { USE_MOCKS } from '../config';

interface AdminSessionContextType {
  isSessionValid: boolean;
}

const AdminSessionContext = createContext<AdminSessionContextType>({
  isSessionValid: true,
});

export const useAdminSession = () => useContext(AdminSessionContext);

const getAdminLoginUrl = (pathname: string): string => {
  if (pathname.startsWith('/admin/courier')) return '/admin/courier/login';
  return '/admin/shop/login';
};

export const AdminSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSessionValid, setIsSessionValid] = useState(true);
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin/shop') || location.pathname.startsWith('/admin/courier');
  const adminAuthPages = ['/admin/shop/login', '/admin/shop/register', '/admin/courier/login', '/admin/courier/register'];
  const isAdminAuthPage = adminAuthPages.includes(location.pathname);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 이전 인터벌 정리
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isAdminPage || isAdminAuthPage || USE_MOCKS) return; // 관리자 페이지가 아니거나, 로그인/회원가입 페이지이거나, 모의 데이터 사용 시에는 실행하지 않음

    const validateSession = async () => {
      try {
        await validateAdminSession();
        setIsSessionValid(true);
      } catch (e) {
        // 세션 만료 시 로그인 페이지로 리다이렉트
        safeErrorLog(e, 'AdminSessionContext - validateAdminSession');
        setIsSessionValid(false);
        window.location.href = getAdminLoginUrl(location.pathname);
      }
    };

    // 초기 호출
    validateSession();
    
    // 13분(780초) 주기로 호출
    intervalRef.current = setInterval(validateSession, 13 * 60 * 1000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAdminPage, isAdminAuthPage]);

  return (
    <AdminSessionContext.Provider value={{ isSessionValid }}>
      {children}
    </AdminSessionContext.Provider>
  );
};
