import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSnackbar } from '../components/snackbar';
import { getCurrentEnvironment, safeErrorLog, getSafeErrorMessage } from '../utils/environment';
import { REDIRECT_AFTER_LOGIN_KEY } from '../utils/api';
import { logo, theme } from '../brand';

declare global { interface Window { Kakao: any } }

const KAKAO_SDK_SRC =
  'https://t1.kakaocdn.net/kakao_js_sdk/2.7.6/kakao.min.js';
const KAKAO_SDK_INTEGRITY =
  'sha384-WAtVcQYcmTO/N+C1N+1m6Gp8qxh+3NlnP7X1U7qP6P5dQY/MsRBNTh+e1ahJrkEm';

const JS_KAKAO_KEY = process.env.REACT_APP_JS_KAKAO_KEY!;
const REDIRECT_URI = process.env.REACT_APP_REDIRECT_URI!;
const API_BASE = process.env.REACT_APP_API_BASE || '';

const OAUTH_STATE_KEY = 'kakao_oauth_state_v1';
const AUTH_LOCK_KEY = 'kakao_oauth_lock_v1';
const SILENT_REFRESH_LOCK_KEY = 'oauth_silent_refresh_lock_v1';
const AUTH_START_DELAY_MS = 300;

function genState() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

type LoginSuccess = { name: string; access: string; exists?: boolean; change_name?: boolean };

async function ensureKakaoSDK(jsKey: string) {
  if (window.Kakao?.isInitialized?.()) return;

  if (!document.querySelector(`script[src="${KAKAO_SDK_SRC}"]`)) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = KAKAO_SDK_SRC;
      s.integrity = KAKAO_SDK_INTEGRITY;
      s.crossOrigin = 'anonymous';
      s.onload = () => res();
      s.onerror = () => rej(new Error('Kakao SDK load failed'));
      document.head.appendChild(s);
    });
  }

  if (!window.Kakao) throw new Error('Kakao SDK not available');
  if (!window.Kakao.isInitialized()) window.Kakao.init(jsKey);
}

type AuthState = 'checking' | 'authenticated' | 'unauthenticated';

