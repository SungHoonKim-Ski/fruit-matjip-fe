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
const makeApiKey = (scope: 'ADMIN' | 'USER' | 'GEN', method: string, url: string) => `${scope}:${method.toUpperCase()}:${url}`;

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
const pushUiError = (message: string, type: 'error' | 'admin' | 'user' = 'error') => {
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
const getAdminRedirectUrl = (apiUrl: string): string => {
  if (apiUrl.includes('/api/admin/courier')) return '/admin/courier/login';
  return '/admin/shop/login';
};
const setAuthErrorAndRedirect = (status: number, scope: ErrorScope, message: string, redirectUrl?: string) => {
  localStorage.setItem('error-message', message);
  localStorage.setItem('error-type', scope);
  localStorage.setItem('error-redirect', redirectUrl ?? (scope === 'admin' ? '/admin/shop/login' : '/'));
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

      // === 403 처리 ===
      if (autoRedirect && response.status === 403 && !url.includes('/login')) {
        const msg = '접근 권한이 없습니다.';
        if (isAdminApi) {
          pushUiError(msg, 'admin');
          localStorage.removeItem('admin-auth');
          setAuthErrorAndRedirect(403, 'admin', msg, getAdminRedirectUrl(url));
        } else {
          pushUiError(msg, 'user');
          setAuthErrorAndRedirect(403, 'user', msg);
        }
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
        setAuthErrorAndRedirect(response.status, 'admin', msg, getAdminRedirectUrl(url));
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
    window.location.href = '/';
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
export const getProducts = async (from?: string, to?: string, categoryId?: number) => {
  const key = 'getProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    let url = '/api/store/auth/products';
    const params = [];
    if (from && to) {
      params.push(`from=${encodeURIComponent(from)}`);
      params.push(`to=${encodeURIComponent(to)}`);
    }
    if (categoryId) {
      params.push(`categoryId=${categoryId}`);
    }
    if (params.length > 0) {
      url += '?' + params.join('&');
    }
    const res = await userFetch(url);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getProduct = async (id: number) => {
  const key = 'getProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/store/auth/products/${id}`);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getProductCategories = async () => {
  const key = 'getCategories';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch('/api/store/auth/products/categories');
    if (res.ok) resetApiRetryCount(key);
    return res.json();
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 레거시: 기존 키워드 API를 카테고리로 매핑 (하위 호환성)
export const getProductKeywords = getProductCategories;

export const createReservation = async (data: any) => {
  const key = 'createReservation';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch('/api/store/auth/reservations/', { method: 'POST', body: JSON.stringify(data) });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const cancelReservation = async (code: string) => {
  const key = 'cancelReservation';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/store/auth/reservations/cancel/${code}`, { method: 'PATCH' });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};


export type DeliveryInfo = {
  phone: string;
  postalCode: string;
  address1: string;
  address2?: string;
  latitude?: number;
  longitude?: number;
};

export type DeliveryConfig = {
  enabled: boolean;
  storeLat: number;
  storeLng: number;
  maxDistanceKm: number;
  feeDistanceKm: number;
  minAmount: number;
  feeNear: number;
  feePer100m: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

export const getDeliveryConfig = async (): Promise<DeliveryConfig | null> => {
  const key = 'getDeliveryConfig';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch('/api/store/auth/deliveries/config');
    if (!res.ok) {
      incrementApiRetryCount(key);
      return null;
    }
    const data = await res.json();
    resetApiRetryCount(key);
    if (!data) return null;
    return {
      enabled: data.enabled ?? data.delivery_enabled ?? true,
      storeLat: Number(data.store_lat ?? data.storeLat ?? 0),
      storeLng: Number(data.store_lng ?? data.storeLng ?? 0),
      maxDistanceKm: Number(data.max_distance_km ?? data.maxDistanceKm ?? 0),
      feeDistanceKm: Number(data.fee_distance_km ?? data.feeDistanceKm ?? 0),
      minAmount: Number(data.min_amount ?? data.minAmount ?? 0),
      feeNear: Number(data.fee_near ?? data.feeNear ?? 0),
      feePer100m: Number(data.fee_per100m ?? data.feePer100m ?? 0),
      startHour: Number(data.start_hour ?? data.startHour ?? 0),
      startMinute: Number(data.start_minute ?? data.startMinute ?? 0),
      endHour: Number(data.end_hour ?? data.endHour ?? 0),
      endMinute: Number(data.end_minute ?? data.endMinute ?? 0),
    };
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

export type DeliveryFeeEstimate = {
  distanceKm: number;
  deliveryFee: number;
};

export const getDeliveryFeeEstimate = async (latitude: number, longitude: number): Promise<DeliveryFeeEstimate | null> => {
  const key = 'getDeliveryFeeEstimate';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch('/api/store/auth/deliveries/fee', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      incrementApiRetryCount(key);
      throw new Error(data.message || '배달비 계산에 실패했습니다.');
    }
    const data = await res.json();
    resetApiRetryCount(key);
    if (!data) return null;
    return {
      distanceKm: Number(data.distance_km ?? data.distanceKm ?? 0),
      deliveryFee: Number(data.delivery_fee ?? data.deliveryFee ?? 0),
    };
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

export const getDeliveryInfo = async (): Promise<DeliveryInfo | null> => {
  const key = 'getDeliveryInfo';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch('/api/store/auth/deliveries/info');
    if (res.status === 204) return null;
    const data = await res.json();
    if (res.ok) resetApiRetryCount(key);
    if (!data) return null;
    return {
      phone: String(data.phone || ''),
      postalCode: String(data.postal_code || data.postalCode || ''),
      address1: String(data.address1 || ''),
      address2: data.address2 ? String(data.address2) : '',
      latitude: data.latitude != null ? Number(data.latitude) : undefined,
      longitude: data.longitude != null ? Number(data.longitude) : undefined,
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const saveDeliveryInfo = async (info: DeliveryInfo) => {
  const key = 'saveDeliveryInfo';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch('/api/store/auth/deliveries/info', {
      method: 'PUT',
      body: JSON.stringify({
        phone: info.phone,
        postal_code: info.postalCode,
        address1: info.address1,
        address2: info.address2 || '',
        latitude: info.latitude,
        longitude: info.longitude,
      }),
    });
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const createDeliveryPaymentReady = async (data: {
  reservationCodes: string[];
  deliveryHour: number;
  deliveryMinute: number;
  phone: string;
  postalCode: string;
  address1: string;
  address2?: string;
  latitude?: number;
  longitude?: number;
  scheduledDeliveryHour?: number | null;
  scheduledDeliveryMinute?: number | null;
  idempotencyKey: string;
}) => {
  const key = 'createDeliveryPaymentReady';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch('/api/store/auth/deliveries/ready', {
      method: 'POST',
      body: JSON.stringify({
        reservation_codes: data.reservationCodes,
        delivery_hour: data.deliveryHour,
        delivery_minute: data.deliveryMinute,
        phone: data.phone,
        postal_code: data.postalCode,
        address1: data.address1,
        address2: data.address2 || '',
        latitude: data.latitude,
        longitude: data.longitude,
        idempotency_key: data.idempotencyKey,
        scheduled_delivery_hour: data.scheduledDeliveryHour ?? null,
        scheduled_delivery_minute: data.scheduledDeliveryMinute ?? null,
      }),
    });
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const approveDeliveryPayment = async (code: string, pgToken: string) => {
  const key = 'approveDeliveryPayment';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/store/auth/deliveries/approve?order_id=${code}&pg_token=${encodeURIComponent(pgToken)}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const cancelDeliveryPayment = async (code: string) => {
  const key = 'cancelDeliveryPayment';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/store/auth/deliveries/cancel?order_id=${code}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const failDeliveryPayment = async (code: string) => {
  const key = 'failDeliveryPayment';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/store/auth/deliveries/fail?order_id=${code}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const minusQuantity = async (code: string, quantity: number) => {
  const key = 'minusQuantity';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await userFetch(`/api/store/auth/reservations/${code}/quantity?minus=${quantity}`, { method: 'PATCH' });
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
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

export const getUserMe = async (): Promise<{ nickname: string; restricted: boolean; restrictedUntil: string | null }> => {
  const res = await userFetch('/api/auth/users/me');
  if (!res.ok) {
    throw new Error('사용자 정보를 불러올 수 없습니다.');
  }
  const data = await res.json();
  return {
    nickname: data.nickname || '',
    restricted: Boolean(data.restricted),
    restrictedUntil: data.restrictedUntil || data.restricted_until || null,
  };
};

export const getReservations = async (from?: string, to?: string) => {
  const key = 'getReservations';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    let url = '/api/store/auth/reservations/';
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
    const res = await adminFetch('/api/admin/shop/products', {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminReservations = async (today?: string) => {
  const key = 'getAdminReservations';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    let url = '/api/admin/shop/reservations';
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
    const res = await adminFetch(`/api/admin/shop/products/${id}`, {}, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const createAdminProduct = async (data: any) => {
  const key = 'createAdminProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/shop/products', { method: 'POST', body: JSON.stringify(data) }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminProduct = async (id: number, data: any) => {
  const key = 'updateAdminProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const setSoldOut = async (id: number) => {
  const key = 'setSoldOut';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/sold-out/${id}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const toggleVisible = async (id: number) => {
  const key = 'toggleVisible';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/visible/${id}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 상품 배달 가능 여부 토글
export const toggleDeliveryAvailable = async (id: number) => {
  const key = 'toggleDeliveryAvailable';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/delivery-available/${id}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const deleteAdminProduct = async (id: number) => {
  const key = 'deleteAdminProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/${id}`, { method: 'DELETE' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminDeliveries = async (date: string) => {
  const key = 'getAdminDeliveries';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const url = `/api/admin/shop/deliveries?date=${encodeURIComponent(date)}`;
    const res = await adminFetch(url, {}, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminDeliveryStatus = async (id: number, status: 'out_for_delivery' | 'delivered' | 'canceled') => {
  const key = 'updateAdminDeliveryStatus';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/deliveries/${id}/status/${status.toUpperCase()}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const acceptAdminDelivery = async (id: number, estimatedMinutes: number) => {
  const key = 'acceptAdminDelivery';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/deliveries/${id}/accept`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimated_minutes: estimatedMinutes }),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export type AdminDeliveryConfigPayload = {
  enabled: boolean;
  minAmount: number;
  feeNear: number;
  feePer100m: number;
  feeDistanceKm: number;
  maxDistanceKm: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

export const getAdminDeliveryConfig = async () => {
  const key = 'getAdminDeliveryConfig';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/shop/deliveries/config', {}, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminDeliveryConfig = async (payload: AdminDeliveryConfigPayload) => {
  const key = 'updateAdminDeliveryConfig';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/shop/deliveries/config', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: payload.enabled,
        min_amount: payload.minAmount,
        fee_near: payload.feeNear,
        fee_per100m: payload.feePer100m,
        fee_distance_km: payload.feeDistanceKm,
        max_distance_km: payload.maxDistanceKm,
        start_hour: payload.startHour,
        start_minute: payload.startMinute,
        end_hour: payload.endHour,
        end_minute: payload.endMinute,
      }),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateReservationStatus = async (id: number, status: 'pending' | 'picked' | 'canceled' | 'no_show') => {
  const key = 'updateReservationStatus';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const statusUpper = status.toUpperCase();
    const res = await adminFetch(`/api/admin/shop/reservations/${id}/${statusUpper}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const warnReservation = async (id: number) => {
  const key = 'warnReservation';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/reservations/${id}/no-show`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 일자별 매출 집계 요약 API
export const getSalesSummary = async (from?: string, to?: string) => {
  const key = 'getSalesSummary';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    let url = `/api/admin/shop/agg/summary`;
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
    const url = `/api/admin/shop/agg/sales?date=${encodeURIComponent(date)}`;
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
    const url = `/api/admin/shop/reservations/sales/today`;
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
    const res = await adminFetch('/api/admin/shop/products/presigned-url', { method: 'POST', body: JSON.stringify(body) }, true);

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
    const res = await adminFetch(`/api/admin/shop/products/${id}/presigned-url`, { method: 'PATCH', body: JSON.stringify(body) }, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getDetailUpdateUrl = async (id: number, filenames: string[], contentType: string): Promise<Response> => {
  const key = 'getDetailUpdateUrl';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const body = { product_id: id, file_names: filenames, content_type: contentType };
    const res = await adminFetch(`/api/admin/shop/products/${id}/presigned-url`, { method: 'PATCH', body: JSON.stringify(body) }, true);
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
    const res = await adminFetch(`/api/admin/shop/products/${productId}/presigned-url`, {
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
  deliveryAvailable?: boolean; // server: delivery_available
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
    deliveryAvailable: typeof p.delivery_available === 'boolean'
      ? Boolean(p.delivery_available)
      : (typeof p.deliveryAvailable === 'boolean' ? Boolean(p.deliveryAvailable) : undefined),
  };
};

export const getAdminProductsMapped = async (forceTs?: number): Promise<AdminProductListItem[]> => {
  const ts = forceTs ? `?ts=${forceTs}` : '';
  const res = await adminFetch(`/api/admin/shop/products${ts}`, {
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
  const res = await adminFetch(`/api/admin/shop/products/${id}`, {}, true);
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
  return adminFetch(`/api/admin/shop/products/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, true);
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
export const updateReservationsStatusBulk = async (reservationIds: number[], status: 'pending' | 'picked' | 'canceled') => {
  const key = 'updateReservationsStatusBulk';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const body = {
      reservation_ids: reservationIds,
      status: status.toUpperCase(),
    };
    const res = await adminFetch('/api/admin/shop/reservations/status', {
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
    const res = await adminFetch('/api/admin/shop/products/bulk-sell-date', {
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
    const res = await adminFetch(`/api/admin/shop/products/bulk-sell-date?${queryParams}`, {}, true);
    if (res.ok) resetApiRetryCount(key);
    return validateJsonResponse(res);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 상품 순서 업데이트
export const updateProductOrder = async (product_ids: number[]) => {
  const key = 'updateProductOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/shop/products/order', {
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

// 고객 관리 API
export type CustomerSortKey = 'TOTAL_REVENUE' | 'WARN_COUNT' | 'TOTAL_WARN_COUNT' | 'RESTRICTED_UNTIL';
export type SortOrder = 'ASC' | 'DESC';

export type CustomerListItem = {
  id: string;
  name: string;
  totalRevenue: number;
  monthlyWarnCount: number;
  totalWarnCount: number;
  isFirstTimeBuyer: boolean;
  restrictedUntil: string | null;
};

export const getCustomers = async (
  cursor: string = '',
  sortKey: CustomerSortKey = 'TOTAL_REVENUE',
  sortOrder: SortOrder = 'DESC',
  limit: number = 20,
  name?: string
): Promise<{ users: CustomerListItem[]; cursor: string | null }> => {
  const key = 'getCustomers';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const url = `/api/admin/shop/customers?name=${encodeURIComponent(name || '')}&sortKey=${sortKey}&sortOrder=${sortOrder}&cursor=${encodeURIComponent(cursor)}&limit=${limit}`;
    const res = await adminFetch(url, {}, true);
    if (res.ok) resetApiRetryCount(key);
    const data = await res.json();
    const users: CustomerListItem[] = Array.isArray(data.response) ? data.response.map((u: any) => ({
      id: String(u.uid),
      name: String(u.name || ''),
      totalRevenue: Number(u.total_revenue || 0),
      monthlyWarnCount: Number(u.monthly_warn_count || 0),
      totalWarnCount: Number(u.total_warn_count || 0),
      isFirstTimeBuyer: Boolean(u.first_time_buyer),
      restrictedUntil: u.restricted_until || u.restrictedUntil || null,
    })) : [];

    const nextCursor = data.pagination?.next_cursor || null;
    return { users, cursor: nextCursor };
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 유저 경고 등록 (POST)
export const addCustomerWarn = async (userId: string): Promise<void> => {
  const key = 'addCustomerWarn';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(
      `/api/admin/shop/customer/warn/${userId}`,
      {
        method: 'POST',
      },
      true
    );
    if (!res.ok) {
      throw new Error(`경고 등록에 실패했습니다. (${res.status})`);
    }
    if (res.ok) resetApiRetryCount(key);
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 이번 달 이용 제한 해제 (PATCH)
export const resetCustomerWarn = async (userId: string): Promise<void> => {
  const key = 'resetCustomerWarn';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(
      `/api/admin/shop/customer/warn/reset/${userId}`,
      {
        method: 'PATCH',
      },
      true
    );
    if (!res.ok) {
      throw new Error(`이용 제한 해제에 실패했습니다. (${res.status})`);
    }
    if (res.ok) resetApiRetryCount(key);
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

export const liftRestriction = async (userId: string): Promise<void> => {
  const key = 'liftRestriction';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(
      `/api/admin/shop/users/${userId}/lift-restriction`,
      {
        method: 'PATCH',
      },
      true
    );
    if (!res.ok) {
      throw new Error(`이용 제한 해제에 실패했습니다. (${res.status})`);
    }
    if (res.ok) resetApiRetryCount(key);
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 고객 경고 목록 조회
export type UserWarnReason = 'NO_SHOW' | 'ADMIN';

export type CustomerWarnItem = {
  reason: UserWarnReason;
  warnAt: string; // ISO 8601 date string
};

export const getCustomerWarns = async (userId: string): Promise<CustomerWarnItem[]> => {
  const key = 'getCustomerWarns';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/customers/warn/${userId}`, {}, true);
    if (!res.ok) {
      throw new Error(`경고 목록 조회에 실패했습니다. (${res.status})`);
    }
    if (res.ok) resetApiRetryCount(key);
    const data = await res.json();
    const warns: CustomerWarnItem[] = Array.isArray(data.response)
      ? data.response.map((w: any) => ({
        reason: w.reason as UserWarnReason,
        warnAt: String(w.warn_at || w.warnAt || ''),
      }))
      : [];
    return warns;
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};


// === Admin Category 관리 API ===
export const getAdminProductCategories = async () => {
  const key = 'getAdminCategories';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/shop/products/categories', {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res.json(); // ProductCategoryResponse 반환
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 레거시: 하위 호환성
export const getAdminProductKeywords = getAdminProductCategories;

export const addAdminProductCategory = async (name: string, imageUrl?: string) => {
  const key = 'addAdminProductCategory';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const body: { name: string; image_url?: string } = { name };
    if (imageUrl) body.image_url = imageUrl;

    const res = await adminFetch('/api/admin/shop/products/category', {
      method: 'POST',
      body: JSON.stringify(body),
    }, true);

    if (!res.ok) throw new Error('카테고리 추가 실패');
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

export const updateAdminProductCategory = async (id: number, name?: string, imageUrl?: string) => {
  const key = 'updateAdminProductCategory';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const body: { name?: string; image_url?: string } = {};
    if (name) body.name = name;
    if (imageUrl) body.image_url = imageUrl;

    const res = await adminFetch(`/api/admin/shop/products/category/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, true);

    if (!res.ok) throw new Error('카테고리 수정 실패');
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 레거시: 하위 호환성
export const addAdminProductKeyword = (keyword: string) => addAdminProductCategory(keyword);
export const addAdminProductKeywordWithImage = (keyword: string, keywordUrl?: string) => addAdminProductCategory(keyword, keywordUrl);

export const deleteAdminProductCategory = async (name: string) => {
  const key = 'deleteAdminProductCategory';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/category?keyword=${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }, true);

    if (!res.ok) throw new Error('카테고리 삭제 실패');
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 레거시: 하위 호환성
export const deleteAdminProductKeyword = deleteAdminProductCategory;

// 순서 일괄 업데이트 (드래그앤드롭 후 저장)
export type CategoryItem = { keyword: string; keywordUrl?: string };

export const updateAdminProductCategoryOrder = async (categories: { id: number; name: string; imageUrl?: string }[]) => {
  const key = 'updateAdminProductCategoryOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    // 서버는 PATCH /api/admin/products/categories/order, Body: { categories: [{id, name, imageUrl}] }
    const res = await adminFetch('/api/admin/shop/products/categories/order', {
      method: 'PATCH',
      body: JSON.stringify({
        categories: categories.map(c => ({
          id: c.id,
          name: c.name,
          image_url: c.imageUrl
        }))
      }),
    }, true);

    if (!res.ok) throw new Error('카테고리 순서 저장 실패');
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 레거시: 하위 호환성
export type KeywordItem = CategoryItem;
export const updateAdminProductKeywordOrder = updateAdminProductCategoryOrder;

// 카테고리 이미지 업로드용 presigned URL 발급
export const getCategoryPresignedUrl = async (filename: string, contentType: string): Promise<Response> => {
  const key = 'getCategoryPresignedUrl';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    if (!contentType || typeof contentType !== 'string') throw new Error(`Invalid contentType: ${contentType}`);
    const cleanContentType = contentType.trim();
    if (!cleanContentType) throw new Error('contentType cannot be empty after trimming');

    const body = { file_name: filename, content_type: cleanContentType };
    // 카테고리 전용 presigned-url 엔드포인트 (기존 keyword와 동일할 수 있으나 명칭 정리)
    const res = await adminFetch('/api/admin/shop/keyword/presigned-url', { method: 'POST', body: JSON.stringify(body) }, true);

    if (res.status === 403) {
      try { const err = await res.clone().json(); safeErrorLog(err); } catch { /* ignore */ }
    }
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 레거시: 하위 호환성
export const getKeywordPresignedUrl = getCategoryPresignedUrl;

// === 상품-카테고리 연결 API ===
export const getProductCategoriesForProduct = async (productId: number) => {
  const key = 'getProductCategoriesForProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    // 카테고리 목록 조회 + 상품 정보에서 카테고리 연결 확인
    const res = await adminFetch('/api/admin/shop/products/categories', {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res.json();
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};


export const addCategoryToProduct = async (productId: number, categoryId: number) => {
  const key = 'addCategoryToProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/${productId}/categories/${categoryId}`, {
      method: 'POST',
    }, true);

    if (!res.ok) throw new Error('카테고리 연결 실패');
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

export const removeCategoryFromProduct = async (productId: number, categoryId: number) => {
  const key = 'removeCategoryFromProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/${productId}/categories/${categoryId}`, {
      method: 'DELETE',
    }, true);

    if (!res.ok) throw new Error('카테고리 연결 해제 실패');
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// 카테고리에 상품들 일괄 할당
export const updateCategoryProducts = async (categoryId: number, productIds: number[]) => {
  const key = 'updateCategoryProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/shop/products/categories/${categoryId}/products`, {
      method: 'PUT',
      body: JSON.stringify({ product_ids: productIds }),
    }, true);

    if (!res.ok) throw new Error('카테고리 상품 할당 실패');
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) {
    incrementApiRetryCount(key);
    throw e;
  }
};

// ===== Courier Product APIs =====

// 사용자 — JWT 인증 (apiFetch 사용)
export const getCourierProducts = async (categoryId?: number) => {
  const key = 'getCourierProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const params = categoryId ? `?categoryId=${categoryId}` : '';
    const res = await apiFetch(`/api/auth/courier/products${params}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getCourierProduct = async (id: number) => {
  const key = 'getCourierProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch(`/api/auth/courier/products/${id}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getCourierCategories = async () => {
  const key = 'getCourierCategories';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch('/api/auth/courier/products/categories');
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminCourierCategories = async () => {
  const key = 'getAdminCourierCategories';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/products/categories', {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 — 세션 인증 (adminFetch 사용)
export const getAdminCourierProducts = async () => {
  const key = 'getAdminCourierProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/products', {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminCourierProduct = async (id: number) => {
  const key = 'getAdminCourierProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/products/${id}`, {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const createAdminCourierProduct = async (data: any) => {
  const key = 'createAdminCourierProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierProduct = async (id: number, data: any) => {
  const key = 'updateAdminCourierProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const deleteAdminCourierProduct = async (id: number) => {
  const key = 'deleteAdminCourierProduct';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/products/${id}`, { method: 'DELETE' }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const toggleAdminCourierProductVisible = async (id: number) => {
  const key = 'toggleAdminCourierProductVisible';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/products/visible/${id}`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const toggleAdminCourierProductSoldOut = async (id: number) => {
  const res = await adminFetch(`/api/admin/courier/products/sold-out/${id}`, { method: 'PATCH' }, true);
  return res;
};

export const updateAdminCourierProductOrder = async (productIds: number[]) => {
  const key = 'updateAdminCourierProductOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/products/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(productIds),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierCategoryProductOrder = async (categoryId: number, productIds: number[]) => {
  const key = 'updateAdminCourierCategoryProductOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/products/category-order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, productIds }),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminCourierProductPresignedUrl = async (fileName: string, contentType: string) => {
  const key = 'getAdminCourierProductPresignedUrl';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/products/presigned-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: fileName, content_type: contentType }),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getRecommendedCourierProducts = async (limit?: number) => {
  const key = 'getRecommendedCourierProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const params = limit !== undefined ? `?limit=${limit}` : '';
    const res = await apiFetch(`/api/auth/courier/products/recommended${params}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const searchCourierProducts = async (q: string) => {
  const key = 'searchCourierProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch(`/api/auth/courier/products/search?q=${encodeURIComponent(q)}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getCourierProductsByCategory = async (limit?: number) => {
  const key = 'getCourierProductsByCategory';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const params = limit !== undefined ? `?limit=${limit}` : '';
    const res = await apiFetch(`/api/auth/courier/products/by-category${params}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const toggleAdminCourierProductRecommend = async (id: number) => {
  const key = 'toggleAdminCourierProductRecommend';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/products/${id}/recommend`, { method: 'PATCH' }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierRecommendOrder = async (productIds: number[]) => {
  const key = 'updateAdminCourierRecommendOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/products/recommend-order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds }),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// ===== Courier Category APIs =====

export const getAdminCourierCategoriesList = async () => {
  const key = 'getAdminCourierCategoriesList';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/categories', {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const createAdminCourierCategory = async (data: { name: string; imageUrl?: string; sortOrder?: number }) => {
  const key = 'createAdminCourierCategory';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierCategory = async (id: number, data: { name?: string; imageUrl?: string; sortOrder?: number }) => {
  const key = 'updateAdminCourierCategory';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const deleteAdminCourierCategory = async (id: number) => {
  const key = 'deleteAdminCourierCategory';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/categories/${id}`, { method: 'DELETE' }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierCategoryOrder = async (categoryIds: number[]) => {
  const key = 'updateAdminCourierCategoryOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/categories/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryIds),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const getAdminCourierCategoryProducts = async (categoryId: number) => {
  const key = 'getAdminCourierCategoryProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/categories/${categoryId}/products`, {}, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierCategoryProducts = async (categoryId: number, productIds: number[]) => {
  const key = 'updateAdminCourierCategoryProducts';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/categories/${categoryId}/products`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: productIds }),
    }, true);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// ===== Courier Order APIs =====

export type CourierOrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PREPARING'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELED'
  | 'FAILED';

export type ShippingFeeResponse = {
  baseFee: number;
  extraFee: number;
  totalFee: number;
  isRemoteArea: boolean;
};

export type CourierConfigResponse = {
  minOrderAmount: number;
  freeShippingThreshold: number | null;
  shippingBaseFee: number;
  remoteAreaExtraFee: number;
  noticeText: string | null;
};

export type CourierOrderReadyRequest = {
  items: { courierProductId: number; quantity: number; selectedOptionIds?: number[] }[];
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address1: string;
  address2: string;
  deliveryMemo: string;
  pgProvider?: string;
  idempotencyKey: string;
};

export type CourierOrderReadyResponse = {
  orderCode: string;
  redirectUrl: string;
  mobileRedirectUrl: string;
};

export type CourierOrderItemSummary = {
  courierProductId: number;
  productName: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type CourierOrderSummary = {
  displayCode: string;
  status: CourierOrderStatus;
  itemSummary: string;
  itemCount: number;
  totalAmount: number;
  createdAt: string;
  items: CourierOrderItemSummary[];
};

export type CourierOrderListResponse = {
  orders: CourierOrderSummary[];
  nextCursor: number | null;
  hasNext: boolean;
};

export type CourierOrderDetailResponse = {
  displayCode: string;
  status: CourierOrderStatus;
  items: CourierOrderItemSummary[];
  productTotal: number;
  shippingFee: number;
  remoteAreaFee: number;
  totalAmount: number;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address1: string;
  address2: string;
  deliveryMemo: string;
  courierCompany: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

// 택배 배송비 조회
export const getCourierShippingFee = async (
  items: Array<{ courierProductId: number; quantity: number }>,
  postalCode?: string,
): Promise<ShippingFeeResponse> => {
  const key = 'getCourierShippingFee';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch('/api/auth/courier/shipping-fee', {
      method: 'POST',
      body: JSON.stringify({
        items: items.map(i => ({
          courier_product_id: i.courierProductId,
          quantity: i.quantity,
        })),
        postal_code: postalCode || null,
      }),
    });
    if (!res.ok) throw new Error('배송비 조회에 실패했습니다.');
    const data = await res.json();
    resetApiRetryCount(key);
    return {
      baseFee: Number(data.shipping_fee ?? data.shippingFee ?? 0),
      extraFee: Number(data.island_surcharge ?? data.islandSurcharge ?? 0),
      totalFee: Number(data.total_shipping_fee ?? data.totalShippingFee ?? 0),
      isRemoteArea: Boolean(data.is_island ?? data.isIsland ?? false),
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 택배 설정 조회
export const getCourierConfig = async (): Promise<CourierConfigResponse> => {
  const key = 'getCourierConfig';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch('/api/auth/courier/orders/config');
    if (!res.ok) throw new Error('택배 설정 조회에 실패했습니다.');
    const data = await res.json();
    resetApiRetryCount(key);
    return {
      minOrderAmount: Number(data.min_order_amount ?? data.minOrderAmount ?? 0),
      freeShippingThreshold: data.free_shipping_threshold ?? data.freeShippingThreshold ?? null,
      shippingBaseFee: Number(data.shipping_base_fee ?? data.shippingBaseFee ?? 3000),
      remoteAreaExtraFee: Number(data.remote_area_extra_fee ?? data.remoteAreaExtraFee ?? 3000),
      noticeText: data.notice_text ?? data.noticeText ?? null,
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 택배 주문 생성 (결제 준비)
export const createCourierOrder = async (request: CourierOrderReadyRequest): Promise<CourierOrderReadyResponse> => {
  const key = 'createCourierOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch('/api/auth/courier/orders/ready', {
      method: 'POST',
      body: JSON.stringify({
        items: request.items.map(i => ({
          courier_product_id: i.courierProductId,
          quantity: i.quantity,
          selected_option_ids: i.selectedOptionIds,
        })),
        receiver_name: request.recipientName,
        receiver_phone: request.recipientPhone,
        postal_code: request.postalCode,
        address1: request.address1,
        address2: request.address2,
        shipping_memo: request.deliveryMemo,
        pg_provider: request.pgProvider || 'KAKAOPAY',
        idempotency_key: request.idempotencyKey,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || '주문 생성에 실패했습니다.');
    }
    const data = await res.json();
    resetApiRetryCount(key);
    return {
      orderCode: String(data.order_code ?? data.orderCode ?? ''),
      redirectUrl: String(data.redirect_url ?? data.redirectUrl ?? ''),
      mobileRedirectUrl: String(data.mobile_redirect_url ?? data.mobileRedirectUrl ?? ''),
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 택배 결제 승인
export const approveCourierPayment = async (orderCode: string, pgToken: string) => {
  const key = 'approveCourierPayment';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch(`/api/auth/courier/orders/approve?order_id=${encodeURIComponent(orderCode)}&pg_token=${encodeURIComponent(pgToken)}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 택배 결제 취소
export const cancelCourierPayment = async (orderCode: string) => {
  const key = 'cancelCourierPayment';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch(`/api/auth/courier/orders/cancel?order_id=${encodeURIComponent(orderCode)}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 택배 결제 실패
export const failCourierPayment = async (orderCode: string) => {
  const key = 'failCourierPayment';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch(`/api/auth/courier/orders/fail?order_id=${encodeURIComponent(orderCode)}`);
    if (res.ok) resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 택배 주문 목록
export const getCourierOrders = async (cursor?: number, size: number = 10): Promise<CourierOrderListResponse> => {
  const key = 'getCourierOrders';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const params = [`size=${size}`];
    if (cursor != null) params.push(`cursor=${cursor}`);
    const res = await apiFetch(`/api/auth/courier/orders?${params.join('&')}`);
    if (!res.ok) throw new Error('주문 목록 조회에 실패했습니다.');
    const data = await res.json();
    resetApiRetryCount(key);
    const orders: CourierOrderSummary[] = (Array.isArray(data.orders ?? data.response) ? (data.orders ?? data.response) : []).map((o: any) => ({
      displayCode: String(o.display_code ?? o.displayCode ?? ''),
      status: String(o.status ?? 'PENDING_PAYMENT') as CourierOrderStatus,
      itemSummary: String(o.item_summary ?? o.itemSummary ?? ''),
      itemCount: Number(o.item_count ?? o.itemCount ?? 0),
      totalAmount: Number(o.total_amount ?? o.totalAmount ?? 0),
      createdAt: String(o.created_at ?? o.createdAt ?? ''),
      items: Array.isArray(o.items) ? o.items.map((i: any) => ({
        courierProductId: Number(i.courier_product_id ?? i.courierProductId ?? 0),
        productName: String(i.product_name ?? i.productName ?? ''),
        imageUrl: String(i.image_url ?? i.imageUrl ?? ''),
        unitPrice: Number(i.unit_price ?? i.unitPrice ?? 0),
        quantity: Number(i.quantity ?? 0),
        subtotal: Number(i.subtotal ?? 0),
      })) : [],
    }));
    return {
      orders,
      nextCursor: data.next_cursor ?? data.nextCursor ?? null,
      hasNext: Boolean(data.has_next ?? data.hasNext ?? false),
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 택배 주문 상세
export const getCourierOrder = async (displayCode: string): Promise<CourierOrderDetailResponse> => {
  const key = 'getCourierOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch(`/api/auth/courier/orders/${encodeURIComponent(displayCode)}`);
    if (!res.ok) throw new Error('주문 상세 조회에 실패했습니다.');
    const d = await res.json();
    resetApiRetryCount(key);
    return {
      displayCode: String(d.display_code ?? d.displayCode ?? ''),
      status: String(d.status ?? 'PENDING_PAYMENT') as CourierOrderStatus,
      items: Array.isArray(d.items) ? d.items.map((i: any) => ({
        courierProductId: Number(i.courier_product_id ?? i.courierProductId ?? 0),
        productName: String(i.product_name ?? i.productName ?? ''),
        imageUrl: String(i.image_url ?? i.imageUrl ?? ''),
        unitPrice: Number(i.unit_price ?? i.unitPrice ?? 0),
        quantity: Number(i.quantity ?? 0),
        subtotal: Number(i.subtotal ?? 0),
      })) : [],
      productTotal: Number(d.product_total ?? d.productTotal ?? 0),
      shippingFee: Number(d.shipping_fee ?? d.shippingFee ?? 0),
      remoteAreaFee: Number(d.remote_area_fee ?? d.remoteAreaFee ?? 0),
      totalAmount: Number(d.total_amount ?? d.totalAmount ?? 0),
      recipientName: String(d.recipient_name ?? d.recipientName ?? ''),
      recipientPhone: String(d.recipient_phone ?? d.recipientPhone ?? ''),
      postalCode: String(d.postal_code ?? d.postalCode ?? ''),
      address1: String(d.address1 ?? ''),
      address2: String(d.address2 ?? ''),
      deliveryMemo: String(d.delivery_memo ?? d.deliveryMemo ?? ''),
      courierCompany: d.courier_company ?? d.courierCompany ?? null,
      trackingNumber: d.tracking_number ?? d.trackingNumber ?? null,
      shippedAt: d.shipped_at ?? d.shippedAt ?? null,
      deliveredAt: d.delivered_at ?? d.deliveredAt ?? null,
      createdAt: String(d.created_at ?? d.createdAt ?? ''),
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// ===== Courier Admin Order APIs =====

export type AdminCourierOrderItemSummary = {
  courierProductId: number;
  productName: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type AdminCourierOrderSummary = {
  id: number;
  displayCode: string;
  status: CourierOrderStatus;
  recipientName: string;
  itemSummary: string;
  itemCount: number;
  totalAmount: number;
  trackingNumber: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type AdminCourierOrderListResponse = {
  orders: AdminCourierOrderSummary[];
  totalPages: number;
  totalElements: number;
  currentPage: number;
};

export type AdminCourierOrderDetailResponse = {
  id: number;
  displayCode: string;
  status: CourierOrderStatus;
  items: AdminCourierOrderItemSummary[];
  productTotal: number;
  shippingFee: number;
  remoteAreaFee: number;
  totalAmount: number;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  address1: string;
  address2: string;
  deliveryMemo: string;
  isRemoteArea: boolean;
  courierCompany: string | null;
  trackingNumber: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

// 관리자 택배 주문 목록
export const getAdminCourierOrders = async (
  status?: string,
  page = 0,
  size = 50,
): Promise<AdminCourierOrderListResponse> => {
  const key = 'getAdminCourierOrders';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('page', String(page));
    params.append('size', String(size));
    const res = await adminFetch(`/api/admin/courier/orders?${params.toString()}`, {}, true);
    if (!res.ok) throw new Error('주문 목록 조회에 실패했습니다.');
    const data = await res.json();
    resetApiRetryCount(key);
    const raw = Array.isArray(data.orders ?? data.response ?? data.content)
      ? (data.orders ?? data.response ?? data.content)
      : [];
    return {
      orders: raw.map((o: any) => ({
        id: Number(o.id ?? 0),
        displayCode: String(o.display_code ?? o.displayCode ?? ''),
        status: String(o.status ?? 'PAID') as CourierOrderStatus,
        recipientName: String(o.recipient_name ?? o.recipientName ?? ''),
        itemSummary: String(o.item_summary ?? o.itemSummary ?? ''),
        itemCount: Number(o.item_count ?? o.itemCount ?? 0),
        totalAmount: Number(o.total_amount ?? o.totalAmount ?? 0),
        trackingNumber: o.tracking_number ?? o.trackingNumber ?? null,
        paidAt: o.paid_at ?? o.paidAt ?? null,
        createdAt: String(o.created_at ?? o.createdAt ?? ''),
      })),
      totalPages: Number(data.total_pages ?? data.totalPages ?? 1),
      totalElements: Number(data.total_elements ?? data.totalElements ?? 0),
      currentPage: Number(data.current_page ?? data.currentPage ?? data.number ?? page),
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 택배 주문 상세
export const getAdminCourierOrder = async (id: number): Promise<AdminCourierOrderDetailResponse> => {
  const key = 'getAdminCourierOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/orders/${id}`, {}, true);
    if (!res.ok) throw new Error('주문 상세 조회에 실패했습니다.');
    const d = await res.json();
    resetApiRetryCount(key);
    return {
      id: Number(d.id ?? 0),
      displayCode: String(d.display_code ?? d.displayCode ?? ''),
      status: String(d.status ?? 'PAID') as CourierOrderStatus,
      items: Array.isArray(d.items) ? d.items.map((i: any) => ({
        courierProductId: Number(i.courier_product_id ?? i.courierProductId ?? 0),
        productName: String(i.product_name ?? i.productName ?? ''),
        imageUrl: String(i.image_url ?? i.imageUrl ?? ''),
        unitPrice: Number(i.unit_price ?? i.unitPrice ?? 0),
        quantity: Number(i.quantity ?? 0),
        subtotal: Number(i.subtotal ?? 0),
      })) : [],
      productTotal: Number(d.product_total ?? d.productTotal ?? 0),
      shippingFee: Number(d.shipping_fee ?? d.shippingFee ?? 0),
      remoteAreaFee: Number(d.remote_area_fee ?? d.remoteAreaFee ?? 0),
      totalAmount: Number(d.total_amount ?? d.totalAmount ?? 0),
      recipientName: String(d.recipient_name ?? d.recipientName ?? ''),
      recipientPhone: String(d.recipient_phone ?? d.recipientPhone ?? ''),
      postalCode: String(d.postal_code ?? d.postalCode ?? ''),
      address1: String(d.address1 ?? ''),
      address2: String(d.address2 ?? ''),
      deliveryMemo: String(d.delivery_memo ?? d.deliveryMemo ?? ''),
      isRemoteArea: Boolean(d.is_remote_area ?? d.isRemoteArea ?? false),
      courierCompany: d.courier_company ?? d.courierCompany ?? null,
      trackingNumber: d.tracking_number ?? d.trackingNumber ?? null,
      paidAt: d.paid_at ?? d.paidAt ?? null,
      shippedAt: d.shipped_at ?? d.shippedAt ?? null,
      deliveredAt: d.delivered_at ?? d.deliveredAt ?? null,
      createdAt: String(d.created_at ?? d.createdAt ?? ''),
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 택배 주문 상태 변경
export const updateAdminCourierOrderStatus = async (id: number, status: string) => {
  const key = 'updateAdminCourierOrderStatus';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/orders/${id}/status/${status}`, { method: 'PATCH' }, true);
    if (!res.ok) throw new Error('주문 상태 변경에 실패했습니다.');
    resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 택배 주문 발송처리 (운송장 입력)
export const shipAdminCourierOrder = async (id: number, waybillNumber: string) => {
  const key = 'shipAdminCourierOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/orders/${id}/ship`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waybillNumber }),
    }, true);
    if (!res.ok) throw new Error('발송 처리에 실패했습니다.');
    resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 택배 주문 취소
export const cancelAdminCourierOrder = async (id: number) => {
  const key = 'cancelAdminCourierOrder';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/orders/${id}/cancel`, { method: 'PATCH' }, true);
    if (!res.ok) throw new Error('주문 취소에 실패했습니다.');
    resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 택배 운송장 Excel 다운로드 (단건)
export const downloadAdminCourierWaybillExcel = async (id: number): Promise<Blob> => {
  const res = await fetch(`${API_BASE}/api/admin/courier/orders/${id}/waybill/excel`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Excel 다운로드에 실패했습니다.');
  return res.blob();
};

// 관리자 택배 운송장 Excel 다운로드 (다건)
export const downloadAdminCourierWaybillExcelBulk = async (orderIds: number[]): Promise<Blob> => {
  const res = await fetch(`${API_BASE}/api/admin/courier/orders/waybill/excel/bulk`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds }),
  });
  if (!res.ok) throw new Error('Excel 다운로드에 실패했습니다.');
  return res.blob();
};

// 관리자 택배 운송장 Excel 다운로드 (기간/상품 필터)
export const downloadAdminCourierWaybillExcelByFilter = async (
  startDate: string,
  endDate: string,
  productId?: number,
): Promise<Blob> => {
  const body: Record<string, any> = { start_date: startDate, end_date: endDate };
  if (productId != null) body.product_id = productId;
  const res = await fetch(`${API_BASE}/api/admin/courier/orders/waybill/excel/filter`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Excel 다운로드에 실패했습니다.');
  return res.blob();
};

// ===== Courier Claim APIs =====

export type CourierClaimType = 'QUALITY_ISSUE' | 'CHANGE_OF_MIND';
export type CourierClaimStatus = 'REQUESTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'RESOLVED';

export type CourierClaimSummary = {
  id: number;
  claimType: CourierClaimType;
  status: CourierClaimStatus;
  reason: string;
  adminNote: string | null;
  action: string | null;
  refundAmount: number | null;
  createdAt: string;
  resolvedAt: string | null;
  courierOrderItemId: number | null;
  productName: string | null;
};

export type CourierClaimListResponse = {
  claims: CourierClaimSummary[];
};

// 사용자 클레임 접수
export const createCourierClaim = async (displayCode: string, data: {
  claimType: CourierClaimType;
  courierOrderItemId?: number;
  reason: string;
}) => {
  const key = 'createCourierClaim';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch(`/api/auth/courier/orders/${encodeURIComponent(displayCode)}/claim`, {
      method: 'POST',
      body: JSON.stringify({
        claim_type: data.claimType,
        courier_order_item_id: data.courierOrderItemId ?? null,
        reason: data.reason,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '클레임 접수에 실패했습니다.');
    }
    resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 사용자 주문별 클레임 목록 조회
export const getCourierClaims = async (displayCode: string): Promise<CourierClaimListResponse> => {
  const key = 'getCourierClaims';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await apiFetch(`/api/auth/courier/orders/${encodeURIComponent(displayCode)}/claims`);
    if (!res.ok) throw new Error('클레임 목록 조회에 실패했습니다.');
    const data = await res.json();
    resetApiRetryCount(key);
    const raw = Array.isArray(data.claims ?? data.response ?? data) ? (data.claims ?? data.response ?? data) : [];
    return {
      claims: raw.map((c: any) => ({
        id: Number(c.id ?? 0),
        claimType: String(c.claim_type ?? c.claimType ?? 'QUALITY_ISSUE') as CourierClaimType,
        status: String(c.status ?? 'REQUESTED') as CourierClaimStatus,
        reason: String(c.reason ?? ''),
        adminNote: c.admin_note ?? c.adminNote ?? null,
        action: c.action ?? null,
        refundAmount: c.refund_amount ?? c.refundAmount ?? null,
        createdAt: String(c.created_at ?? c.createdAt ?? ''),
        resolvedAt: c.resolved_at ?? c.resolvedAt ?? null,
        courierOrderItemId: c.courier_order_item_id ?? c.courierOrderItemId ?? null,
        productName: c.product_name ?? c.productName ?? null,
      })),
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// ===== Admin Courier Claim APIs =====

export type AdminCourierClaimSummary = {
  id: number;
  displayCode: string;
  productName: string;
  claimType: CourierClaimType;
  status: CourierClaimStatus;
  reason: string;
  adminNote: string | null;
  action: string | null;
  refundAmount: number | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type AdminCourierClaimListResponse = {
  claims: AdminCourierClaimSummary[];
  totalPages: number;
  totalElements: number;
  currentPage: number;
};

export type AdminCourierClaimDetailResponse = {
  id: number;
  displayCode: string;
  claimType: CourierClaimType;
  status: CourierClaimStatus;
  reason: string;
  adminNote: string | null;
  action: string | null;
  refundAmount: number | null;
  courierOrderItemId: number | null;
  productName: string | null;
  customerName: string;
  totalAmount: number;
  createdAt: string;
  resolvedAt: string | null;
};

// 관리자 클레임 목록
export const getAdminCourierClaims = async (
  status?: string,
  page = 0,
  size = 50,
): Promise<AdminCourierClaimListResponse> => {
  const key = 'getAdminCourierClaims';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('page', String(page));
    params.append('size', String(size));
    const res = await adminFetch(`/api/admin/courier/claims?${params.toString()}`, {}, true);
    if (!res.ok) throw new Error('클레임 목록 조회에 실패했습니다.');
    const data = await res.json();
    resetApiRetryCount(key);
    const raw = Array.isArray(data.claims ?? data.response ?? data.content)
      ? (data.claims ?? data.response ?? data.content)
      : [];
    return {
      claims: raw.map((c: any) => ({
        id: Number(c.id ?? 0),
        displayCode: String(c.display_code ?? c.displayCode ?? ''),
        productName: String(c.product_name ?? c.productName ?? ''),
        claimType: String(c.claim_type ?? c.claimType ?? 'QUALITY_ISSUE') as CourierClaimType,
        status: String(c.status ?? 'REQUESTED') as CourierClaimStatus,
        reason: String(c.reason ?? ''),
        adminNote: c.admin_note ?? c.adminNote ?? null,
        action: c.action ?? null,
        refundAmount: c.refund_amount ?? c.refundAmount ?? null,
        createdAt: String(c.created_at ?? c.createdAt ?? ''),
        resolvedAt: c.resolved_at ?? c.resolvedAt ?? null,
      })),
      totalPages: Number(data.total_pages ?? data.totalPages ?? 1),
      totalElements: Number(data.total_elements ?? data.totalElements ?? 0),
      currentPage: Number(data.current_page ?? data.currentPage ?? data.number ?? page),
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 클레임 상세
export const getAdminCourierClaim = async (id: number): Promise<AdminCourierClaimDetailResponse> => {
  const key = 'getAdminCourierClaim';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/claims/${id}`, {}, true);
    if (!res.ok) throw new Error('클레임 상세 조회에 실패했습니다.');
    const c = await res.json();
    resetApiRetryCount(key);
    return {
      id: Number(c.id ?? 0),
      displayCode: String(c.display_code ?? c.displayCode ?? ''),
      claimType: String(c.claim_type ?? c.claimType ?? 'QUALITY_ISSUE') as CourierClaimType,
      status: String(c.status ?? 'REQUESTED') as CourierClaimStatus,
      reason: String(c.reason ?? ''),
      adminNote: c.admin_note ?? c.adminNote ?? null,
      action: c.action ?? null,
      refundAmount: c.refund_amount ?? c.refundAmount ?? null,
      courierOrderItemId: c.courier_order_item_id ?? c.courierOrderItemId ?? null,
      productName: c.product_name ?? c.productName ?? null,
      customerName: String(c.customer_name ?? c.customerName ?? ''),
      totalAmount: Number(c.total_amount ?? c.totalAmount ?? 0),
      createdAt: String(c.created_at ?? c.createdAt ?? ''),
      resolvedAt: c.resolved_at ?? c.resolvedAt ?? null,
    };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 클레임 승인
export const approveAdminCourierClaim = async (id: number, data: {
  action: 'REFUND' | 'RESHIP';
  adminNote: string;
  refundAmount?: number;
}) => {
  const key = 'approveAdminCourierClaim';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/claims/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: data.action,
        admin_note: data.adminNote,
        refund_amount: data.refundAmount ?? null,
      }),
    }, true);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '클레임 승인에 실패했습니다.');
    }
    resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// 관리자 클레임 거부
export const rejectAdminCourierClaim = async (id: number, adminNote: string) => {
  const key = 'rejectAdminCourierClaim';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/claims/${id}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_note: adminNote }),
    }, true);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '클레임 거부에 실패했습니다.');
    }
    resetApiRetryCount(key);
    return res;
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// ===== Admin Courier Config APIs =====

export type AdminCourierConfigResponse = {
  id: number;
  enabled: boolean;
  islandSurcharge: number;
  noticeText: string | null;
  senderName: string | null;
  senderPhone: string | null;
  senderPhone2: string | null;
  senderAddress: string | null;
  senderDetailAddress: string | null;
};

export type ShippingFeePolicyResponse = {
  id: number | null;
  minQuantity: number;
  maxQuantity: number;
  fee: number;
  sortOrder: number;
};

export type ShippingFeePolicyListResponse = {
  policies: ShippingFeePolicyResponse[];
};

const parseAdminCourierConfig = (d: any): AdminCourierConfigResponse => ({
  id: Number(d.id),
  enabled: Boolean(d.enabled),
  islandSurcharge: Number(d.island_surcharge ?? d.islandSurcharge ?? 0),
  noticeText: d.notice_text ?? d.noticeText ?? null,
  senderName: d.sender_name ?? d.senderName ?? null,
  senderPhone: d.sender_phone ?? d.senderPhone ?? null,
  senderPhone2: d.sender_phone2 ?? d.senderPhone2 ?? null,
  senderAddress: d.sender_address ?? d.senderAddress ?? null,
  senderDetailAddress: d.sender_detail_address ?? d.senderDetailAddress ?? null,
});

const toSnakeCourierConfig = (data: Partial<AdminCourierConfigResponse>) => ({
  id: data.id,
  enabled: data.enabled,
  island_surcharge: data.islandSurcharge,
  notice_text: data.noticeText,
  sender_name: data.senderName,
  sender_phone: data.senderPhone,
  sender_phone2: data.senderPhone2,
  sender_address: data.senderAddress,
  sender_detail_address: data.senderDetailAddress,
});

export const getAdminCourierConfig = async (): Promise<AdminCourierConfigResponse> => {
  const key = 'getAdminCourierConfig';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/config', {}, true);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '택배 설정 조회에 실패했습니다.');
    }
    resetApiRetryCount(key);
    const raw = await res.json();
    const d = raw?.response ?? raw;
    return parseAdminCourierConfig(d);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierConfig = async (data: Partial<AdminCourierConfigResponse>): Promise<AdminCourierConfigResponse> => {
  const key = 'updateAdminCourierConfig';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSnakeCourierConfig(data)),
    }, true);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '택배 설정 저장에 실패했습니다.');
    }
    resetApiRetryCount(key);
    const raw = await res.json();
    const d = raw?.response ?? raw;
    return parseAdminCourierConfig(d);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

const parseShippingFeePolicy = (d: any): ShippingFeePolicyResponse => ({
  id: d.id ?? null,
  minQuantity: Number(d.min_quantity ?? d.minQuantity ?? 0),
  maxQuantity: Number(d.max_quantity ?? d.maxQuantity ?? 0),
  fee: Number(d.fee ?? 0),
  sortOrder: Number(d.sort_order ?? d.sortOrder ?? 0),
});

const toSnakePolicy = (p: ShippingFeePolicyResponse) => ({
  id: p.id,
  min_quantity: p.minQuantity,
  max_quantity: p.maxQuantity,
  fee: p.fee,
  sort_order: p.sortOrder,
});

export const getAdminCourierShippingFeePolicies = async (): Promise<ShippingFeePolicyListResponse> => {
  const key = 'getAdminCourierShippingFeePolicies';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/shipping-fee-policies', {}, true);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '배송비 정책 조회에 실패했습니다.');
    }
    resetApiRetryCount(key);
    const raw = await res.json();
    const d = raw?.response ?? raw;
    const list = Array.isArray(d?.policies) ? d.policies : (Array.isArray(d) ? d : []);
    return { policies: list.map(parseShippingFeePolicy) };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierShippingFeePolicies = async (policies: ShippingFeePolicyResponse[]): Promise<ShippingFeePolicyListResponse> => {
  const key = 'updateAdminCourierShippingFeePolicies';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/shipping-fee-policies', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(policies.map(toSnakePolicy)),
    }, true);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '배송비 정책 저장에 실패했습니다.');
    }
    resetApiRetryCount(key);
    const raw = await res.json();
    const d = raw?.response ?? raw;
    const list = Array.isArray(d?.policies) ? d.policies : (Array.isArray(d) ? d : []);
    return { policies: list.map(parseShippingFeePolicy) };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

// ===== Shipping Fee Template APIs =====

export type ShippingFeeTemplateResponse = {
  id: number;
  name: string;
  baseFee: number;
  perQuantityFee: number | null;
  freeShippingMinAmount: number | null;
  sortOrder: number;
};

export type ShippingFeeTemplateListResponse = {
  templates: ShippingFeeTemplateResponse[];
};

const parseShippingFeeTemplate = (d: any): ShippingFeeTemplateResponse => ({
  id: Number(d.id),
  name: String(d.name ?? ''),
  baseFee: Number(d.base_fee ?? d.baseFee ?? 0),
  perQuantityFee: d.per_quantity_fee ?? d.perQuantityFee ?? null,
  freeShippingMinAmount: d.free_shipping_min_amount ?? d.freeShippingMinAmount ?? null,
  sortOrder: Number(d.sort_order ?? d.sortOrder ?? 0),
});

const toSnakeTemplate = (data: Omit<ShippingFeeTemplateResponse, 'id'>) => ({
  name: data.name,
  base_fee: data.baseFee,
  per_quantity_fee: data.perQuantityFee,
  free_shipping_min_amount: data.freeShippingMinAmount,
  sort_order: data.sortOrder,
});

export const getAdminCourierShippingFeeTemplates = async (): Promise<ShippingFeeTemplateListResponse> => {
  const key = 'getAdminCourierShippingFeeTemplates';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/shipping-fee-templates', {}, true);
    if (!res.ok) throw new Error('배송 정책 조회에 실패했습니다.');
    resetApiRetryCount(key);
    const raw = await res.json();
    const d = raw?.response ?? raw;
    const list = Array.isArray(d?.templates) ? d.templates : (Array.isArray(d) ? d : []);
    return { templates: list.map(parseShippingFeeTemplate) };
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const createAdminCourierShippingFeeTemplate = async (data: Omit<ShippingFeeTemplateResponse, 'id'>): Promise<ShippingFeeTemplateResponse> => {
  const key = 'createAdminCourierShippingFeeTemplate';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch('/api/admin/courier/shipping-fee-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSnakeTemplate(data)),
    }, true);
    if (!res.ok) throw new Error('배송 정책 생성에 실패했습니다.');
    resetApiRetryCount(key);
    const raw = await res.json();
    const d = raw?.response ?? raw;
    return parseShippingFeeTemplate(d);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const updateAdminCourierShippingFeeTemplate = async (id: number, data: Omit<ShippingFeeTemplateResponse, 'id'>): Promise<ShippingFeeTemplateResponse> => {
  const key = 'updateAdminCourierShippingFeeTemplate';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/shipping-fee-templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSnakeTemplate(data)),
    }, true);
    if (!res.ok) throw new Error('배송 정책 수정에 실패했습니다.');
    resetApiRetryCount(key);
    const raw = await res.json();
    const d = raw?.response ?? raw;
    return parseShippingFeeTemplate(d);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};

export const deleteAdminCourierShippingFeeTemplate = async (id: number): Promise<void> => {
  const key = 'deleteAdminCourierShippingFeeTemplate';
  if (!canRetryApi(key)) throw new Error('서버 에러입니다. 관리자에게 문의 바랍니다.');
  try {
    const res = await adminFetch(`/api/admin/courier/shipping-fee-templates/${id}`, {
      method: 'DELETE',
    }, true);
    if (!res.ok) throw new Error('배송 정책 삭제에 실패했습니다.');
    resetApiRetryCount(key);
  } catch (e) { incrementApiRetryCount(key); throw e; }
};
