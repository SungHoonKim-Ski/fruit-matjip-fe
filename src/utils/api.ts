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

// API 유틸리티 함수들
const API_BASE = process.env.REACT_APP_API_BASE || '';

// 개별 API 요청별 retry 카운터 관리
const apiRetryCounts = new Map<string, number>();
const MAX_RETRY_PER_API = 3;

// 토큰 가져오기
const getAccessToken = () => localStorage.getItem('access');

// 개별 API retry 카운터 관리 함수들
export const incrementApiRetryCount = (apiKey: string) => {
  const currentCount = apiRetryCounts.get(apiKey) || 0;
  const newCount = Math.min(currentCount + 1, MAX_RETRY_PER_API);
  apiRetryCounts.set(apiKey, newCount);
  return newCount;
};

export const resetApiRetryCount = (apiKey: string) => {
  apiRetryCounts.delete(apiKey);
};

export const getApiRetryCount = (apiKey: string) => {
  return apiRetryCounts.get(apiKey) || 0;
};

export const canRetryApi = (apiKey: string) => {
  return (apiRetryCounts.get(apiKey) || 0) < MAX_RETRY_PER_API;
};

// JSON 응답 검증
export const validateJsonResponse = async (response: Response) => {
//   const contentType = response.headers.get('content-type') || '';
//   if (!contentType.includes('application/json')) {
//     const text = await response.text();
//     throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
//   }
  return response;
};

// API 에러 메시지를 snackbar로 표시하는 유틸리티 함수
export const showApiErrorMessage = (show: (message: string, options?: any) => void) => {
  const errorMessage = localStorage.getItem('api-error-message');
  const errorType = localStorage.getItem('api-error-type');
  
  if (errorMessage && errorType) {
    show(errorMessage, { variant: errorType as any });
    
    // 표시 후 localStorage에서 제거
    localStorage.removeItem('api-error-message');
    localStorage.removeItem('api-error-type');
  }
};

// API 호출 기본 함수 (토큰 자동 포함)
export const apiFetch = async (url: string, options: RequestInit = {}, autoRedirect: boolean = true) => {
  const token = getAccessToken();
  
  // admin API는 토큰 사용하지 않음
  const isAdminApi = url.includes('/api/admin');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token && !isAdminApi) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: isAdminApi ? 'include' : 'omit', // admin API만 쿠키 사용
  });
  
  // 401 에러 시 refresh token으로 재시도 (User API만)
  if (response.status === 401 && !isAdminApi && !url.includes('/login') && !url.includes('/refresh')) {
    try {
      // refresh API는 Authorization 헤더와 REFRESH_TOKEN 쿠키를 모두 요구
      const refreshHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 기존 access token이 있으면 Authorization 헤더에 포함 (만료되었을 수 있음)
      if (token) {
        refreshHeaders.Authorization = `Bearer ${token}`;

      }
      
      const refreshResponse = await fetch(`${API_BASE}/api/refresh`, {
        method: 'POST',
        headers: refreshHeaders,
        credentials: 'include',
      });
      
      if (refreshResponse.ok) {
        const newAccessToken = await refreshResponse.text();
        localStorage.setItem('access', newAccessToken);
        
        // 새로운 토큰으로 원래 요청 재시도

        const newHeaders = { ...headers, Authorization: `Bearer ${newAccessToken}` };
        
        const retryResponse = await fetch(`${API_BASE}${url}`, {
          ...options,
          headers: newHeaders,
          credentials: 'include',
        });
        
        return retryResponse;
      } else {

        // refresh token도 만료된 경우에만 redirect
        if (autoRedirect) {
          const errorMessage = '인증이 만료되었습니다. 다시 로그인해주세요.';
          localStorage.setItem('error-message', errorMessage);
          localStorage.setItem('error-type', 'user');
          localStorage.setItem('error-redirect', '/login');
          
          // 사용자 토큰 제거
          localStorage.removeItem('access');
          localStorage.removeItem('refresh');
          localStorage.removeItem('nickname');
          
          // 403 에러 페이지로 리다이렉트
          window.location.href = '/403';
        }
        return response;
      }
    } catch (error) {
      console.error('refresh token 처리 중 오류:', error);
      // refresh 처리 중 오류 발생 시에만 redirect
      if (autoRedirect) {
        const errorMessage = '인증 처리 중 오류가 발생했습니다. 다시 로그인해주세요.';
        localStorage.setItem('error-message', errorMessage);
        localStorage.setItem('error-type', 'user');
        localStorage.setItem('error-redirect', '/login');
        
        // 사용자 토큰 제거
        localStorage.removeItem('access');
        localStorage.removeItem('refresh');
        localStorage.removeItem('nickname');
        
        // 403 에러 페이지로 리다이렉트
        window.location.href = '/403';
      }
      return response;
    }
  }
  
  // 403 에러 시 권한 부족 처리 (refresh 시도 후에도 403이거나, refresh 대상이 아닌 403)
  if (autoRedirect && response.status === 403 && !isAdminApi && !url.includes('/login') && !url.includes('/refresh')) {
    const errorMessage = '접근 권한이 없습니다.';
    localStorage.setItem('error-message', errorMessage);
    localStorage.setItem('error-type', 'user');
    localStorage.setItem('error-redirect', '/login');
    
    // 403 에러 페이지로 리다이렉트
    window.location.href = '/403';
    return response;
  }
  
  // 400번대 에러 응답을 서버 메시지로 처리
  if (response.status >= 400 && response.status < 500) {
    try {
      const errorData = await response.clone().json();
      const serverMessage = errorData.message || errorData.error || `요청 처리 중 오류가 발생했습니다. (${response.status})`;
      
      // 에러 메시지를 localStorage에 저장하여 컴포넌트에서 표시할 수 있도록 함
      localStorage.setItem('api-error-message', serverMessage);
      localStorage.setItem('api-error-type', 'error');
    } catch (parseError) {
      // JSON 파싱 실패 시 기본 메시지
      const defaultMessage = `요청 처리 중 오류가 발생했습니다. (${response.status})`;
      localStorage.setItem('api-error-message', defaultMessage);
      localStorage.setItem('api-error-type', 'error');
    }
  }
  
  return response;
};

