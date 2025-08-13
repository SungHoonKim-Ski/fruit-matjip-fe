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

// 토큰 가져오기
const getAccessToken = () => localStorage.getItem('access');

// JSON 응답 검증
export const validateJsonResponse = async (response: Response) => {
//   const contentType = response.headers.get('content-type') || '';
//   if (!contentType.includes('application/json')) {
//     const text = await response.text();
//     throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
//   }
  return response;
};

// API 호출 기본 함수 (토큰 자동 포함)
export const apiFetch = async (url: string, options: RequestInit = {}) => {
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
  
  return response;
};

// Admin API 전용 fetch (쿠키 분리)
export const adminFetch = async (url: string, options: RequestInit = {}) => {
  console.log('🔍 adminFetch request:', {
    url: `${API_BASE}${url}`,
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
    body: options.body,
    bodyType: typeof options.body,
    bodyLength: options.body ? String(options.body).length : 0
  });
  
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    },
    credentials: 'include', // Admin API는 항상 쿠키 사용
  });
  
  // 401, 403 에러 시 /admin/login으로 리다이렉트
  if (response.status === 401 || response.status === 403) {
    console.log(`🔍 Admin API ${response.status} error, redirecting to /admin/login`);
    localStorage.removeItem('admin-auth');
    localStorage.removeItem('admin-userid');
    window.location.href = '/admin/login';
    return response; // 리다이렉트 후에도 response 반환 (상위에서 처리할 수 있도록)
  }
  
  return response;
};

// User API 전용 fetch (토큰 + 쿠키 분리)
export const userFetch = async (url: string, options: RequestInit = {}) => {
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
  
  return response;
};

// 토큰 갱신
export const refreshToken = async () => {
  try {
    const refresh = localStorage.getItem('refresh');
    if (!refresh) throw new Error('Refresh token not found');
    
    const response = await fetch(`${API_BASE}/api/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
export const getProducts = async () => {
  const res = await userFetch('/api/auth/products');
  return validateJsonResponse(res);
};

export const getProduct = async (id: number) => {
  const res = await userFetch(`/api/auth/products/${id}`);
  return validateJsonResponse(res);
};

export const createReservation = async (data: any) => {
  const res = await userFetch('/api/auth/reservations/', { 
    method: 'POST', 
    body: JSON.stringify(data) 
  });
  return validateJsonResponse(res);
};

export const cancelReservation = async (id: number) => {
  const res = await userFetch(`/api/auth/reservations/cancel/${id}`, { 
    method: 'PATCH' 
  });
  return validateJsonResponse(res);
};

export const getReservations = async () => {
  const res = await userFetch('/api/auth/reservations/');
  return validateJsonResponse(res);
};

export const modifyName = async (name: string) => {
  const res = await userFetch(`/api/auth/name/${name}`, { 
    method: 'PATCH' 
  });
  return validateJsonResponse(res);
};

export const checkNameExists = async (name: string) => {
  const res = await userFetch(`/api/auth/name/${name}`);
  return validateJsonResponse(res);
};

// Admin API (쿠키 기반 인증, User API와 분리)
export const adminLogin = async (data: { email: string; password: string }) => {
  const res = await adminFetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res; // Response 객체 직접 반환
};

export const adminSignup = async () => {
  const res = await adminFetch('/api/admin/sighup', {
    method: 'POST',
  });
  return validateJsonResponse(res);
};

export const getAdminProducts = async () => {
  const res = await adminFetch('/api/admin/products');
  return validateJsonResponse(res);
};

export const getAdminProduct = async (id: number) => {
  const res = await adminFetch(`/api/admin/products/${id}`);
  return validateJsonResponse(res);
};

export const createAdminProduct = async (data: any) => {
  const res = await adminFetch('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return validateJsonResponse(res);
};

export const updateAdminProduct = async (id: number, data: any) => {
  const res = await adminFetch(`/api/admin/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return validateJsonResponse(res);
};

export const setSoldOut = async (id: number) => {
  const res = await adminFetch(`/api/admin/products/sold-out/${id}`, {
    method: 'PATCH',
  });
  return validateJsonResponse(res);
};

export const toggleVisible = async (id: number, visible: boolean) => {
  const res = await adminFetch(`/api/admin/products/visible/${id}?visible=${visible}`, {
    method: 'PATCH',
  });
  return validateJsonResponse(res);
};

export const deleteAdminProduct = async (id: number) => {
  const res = await adminFetch(`/api/admin/products/${id}`, {
    method: 'DELETE',
  });
  return validateJsonResponse(res);
};

export const togglePicked = async (id: number, picked: boolean) => {
  const res = await adminFetch(`/api/admin/reservations/${id}?picked=${picked}`, {
    method: 'POST',
  });
  return validateJsonResponse(res);
};

export const getReservationReports = async () => {
  const res = await adminFetch('/api/admin/reservations/reports');
  return validateJsonResponse(res);
};

export const getUploadUrl = async (adminId: number, filename: string, contentType: string): Promise<Response> => {
  // adminId 검증
  if (!adminId || typeof adminId !== 'number' || isNaN(adminId)) {
    throw new Error(`Invalid adminId: ${adminId}`);
  }
  
  // contentType 검증 및 정리
  if (!contentType || typeof contentType !== 'string') {
    throw new Error(`Invalid contentType: ${contentType}`);
  }
  
  const cleanContentType = contentType.trim();
  
  if (!cleanContentType) {
    throw new Error('contentType cannot be empty after trimming');
  }
  
  const requestBody = {
    admin_id: adminId,
    file_name: filename,
    content_type: cleanContentType
  };
  
  const res = await adminFetch('/api/admin/products/presigned-url', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
  return res; // Response 객체 직접 반환
};

export const getUpdateUrl = async (id: number, adminId: number, filename: string, contentType: string): Promise<Response> => {
  const requestBody = {
    admin_id: adminId,
    file_name: filename,
    content_type: contentType
  };
  
  const res = await adminFetch(`/api/admin/products/${id}/presigned-url`, {
    method: 'PATCH',
    body: JSON.stringify(requestBody),
  });
  return validateJsonResponse(res);
};

export const getDetailUpdateUrl = async (id: number, adminId: number, filenames: string[], contentType: string): Promise<Response> => {
  const requestBody = {
    admin_id: adminId,
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
