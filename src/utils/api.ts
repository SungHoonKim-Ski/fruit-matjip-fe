import { safeErrorLog, getSafeErrorMessage } from './environment';

/**
 * 공통 API fetch 유틸리티
 * - User API: Bearer AccessToken + Refresh 쿠키
 * - Admin API: 세션 쿠키(ADMINSESSIONID 등)
 * - 401/403 처리 및 비즈니스 에러 메시지 전파
 * - API별 Retry 카운트(최대 3회) + (관리자/유저 모두 적용)
 */

interface ApiFetchOptions extends RequestInit {
  redirectOn403?: boolean; // 403 시 리다이렉트 여부 (기본값: true)
}

interface ApiResponse<T = any> {
  data: T;
  status: number;
  ok: boolean;
}

// === 공통 상수 ===
const API_BASE = process.env.REACT_APP_API_BASE || '';
const MAX_RETRY_PER_API = 3;
const BASE_BACKOFF_MS = 300;

// === 공통 Retry 상태 (API 키별 관리) ===
const apiRetryCounts = new Map<string, number>();
const makeApiKey = (scope: 'ADMIN'|'USER'|'GEN', method: string, url: string) => `${scope}:${method.toUpperCase()}:${url}`;

export const getApiRetryCount = (apiKey: string) => apiRetryCounts.get(apiKey) || 0;
export const canRetryApi = (apiKey: string) => (apiRetryCounts.get(apiKey) || 0) < MAX_RETRY_PER_API;
export const resetApiRetryCount = (apiKey: string) => { apiRetryCounts.delete(apiKey); };
export const incrementApiRetryCount = (apiKey: string) => {
  const current = apiRetryCounts.get(apiKey) || 0;
  const next = Math.min(current + 1, MAX_RETRY_PER_API);
  apiRetryCounts.set(apiKey, next);
  return next;
};

// === 공통 유틸 ===
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isIdempotent = (method = 'GET') => ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
const shouldRetry = (method: string, errorOrResponse: unknown): boolean => {
  // 네트워크 오류(TypeError) → 항상 재시도 허용
  if (errorOrResponse instanceof TypeError) return true;
  // Response 기반 판정
  const res = errorOrResponse as Response;
  if (!res || typeof res.status !== 'number') return false;
  // 5xx는 idempotent 메서드에서만 재시도
  if (res.status >= 500 && res.status <= 599) return isIdempotent(method);
  return false;
};

// === 토큰 유틸 ===
const getAccessToken = () => localStorage.getItem('access');

// === 공통 에러 메시지 저장 ===
const pushUiError = (message: string, type: 'error'|'admin'|'user' = 'error') => {
  // 구 UI/신 UI 동시 호환
  localStorage.setItem('api-error-message', message);
  localStorage.setItem('api-error-type', 'error');
  localStorage.setItem('error-message', message);
  localStorage.setItem('error-type', type);
  window.dispatchEvent(new CustomEvent('api-error'));
};

// === JSON 응답 검증(필요 시 확장) ===
export const validateJsonResponse = async (response: Response) => {
  return response;
};

// === 스낵바 표시 유틸 ===
export const showApiErrorMessage = (show: (message: string, options?: any) => void) => {
  const msg = localStorage.getItem('api-error-message') || localStorage.getItem('error-message');
  const type = (localStorage.getItem('api-error-type') || localStorage.getItem('error-type')) as any;
  if (msg && type) {
    show(msg, { variant: type });
    localStorage.removeItem('api-error-message');
    localStorage.removeItem('api-error-type');
    localStorage.removeItem('error-message');
    localStorage.removeItem('error-type');
  }
};

// === 에러 페이지 연동 유틸 ===
type ErrorScope = 'admin' | 'user';
const setAuthErrorAndRedirect = (status: number, scope: ErrorScope, message: string) => {
  localStorage.setItem('error-message', message);
  localStorage.setItem('error-type', scope);
  localStorage.setItem('error-redirect', scope === 'admin' ? '/admin/login' : '/login');
  window.location.href = status === 401 ? '/401' : '/403';
};