// Admin API 전용 fetch (쿠키 분리)
export const adminFetch = async (url: string, options: RequestInit = {}, autoRedirect: boolean = false) => {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
    credentials: 'include', // Admin API는 항상 쿠키 사용
  });
  
  // autoRedirect가 true이고 401, 403 에러인 경우에만 리다이렉트
  if (autoRedirect && (response.status === 401 || response.status === 403)) {
    const errorMessage = response.status === 401 
      ? '인증이 만료되었습니다. 다시 로그인해주세요.' 
      : '접근 권한이 없습니다.';
    
    // 에러 정보를 localStorage에 저장
    localStorage.setItem('error-message', errorMessage);
    localStorage.setItem('error-type', 'admin');
    localStorage.setItem('error-redirect', '/admin/login');
    
    // 인증 정보 제거
    localStorage.removeItem('admin-auth');
    
    // 403 에러 페이지로 리다이렉트
    window.location.href = '/403';
    return response;
  }
  
  // 400번대 에러 응답을 서버 메시지로 처리
  if (response.status >= 400 && response.status < 500) {
    try {
      const errorData = await response.clone().json();
      const serverMessage = errorData.message || errorData.error || `요청 처리 중 오류가 발생했습니다. (${response.status})`;
      
      // 에러 메시지를 localStorage에 저장하여 컴포넌트에서 표시할 수 있도록 함
      localStorage.setItem('api-error-message', serverMessage);
      localStorage.setItem('api-error-type', 'error');
    } catch (parseError) {
      // JSON 파싱 실패 시 기본 메시지
      const defaultMessage = `요청 처리 중 오류가 발생했습니다. (${response.status})`;
      localStorage.setItem('api-error-message', defaultMessage);
      localStorage.setItem('api-error-type', 'error');
    }
  }
  
  return response;
};