export default function MainPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();
  const showRef = useRef(show);
  useEffect(() => { showRef.current = show; }, [show]);

  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [authState, setAuthState] = useState<AuthState>('checking');
  const [busy, setBusy] = useState(false);
  const [forceNicknameChange, setForceNicknameChange] = useState(false);

  // SDK preload (PROD only)
  useEffect(() => {
    if (getCurrentEnvironment() !== 'production') return;
    if (!JS_KAKAO_KEY) return;
    ensureKakaoSDK(JS_KAKAO_KEY).catch(() => {});
  }, []);

  // Error message display
  useEffect(() => {
    const errorMessage = localStorage.getItem('user-error-message');
    if (errorMessage) {
      show(errorMessage, { variant: 'error' });
      localStorage.removeItem('user-error-message');
    }
  }, [show]);

  // Silent refresh on mount (no code param)
  useEffect(() => {
    const code = params.get('code');
    if (code) return; // callback handles auth

    // 락이 이미 설정된 경우 (StrictMode 재실행 등) 로컬 토큰으로 판단
    if (sessionStorage.getItem(SILENT_REFRESH_LOCK_KEY) === '1') {
      const access = localStorage.getItem('access');
      if (access) {
        try {
          const payload = JSON.parse(atob(access.split('.')[1] || ''));
          if ((payload?.exp ?? 0) * 1000 - Date.now() > 30_000) {
            setAuthState('authenticated');
            return;
          }
        } catch { /* ignore */ }
      }
      setAuthState('unauthenticated');
      return;
    }
    sessionStorage.setItem(SILENT_REFRESH_LOCK_KEY, '1');

    (async () => {
      try {
        setBusy(true);
        const access = localStorage.getItem('access') || '';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (access) headers.Authorization = `Bearer ${access}`;

        const res = await fetch(`${API_BASE}/api/refresh`, {
          method: 'POST',
          headers,
          credentials: 'include',
        });

        if (res.ok) {
          const newAccess = await res.text();
          localStorage.setItem('access', newAccess);
          setAuthState('authenticated');
          return;
        }
        setAuthState('unauthenticated');
      } catch {
        setAuthState('unauthenticated');
      } finally {
        setBusy(false);
      }
    })();

    return () => {
      sessionStorage.removeItem(SILENT_REFRESH_LOCK_KEY);
    };
  }, [params]);

  // Kakao callback (?code=...)
  useEffect(() => {
    const code = params.get('code');
    const stateFromUrl = params.get('state');
    if (!code) return;

    (async () => {
      try {
        const locked = sessionStorage.getItem(AUTH_LOCK_KEY);
        if (locked === code) return;
        sessionStorage.setItem(AUTH_LOCK_KEY, code);

        setBusy(true);

        const expected = sessionStorage.getItem(OAUTH_STATE_KEY);
        if (!expected || !stateFromUrl || expected !== stateFromUrl) {
          throw new Error('잘못된 요청입니다. (state mismatch)');
        }
        if (AUTH_START_DELAY_MS > 0) {
          await new Promise(res => setTimeout(res, AUTH_START_DELAY_MS));
        }

        const loginUrl = `${API_BASE}/api/login`;
        const res = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, redirect_uri: REDIRECT_URI, state: stateFromUrl }),
        });

        const text = await res.text();
        if (!res.ok) {
          safeErrorLog(
            { message: 'login failed', status: res.status, statusText: res.statusText, body: text, url: loginUrl },
            'MainPage - login response'
          );
          throw new Error('로그인 처리에 실패했습니다.');
        }

        const data: LoginSuccess = JSON.parse(text);
        const needsNicknameChange = data && data.change_name === false;
        if (needsNicknameChange) {
          showRef.current('닉네임 변경이 필요합니다.');
          localStorage.setItem('nickname', '신규 고객');
          setForceNicknameChange(true);
        } else {
          showRef.current(`${data.name}님 환영합니다!`);
          localStorage.setItem('nickname', data.name);
        }
        localStorage.setItem('access', data.access);

        window.history.replaceState({}, '', '/');
        setAuthState('authenticated');
      } catch (e: any) {
        safeErrorLog(e, 'MainPage - login');
        showRef.current(getSafeErrorMessage(e, '로그인 중 오류가 발생했습니다.'), { variant: 'error' });
        window.history.replaceState({}, '', '/');
        setAuthState('unauthenticated');
      } finally {
        setBusy(false);
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem(AUTH_LOCK_KEY);
      }
    })();
  }, [params]);

  // Redirect after login (e.g., from Kakao notification link)
  useEffect(() => {
    if (authState !== 'authenticated') return;
    if (forceNicknameChange) return;
    const redirectUrl = sessionStorage.getItem(REDIRECT_AFTER_LOGIN_KEY);
    if (redirectUrl) {
      sessionStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
      nav(redirectUrl, { replace: true });
    }
  }, [authState, forceNicknameChange, nav]);

  // Kakao login button handler
  const startKakao = useCallback(async () => {
    try {
      setBusy(true);

      // Check existing token exp
      const access = localStorage.getItem('access');
      if (access) {
        try {
          const payload = JSON.parse(atob(access.split('.')[1] || ''));
          const expMs = (payload?.exp ?? 0) * 1000;
          if (expMs - Date.now() > 30_000) {
            setAuthState('authenticated');
            return;
          }
        } catch { /* ignore */ }
      }

      // Dev mode: direct login
      if (getCurrentEnvironment() !== 'production') {
        try {
          const loginUrl = `${API_BASE}/api/login`;
          const res = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              code: 'DUMMY_CODE_FOR_DEV',
              redirect_uri: REDIRECT_URI,
              state: 'DUMMY_STATE_FOR_DEV'
            }),
          });
          const text = await res.text();
          if (!res.ok) {
            safeErrorLog(
              { message: 'dev login failed', status: res.status, statusText: res.statusText, body: text, url: loginUrl },
              'MainPage - dev login response'
            );
            throw new Error('로그인 처리에 실패했습니다.');
          }
          const data: LoginSuccess = JSON.parse(text || '{}');
          if (!data?.access) throw new Error('토큰이 없습니다.');
          const needsNicknameChange = data && data.change_name === false;
          if (needsNicknameChange) {
            showRef.current('닉네임 변경이 필요합니다.');
            localStorage.setItem('nickname', '신규 고객');
            setForceNicknameChange(true);
          } else {
            showRef.current(`${data.name || '사용자'}님 환영합니다!`);
            if (data.name) localStorage.setItem('nickname', data.name);
          }
          localStorage.setItem('access', data.access);
          setAuthState('authenticated');
          return;
        } finally {
          setBusy(false);
        }
      }

      // Prod: Kakao SDK
      if (!JS_KAKAO_KEY) {
        show('카카오 JS 키가 설정되지 않았습니다. (REACT_APP_JS_KAKAO_KEY)', { variant: 'error' });
        return;
      }
      await ensureKakaoSDK(JS_KAKAO_KEY);
      const state = genState();
      sessionStorage.setItem(OAUTH_STATE_KEY, state);

      window.Kakao.Auth.authorize({
        redirectUri: REDIRECT_URI,
        state,
        scope: 'profile_nickname',
      });
    } catch (e: any) {
      safeErrorLog(e, 'MainPage - startKakao');
      show(getSafeErrorMessage(e, '로그인 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [show]);

  // === Checking state ===
  if (authState === 'checking') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <img src={logo} alt={`${theme.displayName} 로고`} className="mx-auto w-20 h-20 mb-4" />
          {busy && <p className="text-gray-500">로그인 확인 중...</p>}
        </div>
      </main>
    );
  }

  // === Authenticated — show selection ===
  if (authState === 'authenticated') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <img src={logo} alt={`${theme.displayName} 로고`} className="mx-auto w-20 h-20 mb-4" />
          <h1 className="text-2xl font-bold mb-8" style={{ color: 'var(--color-primary-500)' }}>
            {theme.displayName}
          </h1>
          <div className="flex flex-col gap-4">
            <button
              onClick={() => nav('/store/products', { state: forceNicknameChange ? { forceNicknameChange: true } : {} })}
              className="w-full py-4 rounded-xl text-lg font-semibold text-white shadow-md hover:shadow-lg transition"
              style={{ backgroundColor: 'var(--color-primary-500)' }}
            >
              매장 예약
            </button>
            <button
              onClick={() => nav('/shop/products')}
              className="w-full py-4 rounded-xl text-lg font-semibold border-2 shadow-md hover:shadow-lg transition"
              style={{ borderColor: 'var(--color-primary-500)', color: 'var(--color-primary-500)' }}
            >
              택배 주문
            </button>
          </div>
        </div>
      </main>
    );
  }

  // === Unauthenticated — show login ===
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <div className="text-center">
          <img src={logo} alt={`${theme.displayName} 로고`} className="mx-auto w-16 h-16" />
          <h1 className="mt-3 text-xl font-bold">{theme.tagline}</h1>
          {theme.description.split('\n').map((line: string, i: number) => (
            <p key={i} className="mt-1 text text-gray-600">{line}</p>
          ))}
        </div>

        {busy && (
          <div className="mt-6 rounded-lg border bg-orange-50 text-orange-700 text-sm p-3">
            로그인 처리 중입니다…
          </div>
        )}

        <button
          type="button"
          onClick={startKakao}
          disabled={busy}
          className="mt-6 w-full rounded-xl overflow-hidden active:scale-[0.99] transition shadow-sm border"
          aria-label="카카오로 로그인"
        >
          <picture>
            <source media="(min-width: 768px)" srcSet="/kakao_login_large.png" />
            <img
              src="/kakao_login_small.png"
              alt="카카오 로그인"
              className={`block w-full h-auto ${busy ? 'opacity-70' : ''}`}
            />
          </picture>
        </button>
      </div>
    </main>
  );
}