// === 공통 API Fetch (토큰 자동 포함) ===
export const apiFetch = async (url: string, options: RequestInit = {}, autoRedirect = true) => {
  const token = getAccessToken();
  const isAdminApi = url.includes('/api/admin'); // admin은 쿠키 세션 사용

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token && !isAdminApi) headers.Authorization = `Bearer ${token}`;

  const method = (options.method || 'GET').toString().toUpperCase();
  const apiKey = makeApiKey(isAdminApi ? 'ADMIN' : 'USER', method, url);

  let attempt = 0;
  while (attempt <= MAX_RETRY_PER_API) {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers,
        credentials: isAdminApi ? 'include' : 'omit',
      });

      // === User API 전용: 401 → refresh 시도 ===
      if (!isAdminApi && response.status === 401 && !url.includes('/login') && !url.includes('/refresh')) {
        try {
          const refreshHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) refreshHeaders.Authorization = `Bearer ${token}`;

          const refreshResponse = await fetch(`${API_BASE}/api/refresh`, {
            method: 'POST', headers: refreshHeaders, credentials: 'include',
          });
          if (refreshResponse.ok) {
            const newAccessToken = await refreshResponse.text();
            localStorage.setItem('access', newAccessToken);
            const newHeaders = { ...headers, Authorization: `Bearer ${newAccessToken}` };
            return await fetch(`${API_BASE}${url}`, { ...options, headers: newHeaders, credentials: 'include' });
          }
          if (autoRedirect) {
            const msg = '인증이 만료되었습니다. 다시 로그인해주세요.';
            pushUiError(msg, 'user');
            localStorage.removeItem('access');
            localStorage.removeItem('refresh');
            localStorage.removeItem('nickname');
            setAuthErrorAndRedirect(401, 'user', msg);
          }
          return response;
        } catch (e) {
          safeErrorLog(e);
          if (autoRedirect) {
            const msg = '인증이 만료되었습니다. 다시 로그인해주세요.';
            pushUiError(msg, 'user');
            localStorage.removeItem('access');
            localStorage.removeItem('refresh');
            localStorage.removeItem('nickname');
            setAuthErrorAndRedirect(401, 'user', msg);
          }
          return response;
        }
      }

      // === 403 처리(User) ===
      if (autoRedirect && response.status === 403 && !url.includes('/login')) {
        const msg = '접근 권한이 없습니다.';
        pushUiError(msg, 'user');
        setAuthErrorAndRedirect(403, 'user', msg);
        return response;
      }

      // === 4xx(401,403 제외) 비즈니스 에러 메시지 전파 ===
      if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) {
        try {
          const err = await response.clone().json();
          const serverMessage = err.message || err.error || `요청 처리 중 오류가 발생했습니다. (${response.status})`;
          pushUiError(serverMessage);
        } catch {
          pushUiError(`요청 처리 중 오류가 발생했습니다. (${response.status})`);
        }
      }

      // 성공 또는 재시도 불필요한 응답
      resetApiRetryCount(apiKey);
      return response;
    } catch (err) {
      attempt = incrementApiRetryCount(apiKey);
      const isNetwork = err instanceof TypeError;
      const allowRetry = isNetwork;

      if (!canRetryApi(apiKey) || !allowRetry) {
        resetApiRetryCount(apiKey);
        throw err;
      }
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 100;
      await delay(backoff);
    }
  }
  throw new Error('예기치 못한 오류가 발생했습니다.');
};

// === Admin API 전용(fetch + 쿠키, Retry 포함) ===
export const adminFetch = async (url: string, options: RequestInit = {}, autoRedirect = false): Promise<Response> => {
  const method = (options.method || 'GET').toString().toUpperCase();
  const apiKey = makeApiKey('ADMIN', method, url);

  let attempt = 0;
  while (attempt <= MAX_RETRY_PER_API) {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers as Record<string, string> | undefined),
        },
        credentials: 'include',
      });

      // Admin: 401/403 처리
      if (autoRedirect && (response.status === 401 || response.status === 403)) {
        const msg = response.status === 401 ? '인증이 만료되었습니다. 다시 로그인해주세요.' : '접근 권한이 없습니다.';
        pushUiError(msg, 'admin');
        localStorage.removeItem('admin-auth');
        setAuthErrorAndRedirect(response.status, 'admin', msg);
        return response;
      }

      // Admin: 4xx(401,403 제외) 비즈니스 에러 메시지 전파
      if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) {
        try {
          const err = await response.clone().json();
          const serverMessage = err.message || err.error || `요청 처리 중 오류가 발생했습니다. (${response.status})`;
          pushUiError(serverMessage, 'admin');
        } catch {
          pushUiError(`요청 처리 중 오류가 발생했습니다. (${response.status})`, 'admin');
        }
      }

      resetApiRetryCount(apiKey);
      return response;
    } catch (err) {
      attempt = incrementApiRetryCount(apiKey);
      // Admin: 비멱등 메서드는 네트워크 오류에만 재시도, 멱등 메서드는 5xx/네트워크 오류 재시도
      if (!canRetryApi(apiKey) || !shouldRetry(method, err)) {
        resetApiRetryCount(apiKey);
        throw err;
      }
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 100;
      await delay(backoff);
    }
  }
  throw new Error('예기치 못한 오류가 발생했습니다.');
};