// User API 전용 fetch (토큰 + 쿠키 분리)
export const userFetch = async (url: string, options: RequestInit = {}, autoRedirect: boolean = true) => {
  const token = getAccessToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: 'include', // User API도 쿠키 사용 (refresh token용)
  });
  
                // 401 또는 403 에러 시 refresh token으로 재시도
              if ((response.status === 401 || response.status === 403) && !url.includes('/login') && !url.includes('/refresh')) {
    
    try {
      // refresh token은 쿠키에 있으므로 credentials: 'include'로 자동 전송
      
      // refresh API는 Authorization 헤더와 REFRESH_TOKEN 쿠키를 모두 요구
      const refreshHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 기존 access token이 있으면 Authorization 헤더에 포함 (만료되었을 수 있음)
      if (token) {
        refreshHeaders.Authorization = `Bearer ${token}`;

      }
      
      const refreshResponse = await fetch(`${API_BASE}/api/refresh`, {
        method: 'POST',
        headers: refreshHeaders,
        credentials: 'include',
      });
      
      if (refreshResponse.ok) {
        const newAccessToken = await refreshResponse.text();
        localStorage.setItem('access', newAccessToken);
        
        // 새로운 토큰으로 원래 요청 재시도

        const newHeaders = { ...headers, Authorization: `Bearer ${newAccessToken}` };
        
        const retryResponse = await fetch(`${API_BASE}${url}`, {
          ...options,
          headers: newHeaders,
          credentials: 'include',
        });
        
        return retryResponse;
      } else {

        // refresh token도 만료된 경우
        if (autoRedirect) {
          const errorMessage = '인증이 만료되었습니다. 다시 로그인해주세요.';
          localStorage.setItem('error-message', errorMessage);
          localStorage.setItem('error-type', 'user');
          localStorage.setItem('error-redirect', '/login');
          
          // 사용자 토큰 제거
          localStorage.removeItem('access');
          localStorage.removeItem('refresh');
          localStorage.removeItem('nickname');
          
          // 403 에러 페이지로 리다이렉트
          window.location.href = '/403';
        }
        return response;
      }
    } catch (error) {
      console.error('refresh token 처리 중 오류:', error);
      // refresh 처리 중 오류 발생 시
      if (autoRedirect) {
        const errorMessage = '인증 처리 중 오류가 발생했습니다. 다시 로그인해주세요.';
        localStorage.setItem('error-message', errorMessage);
        localStorage.setItem('error-type', 'user');
        localStorage.setItem('error-redirect', '/login');
        
        // 사용자 토큰 제거
        localStorage.removeItem('access');
        localStorage.removeItem('refresh');
        localStorage.removeItem('nickname');
        
        // 403 에러 페이지로 리다이렉트
        window.location.href = '/403';
      }
      return response;
    }
  }
  
  // 403 에러 시 권한 부족 처리
  if (autoRedirect && response.status === 403 && !url.includes('/login')) {
    const errorMessage = '접근 권한이 없습니다.';
    localStorage.setItem('error-message', errorMessage);
    localStorage.setItem('error-type', 'user');
    localStorage.setItem('error-redirect', '/login');
    
    // 403 에러 페이지로 리다이렉트
    window.location.href = '/403';
    return response;
  }
  
  // 400번대 에러 응답을 서버 메시지로 처리
  if (response.status >= 400 && response.status < 500) {
    try {
      const errorData = await response.clone().json();
      const serverMessage = errorData.message || errorData.error || `요청 처리 중 오류가 발생했습니다. (${response.status})`;
      
      // 에러 메시지를 localStorage에 저장하여 컴포넌트에서 표시할 수 있도록 함
      localStorage.setItem('api-error-message', serverMessage);
      localStorage.setItem('api-error-type', 'error');
    } catch (parseError) {
      // JSON 파싱 실패 시 기본 메시지
      const defaultMessage = `요청 처리 중 오류가 발생했습니다. (${response.status})`;
      localStorage.setItem('api-error-message', defaultMessage);
      localStorage.setItem('api-error-type', 'error');
    }
  }
  
  return response;
};

