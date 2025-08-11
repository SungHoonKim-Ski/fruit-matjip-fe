import { safeErrorLog, getSafeErrorMessage } from './environment';

/**
 * 공통 API fetch 유틸리티
 * 403 에러 시 자동으로 /403 페이지로 리다이렉트
 */

interface ApiFetchOptions extends RequestInit {
  redirectOn403?: boolean; // 403 시 리다이렉트 여부 (기본값: true)
}

interface ApiResponse<T = any> {
  data: T;
  status: number;
  ok: boolean;
}

export async function apiFetch<T = any>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<ApiResponse<T>> {
  const { redirectOn403 = true, ...fetchOptions } = options;
  
  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...fetchOptions,
    });

    // 403 에러 처리
    if (response.status === 403 && redirectOn403) {
      window.location.href = '/403';
      throw new Error('접근 권한이 없습니다.');
    }

    // JSON 응답 확인
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      data,
      status: response.status,
      ok: response.ok,
    };
  } catch (error: any) {
    // 네트워크 에러나 기타 에러 처리
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('네트워크 연결을 확인해주세요.');
    }
    throw error;
  }
}

// 편의 함수들
export const apiGet = <T = any>(url: string, options?: ApiFetchOptions) =>
  apiFetch<T>(url, { method: 'GET', ...options });

export const apiPost = <T = any>(url: string, body?: any, options?: ApiFetchOptions) =>
  apiFetch<T>(url, { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    ...options 
  });

export const apiPut = <T = any>(url: string, body?: any, options?: ApiFetchOptions) =>
  apiFetch<T>(url, { 
    method: 'PUT', 
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    ...options 
  });

export const apiDelete = <T = any>(url: string, options?: ApiFetchOptions) =>
  apiFetch<T>(url, { method: 'DELETE', ...options });