// === User API 전용(fetch + 토큰 + 쿠키, Retry 포함) ===
export const userFetch = async (url: string, options: RequestInit = {}, autoRedirect = true) => {
  const token = getAccessToken();
  const method = (options.method || 'GET').toString().toUpperCase();
  const apiKey = makeApiKey('USER', method, url);

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) baseHeaders.Authorization = `Bearer ${token}`;

  let attempt = 0;
  while (attempt <= MAX_RETRY_PER_API) {
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: baseHeaders,
        credentials: 'include', // refresh용 쿠키
      });

      // 401/403 → refresh 시도 (login/refresh 자체 제외)
      if ((response.status === 401 || response.status === 403) && !url.includes('/login') && !url.includes('/refresh')) {
        try {
          const refreshHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) refreshHeaders.Authorization = `Bearer ${token}`;
          const refreshResponse = await fetch(`${API_BASE}/api/refresh`, {
            method: 'POST', headers: refreshHeaders, credentials: 'include',
          });
          if (refreshResponse.ok) {
            const newAccessToken = await refreshResponse.text();
            localStorage.setItem('access', newAccessToken);
            const newHeaders = { ...baseHeaders, Authorization: `Bearer ${newAccessToken}` };
            return await fetch(`${API_BASE}${url}`, { ...options, headers: newHeaders, credentials: 'include' });
          } else if (autoRedirect) {
            const msg = '인증이 만료되었습니다. 다시 로그인해주세요.';
            pushUiError(msg, 'user');
            localStorage.removeItem('access');
            localStorage.removeItem('refresh');
            localStorage.removeItem('nickname');
            setAuthErrorAndRedirect(401, 'user', msg);
          }
          return response;
        } catch (e) {
          safeErrorLog(e);
          if (autoRedirect) {
            const msg = '인증이 만료되었습니다. 다시 로그인해주세요.';
            pushUiError(msg, 'user');
            localStorage.removeItem('access');
            localStorage.removeItem('refresh');
            localStorage.removeItem('nickname');
            setAuthErrorAndRedirect(401, 'user', msg);
          }
          return response;
        }
      }

      // 403 처리
      if (autoRedirect && response.status === 403 && !url.includes('/login')) {
        const msg = '접근 권한이 없습니다.';
        pushUiError(msg, 'user');
        setAuthErrorAndRedirect(403, 'user', msg);
        return response;
      }

      // 4xx(401,403 제외) 비즈니스 에러 메시지 전파
      if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) {
        try {
          const err = await response.clone().json();
          const serverMessage = err.message || err.error || `요청 처리 중 오류가 발생했습니다. (${response.status})`;
          pushUiError(serverMessage);
        } catch {
          pushUiError(`요청 처리 중 오류가 발생했습니다. (${response.status})`);
        }
      }

      resetApiRetryCount(apiKey);
      return response;
    } catch (err) {
      attempt = incrementApiRetryCount(apiKey);
      if (!canRetryApi(apiKey) || !shouldRetry(method, err)) {
        resetApiRetryCount(apiKey);
        throw err;
      }
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1) + Math.random() * 100;
      await delay(backoff);
    }
  }
  throw new Error('예기치 못한 오류가 발생했습니다.');
};

// === 토큰 갱신(직접 호출용) ===
export const refreshToken = async () => {
  try {
    const refresh = localStorage.getItem('refresh');
    const accessToken = getAccessToken();
    if (!refresh) throw new Error('Refresh token not found');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const response = await fetch(`${API_BASE}/api/refresh`, {
      method: 'POST', headers, credentials: 'include',
    });
    if (response.ok) {
      const newToken = await response.text();
      localStorage.setItem('access', newToken);
      return newToken;
    }
  } catch (error) {
    safeErrorLog(error);
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('nickname');
    window.location.href = '/login';
  }
  throw new Error('Token refresh failed');
};

// === 공통 응답 처리(옵셔널) ===
export const handleApiResponse = async (response: Response) => {
  if (response.status === 401) {
    try { await refreshToken(); } catch { throw new Error('Authentication failed'); }
  }
  return response;
};