// 토큰 갱신
export const refreshToken = async () => {
  try {
    const refresh = localStorage.getItem('refresh');
    const accessToken = getAccessToken();
    if (!refresh) throw new Error('Refresh token not found');
    
    // refresh API는 Authorization 헤더와 REFRESH_TOKEN 쿠키를 모두 요구
    const refreshHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // 기존 access token이 있으면 Authorization 헤더에 포함 (만료되었을 수 있음)
    if (accessToken) {
      refreshHeaders.Authorization = `Bearer ${accessToken}`;
    }
    
    const response = await fetch(`${API_BASE}/api/refresh`, {
      method: 'POST',
      headers: refreshHeaders,
      credentials: 'include',
    });
    
    if (response.ok) {
      const newToken = await response.text();
      localStorage.setItem('access', newToken);
      return newToken;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
    // 토큰 갱신 실패 시 로그아웃 처리
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('nickname');
    window.location.href = '/login';
  }
  
  throw new Error('Token refresh failed');
};

// API 응답 처리 (토큰 만료 시 자동 갱신)
export const handleApiResponse = async (response: Response) => {
  if (response.status === 401) {
    // 토큰 만료 시 갱신 시도
    try {
      await refreshToken();
      // 갱신된 토큰으로 재요청은 여기서 구현하지 않음 (상위에서 처리)
    } catch {
      throw new Error('Authentication failed');
    }
  }
  
  return response;
};

// 편의 함수들 (자동 JSON 검증 포함)
export const getProducts = async (from?: string, to?: string) => {
  try {
    let url = '/api/auth/products';
    
    if (from && to) {
      // URL 인코딩 적용
      const encodedFrom = encodeURIComponent(from);
      const encodedTo = encodeURIComponent(to);
      url += `?from=${encodedFrom}&to=${encodedTo}`;
    }
    const res = await userFetch(url);
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('getProducts');
    throw error;
  }
};

export const getProduct = async (id: number) => {
  try {
    const res = await userFetch(`/api/auth/products/${id}`);
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('getProduct');
    throw error;
  }
};

export const createReservation = async (data: any) => {
  try {
    const res = await userFetch('/api/auth/reservations/', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    });
    
    // 성공 시 retry 카운터 리셋
    if (res.ok) {
      resetApiRetryCount('createReservation');
    }
    
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('createReservation');
    throw error;
  }
};

export const cancelReservation = async (id: number) => {
  const res = await userFetch(`/api/auth/reservations/cancel/${id}`, { 
    method: 'PATCH' 
  });
  return validateJsonResponse(res);
};

export const getReservations = async (from?: string, to?: string) => {
  try {
    let url = '/api/auth/reservations/';
    
    if (from && to) {
      // URL 인코딩 적용
      const encodedFrom = encodeURIComponent(from);
      const encodedTo = encodeURIComponent(to);
      url += `?from=${encodedFrom}&to=${encodedTo}`;
    }
    
    const res = await userFetch(url);
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('getReservations');
    throw error;
  }
};

export const modifyName = async (name: string) => {
  try {
    const res = await userFetch(`/api/auth/name/${name}`, { 
      method: 'PATCH' 
    });
    
    // 성공 시 retry 카운터 리셋
    if (res.ok) {
      resetApiRetryCount('modifyName');
    }
    
    return res; // Response 객체 직접 반환 (JSON 검증 제거)
  } catch (error) {
    incrementApiRetryCount('modifyName');
    throw error;
  }
};

export const checkNameExists = async (name: string) => {
  try {
    const res = await userFetch(`/api/auth/name/${name}`);
    
    // 성공 시 retry 카운터 리셋
    if (res.ok) {
      resetApiRetryCount('checkNameExists');
    }
    
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('checkNameExists');
    throw error;
  }
};

// Admin API (쿠키 기반 인증, User API와 분리)
export const adminLogin = async (data: { email: string; password: string }) => {
  const res = await adminFetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res; // Response 객체 직접 반환
};

export const adminSignup = async (data: { name: string; email: string; password: string }) => {
  console.log('🔐 AdminSignup - 요청 데이터:', data);
  console.log('🔐 AdminSignup - 요청 URL:', '/api/admin/signup');
  
  const res = await adminFetch('/api/admin/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  console.log('🔐 AdminSignup - 응답 상태:', res.status, res.statusText);
  console.log('🔐 AdminSignup - 응답 헤더:', Object.fromEntries(res.headers.entries()));
  
  return validateJsonResponse(res);
};

export const getAdminProducts = async (from?: string, to?: string) => {
  try {
    let url = '/api/admin/products';
    
    
    if (from && to) {
      // URL 인코딩 적용
      const encodedFrom = encodeURIComponent(from);
      const encodedTo = encodeURIComponent(to);
      url += `?from=${encodedFrom}&to=${encodedTo}`;
    }   
    const res = await adminFetch(url);
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('getAdminProducts');
    throw error;
  }
};

export const getAdminReservations = async (from?: string, to?: string) => {
  try {
    let url = '/api/admin/reservations';
    
    if (from && to) {
      // URL 인코딩 적용
      const encodedFrom = encodeURIComponent(from);
      const encodedTo = encodeURIComponent(to);
      url += `?from=${encodedFrom}&to=${encodedTo}`;
    }
    
    const res = await adminFetch(url);
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('getAdminReservations');
    throw error;
  }
};

export const getAdminProduct = async (id: number) => {
  try {
    const res = await adminFetch(`/api/admin/products/${id}`);
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('getAdminProduct');
    throw error;
  }
};

export const createAdminProduct = async (data: any) => {
  try {
    const res = await adminFetch('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('createAdminProduct');
    throw error;
  }
};

export const updateAdminProduct = async (id: number, data: any) => {
  try {
    const res = await adminFetch(`/api/admin/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('updateAdminProduct');
    throw error;
  }
};

export const setSoldOut = async (id: number) => {
  try {
    const res = await adminFetch(`/api/admin/products/sold-out/${id}`, {
      method: 'PATCH',
    });
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('setSoldOut');
    throw error;
  }
};

export const toggleVisible = async (id: number, visible: boolean) => {
  try {
    const res = await adminFetch(`/api/admin/products/visible/${id}?visible=${visible}`, {
      method: 'PATCH',
    });
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('toggleVisible');
    throw error;
  }
};

export const deleteAdminProduct = async (id: number) => {
  try {
    const res = await adminFetch(`/api/admin/products/${id}`, {
      method: 'DELETE',
    });
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('deleteAdminProduct');
    throw error;
  }
};

export const togglePicked = async (id: number, picked: boolean) => {
  try {
    const res = await adminFetch(`/api/admin/reservations/${id}?picked=${picked}`, {
      method: 'POST',
    });
    return validateJsonResponse(res);
  } catch (error) {
    incrementApiRetryCount('togglePicked');
    throw error;
  }
};

export const getReservationReports = async () => {
  const res = await adminFetch('/api/admin/reservations/reports');
  return validateJsonResponse(res);
};

export const getUploadUrl = async (filename: string, contentType: string): Promise<Response> => {
  // contentType 검증 및 정리
  if (!contentType || typeof contentType !== 'string') {
    throw new Error(`Invalid contentType: ${contentType}`);
  }
  
  const cleanContentType = contentType.trim();
  
  if (!cleanContentType) {
    throw new Error('contentType cannot be empty after trimming');
  }
  
  const requestBody = {
    file_name: filename,
    content_type: cleanContentType
  };
  
  const res = await adminFetch('/api/admin/products/presigned-url', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
  
  console.log('🔐 getUploadUrl - 응답 상태:', res.status, res.statusText);
  console.log('🔐 getUploadUrl - 응답 헤더:', Object.fromEntries(res.headers.entries()));
  
  // 403 에러 시 더 자세한 정보 로깅
  if (res.status === 403) {
    try {
      const errorData = await res.clone().json();
      console.error('🔐 getUploadUrl - 403 에러 상세:', errorData);
    } catch (e) {
      console.error('🔐 getUploadUrl - 403 에러 (JSON 파싱 실패)');
    }
  }
  
  return res; // Response 객체 직접 반환
};

export const getUpdateUrl = async (id: number, filename: string, contentType: string): Promise<Response> => {
  const requestBody = {
    file_name: filename,
    content_type: contentType
  };
  
  const res = await adminFetch(`/api/admin/products/${id}/presigned-url`, {
    method: 'PATCH',
    body: JSON.stringify(requestBody),
  });
  return validateJsonResponse(res);
};

export const getDetailUpdateUrl = async (id: number, filenames: string[], contentType: string): Promise<Response> => {
  const requestBody = {
    product_id: id,
    file_names: filenames,
    content_type: contentType
  };
  
  const res = await adminFetch(`/api/admin/products/${id}/detail/presigned-url`, {
    method: 'PATCH',
    body: JSON.stringify(requestBody),
  });
  return validateJsonResponse(res);
};

export const getHealth = async () => {
  const res = await fetch(`${API_BASE}/api/health`);
  return validateJsonResponse(res);
};