// === 편의 함수들 ===
export const getProducts = async (from?: string, to?: string) => {
  const key = 'getProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    let url = '/api/auth/products';
    if (from && to) url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await userFetch(url);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getProduct = async (id: number) => {
  const key = 'getProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/auth/products/${id}`);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const createReservation = async (data: any) => {
  const key = 'createReservation';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch('/api/auth/reservations/', { method: 'POST', body: JSON.stringify(data) });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const cancelReservation = async (id: number) => {
  const key = 'cancelReservation';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/auth/reservations/cancel/${id}`, { method: 'PATCH' });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const selfPickReservation = async (id: number) => {
  const key = 'selfPickReservation';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/auth/reservations/self-pick/${id}`, { method: 'PATCH' });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const minusQuantity = async (id: number, quantity: number) => {
  const key = 'minusQuantity';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/auth/reservations/${id}/quantity?minus=${quantity}`, { method: 'PATCH' });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const checkCanSelfPick = async (): Promise<boolean> => {
  const res = await userFetch('/api/auth/reservation/self-pick');
  if (!res.ok) {
    throw new Error('셀프 수령 가능 여부 확인에 실패했습니다.');
  }
  return res.json();
};

export const getUserMessage = async () => {
  const res = await userFetch('/api/auth/message');
  if (res.status === 204 || !res.ok) {
    return null; // 메시지가 없거나 에러인 경우 null 반환
  }
  return res.json();
};

export const markMessageAsRead = async (messageId: number) => {
  const key = 'markMessageAsRead';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/auth/message/${messageId}`, { method: 'PATCH' });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getReservations = async (from?: string, to?: string) => {
  const key = 'getReservations';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    let url = '/api/auth/reservations/';
    if (from && to) url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await userFetch(url);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const modifyName = async (name: string) => {
  const key = 'modifyName';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/auth/name/${name}`, { method: 'PATCH' });
    if (res.ok) resetApiRetryCount(key);
    return res; // text 응답 등 유연 처리
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const checkNameExists = async (name: string) => {
  const key = 'checkNameExists';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/auth/name/${name}`);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// === Admin 편의 함수들 ===
export const adminLogin = async (data: { email: string; password: string }) => {
  const key = 'adminLogin';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/login', { method: 'POST', body: JSON.stringify(data) });
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const adminSignup = async (data: { name: string; email: string; password: string }) => {
  const key = 'adminSignup';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/signup', { method: 'POST', body: JSON.stringify(data) });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminProducts = async () => {
  const key = 'getAdminProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/products', {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminReservations = async (today?: string) => {
  const key = 'getAdminReservations';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    let url = '/api/admin/reservations';
    if (today) url += `?date=${encodeURIComponent(today)}`;
    const res = await adminFetch(url, {}, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminProduct = async (id: number) => {
  const key = 'getAdminProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/products/${id}`, {}, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const createAdminProduct = async (data: any) => {
  const key = 'createAdminProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/products', { method: 'POST', body: JSON.stringify(data) }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminProduct = async (id: number, data: any) => {
  const key = 'updateAdminProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const setSoldOut = async (id: number) => {
  const key = 'setSoldOut';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/products/sold-out/${id}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const toggleVisible = async (id: number) => {
  const key = 'toggleVisible';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/products/visible/${id}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 상품 셀프 수령 가능 여부 토글
export const toggleSelfPickAvailable = async (id: number) => {
  const key = 'toggleSelfPickAvailable';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/products/self-pick/${id}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const deleteAdminProduct = async (id: number) => {
  const key = 'deleteAdminProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/products/${id}`, { method: 'DELETE' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateReservationStatus = async (id: number, status: 'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled') => {
  const key = 'updateReservationStatus';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const statusUpper = status.toUpperCase();
    const res = await adminFetch(`/api/admin/reservations/${id}/${statusUpper}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const warnReservation = async (id: number) => {
  const key = 'warnReservation';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/reservations/${id}/no-show`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 일자별 매출 집계 요약 API
export const getSalesSummary = async (from?: string, to?: string)  => {
  const key = 'getSalesSummary';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    let url = `/api/admin/agg/summary`;
    if (from && to) {
      url += `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }
    
    const res = await adminFetch(url, { cache: 'no-store' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 특정 날짜 상세 매출 내역 API
export const getSalesDetails = async (date: string) => {
  const key = 'getSalesDetails';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const url = `/api/admin/agg/sales?date=${encodeURIComponent(date)}`;
    const res = await adminFetch(url, { cache: 'no-store' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 오늘 매출 데이터 API
export const getTodaySales = async (date: string) => {
  const key = 'getTodaySales';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const url = `/api/admin/reservations/sales/today`;
    const res = await adminFetch(url, { cache: 'no-store' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getUploadUrl = async (filename: string, contentType: string): Promise<Response> => {
  const key = 'getUploadUrl';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    if (!contentType || typeof contentType !== 'string') throw new Error(`Invalid contentType: ${contentType}`);
    const cleanContentType = contentType.trim();
    if (!cleanContentType) throw new Error('contentType cannot be empty after trimming');

    const body = { file_name: filename, content_type: cleanContentType };
    // 공통 presigned-url (메인 상품 이미지 업로드에 사용)
    const res = await adminFetch('/api/admin/products/presigned-url', { method: 'POST', body: JSON.stringify(body) }, true);

    if (res.status === 403) {
      try { const err = await res.clone().json(); safeErrorLog(err); } catch { /* ignore */ }
    }
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getUpdateUrl = async (id: number, filename: string, contentType: string): Promise<Response> => {
  const key = 'getUpdateUrl';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const body = { file_name: filename, content_type: contentType };
    const res = await adminFetch(`/api/admin/products/${id}/presigned-url`, { method: 'PATCH', body: JSON.stringify(body) }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getDetailUpdateUrl = async (id: number, filenames: string[], contentType: string): Promise<Response> => {
  const key = 'getDetailUpdateUrl';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const body = { product_id: id, file_names: filenames, content_type: contentType };
    const res = await adminFetch(`/api/admin/products/${id}/presigned-url`, { method: 'PATCH', body: JSON.stringify(body) }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// New: Detail images batch presigned URL (server expects camelCase keys)
export type PresignedDetailItem = {
  url: string;
  key: string;
  method?: string;
  content_type?: string;
  expires_in?: number;
};

export const getDetailPresignedUrlsBatch = async (
  productId: number,
  fileNames: string[],
  contentType: string
): Promise<PresignedDetailItem[]> => {
  const key = 'getDetailPresignedUrlsBatch';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    // 서버 스펙: snake_case (file_names, content_type)
    const body = { file_names: fileNames, content_type: contentType } as any;
    const res = await adminFetch(`/api/admin/products/${productId}/presigned-url`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, true);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return [];
      throw new Error('상세 이미지 업로드 URL 발급에 실패했습니다.');
    }
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    // 기대 형식: [{ url, key, method, content_type, expires_in }]
    return list.map((it: any) => ({
      url: String(it.url || it.uploadUrl || ''),
      key: String(it.key || ''),
      method: it.method ? String(it.method) : 'PUT',
      content_type: it.content_type ? String(it.content_type) : undefined,
      expires_in: typeof it.expires_in === 'number' ? it.expires_in : undefined,
    }));
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// ===== Admin 전용: 요청/응답 매핑 헬퍼 =====

export type AdminProductListItem = {
  id: number;
  name: string;
  price: number;
  stock: number;
  status: 'active' | 'inactive';
  imageUrl: string;
  sellDate?: string;
  sellTime?: string;
  orderIndex?: number;
  selfPickAllowed?: boolean; // server: self_pick
};

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const base = process.env.REACT_APP_IMG_URL || '';
  return base ? `${base}/${url}` : url;
};

const mapAdminListItem = (p: any): AdminProductListItem => {
  const stockNum = Number(p.stock ?? 0);
  // 서버 가시성 필드 추정치: visible | is_visible | visibility | status(boolean-like)
  const rawVisible = (
    p.visible ??
    p.is_visible ??
    p.visibility ??
    (typeof p.status === 'boolean' ? p.status : undefined)
  );
  const visible = typeof rawVisible === 'boolean' ? rawVisible : (stockNum > 0);
  return {
    id: Number(p.id),
    name: String(p.name ?? ''),
    price: Number(p.price ?? 0),
    stock: stockNum,
    status: visible ? 'active' : 'inactive',
    imageUrl: addImgPrefix(p.productUrl ?? p.product_url ?? p.imageUrl ?? ''),
    sellDate: (p.sellDate ?? p.sell_date) || undefined,
    sellTime: (p.sellTime ?? p.sell_time) || undefined,
    orderIndex: p.order_index ? Number(p.order_index) : undefined,
    selfPickAllowed: typeof p.self_pick === 'boolean' ? Boolean(p.self_pick) : undefined,
  };
};

export const getAdminProductsMapped = async (forceTs?: number): Promise<AdminProductListItem[]> => {
  const ts = forceTs ? `?ts=${forceTs}` : '';
  const res = await adminFetch(`/api/admin/products${ts}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  }, true);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return [];
    throw new Error('상품 목록을 불러오지 못했습니다.');
  }
  const body = await res.json();
  const arr = Array.isArray(body) ? body : (body?.response || []);
  if (!Array.isArray(arr)) throw new Error('상품 데이터가 배열 형태가 아닙니다.');
  return arr.map(mapAdminListItem);
};

export type AdminProductDetail = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  images?: string[];
  sellDate?: string;
  description?: string;
};

export const getAdminProductDetailMapped = async (id: number): Promise<AdminProductDetail> => {
  const res = await adminFetch(`/api/admin/products/${id}`, {}, true);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('권한이 없습니다.');
    throw new Error('상품 정보를 불러오지 못했습니다.');
  }
  const raw = await res.json();
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    price: Number(raw.price ?? 0),
    stock: Number(raw.stock ?? 0),
    imageUrl: addImgPrefix(raw.productUrl ?? raw.imageUrl ?? raw.product_url ?? ''),
    images: Array.isArray(raw.detail_urls)
      ? raw.detail_urls.map((u: string) => addImgPrefix(u))
      : (Array.isArray(raw.detailUrl)
        ? raw.detailUrl.map((u: string) => addImgPrefix(u))
        : (raw.images || undefined)),
    sellDate: (raw.sellDate ?? raw.sell_date) || undefined,
    description: raw.description || undefined,
  };
};

export type AdminProductUpdatePayload = {
  name: string;
  price: number;
  stock: number;
  productUrl: string;
  sellDate: string | null;
  description?: string;
  detailUrl?: string[];
};

export const updateAdminProductWithPayload = async (id: number, payload: AdminProductUpdatePayload) => {
  return adminFetch(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, true);
};

export const getHealth = async () => {
  const key = 'getHealth';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 예약 일괄 상태 변경
export const updateReservationsStatusBulk = async (reservationIds: number[], status: 'pending' | 'self_pick_ready' | 'picked' | 'self_pick' | 'canceled') => {
  const key = 'updateReservationsStatusBulk';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const body = {
      reservation_ids: reservationIds,
      status: status.toUpperCase(),
    };
    const res = await adminFetch('/api/admin/reservations/status', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 세션 유효성 검증
export const validateAdminSession = async () => {
  const key = 'validateAdminSession';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/validate', { method: 'GET' }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 상품 판매일 일괄 변경
export const bulkUpdateSellDate = async (productIds: number[], sellDate: string) => {
  const key = 'bulkUpdateSellDate';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const body = {
      product_ids: productIds,
      sell_date: sellDate,
    };
    const res = await adminFetch('/api/admin/products/bulk-sell-date', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 상품 판매일 일괄 조회
export const getBulkSellDates = async (productIds: number[]) => {
  const key = 'getBulkSellDates';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const queryParams = productIds.map(id => `ids=${id}`).join('&');
    const res = await adminFetch(`/api/admin/products/bulk-sell-date?${queryParams}`, {}, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 상품 순서 업데이트
export const updateProductOrder = async (product_ids: number[]) => {
  const key = 'updateProductOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/products/order', {
      method: 'PATCH',
      body: JSON.stringify({ product_ids }),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 서버 시간 조회 (KST 기준 epoch milliseconds)
export const getServerTime = async (): Promise<number> => {
  const key = 'getServerTime';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await fetch(`${API_BASE}/api/time`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    // LocalDateTime 문자열 응답을 받아서 epoch milliseconds로 변환
    const localDateTimeStr = await res.text();
    const cleanedDateTimeStr = localDateTimeStr
      .replace(/^"|"$/g, '') // 앞뒤 따옴표 제거
      .replace(/\.(\d{3})\d+/, '.$1'); // 마이크로초를 밀리초로 제한
    
    
    // LocalDateTime을 Date 객체로 변환 (KST 기준)
    const date = new Date(cleanedDateTimeStr + '+09:00'); // KST 타임존 추가
    const epochMs = date.getTime();
    
    if (isNaN(epochMs)) {
      throw new Error(`LocalDateTime 파싱 실패: ${localDateTimeStr}`);
    }
    
    if (res.ok) resetApiRetryCount(key);
    return epochMs;
  } catch (e) { 
    incrementApiRetryCount(key); 
    throw e; 
  }
};
