// src/pages/auth/LoginPage.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { getCurrentEnvironment } from '../utils/environment';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSnackbar } from '../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../utils/environment';
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

export default function LoginPage() {
  const nav = useNavigate();
  const { show } = useSnackbar();
  const showRef = React.useRef(show);
  useEffect(() => { showRef.current = show; }, [show]);

  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [busy, setBusy] = useState(false);

  // SDK preload (PROD에서만 로드)
  useEffect(() => {
    const env = getCurrentEnvironment();
    if (env !== 'production') return; // dev/local에서는 로드하지 않음
    if (!JS_KAKAO_KEY) return;
    ensureKakaoSDK(JS_KAKAO_KEY).catch(() => {});
  }, []);

  // 에러 메시지 표시(있으면)
  useEffect(() => {
    const errorMessage = localStorage.getItem('user-error-message');
    if (errorMessage) {
      show(errorMessage, { variant: 'error' });
      localStorage.removeItem('user-error-message');
    }
  }, [show]);

  /**
   * ① 페이지 진입 시 조용한 재발급 시도
   * - /login?code=... 콜백 중이 아닐 때만
   * - REFRESH_TOKEN은 httpOnly 쿠키라 JS에서 확인 불가 → 그냥 /api/refresh 호출
   * - Authorization 헤더는 기존 access가 있으면 포함
   * - 성공 시 access 갱신 후 /products 이동
   */
  useEffect(() => {
    const code = params.get('code');
    if (code) return; // 콜백 처리 루틴이 담당

    // StrictMode 재실행/중복 방지 락
    if (sessionStorage.getItem(SILENT_REFRESH_LOCK_KEY) === '1') return;
    sessionStorage.setItem(SILENT_REFRESH_LOCK_KEY, '1');

    (async () => {
      try {
        setBusy(true);
        const access = localStorage.getItem('access') || '';
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (access) headers.Authorization = `Bearer ${access}`;

        const res = await fetch(`${API_BASE}/api/refresh`, {
          method: 'POST',
          headers,
          credentials: 'include', // REFRESH_TOKEN 쿠키 전송
        });

        if (res.ok) {
          const newAccess = await res.text();
          localStorage.setItem('access', newAccess);
          nav('/products', { replace: true });
          return;
        }
        // 실패하면 조용히 넘어가서 카카오 로그인 진행 가능
      } catch (e) {
        // 조용히 무시(로그인 버튼으로 진행)
        safeErrorLog(e, 'LoginPage - silent refresh');
      } finally {
        setBusy(false);
      }
    })();
  }, [params, nav]);

  /**
   * ② 카카오 콜백 처리 (?code=...)
   */
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
          credentials: 'include', // 서버에서 refresh 쿠키 심을 수 있음
          body: JSON.stringify({ code, redirect_uri: REDIRECT_URI, state: stateFromUrl }),
        });

        const text = await res.text();
        if (!res.ok) {
          safeErrorLog(
            { message: 'login failed', status: res.status, statusText: res.statusText, body: text, url: loginUrl },
            'LoginPage - login response'
          );
          throw new Error('로그인 처리에 실패했습니다.');
        }

        const data: LoginSuccess = JSON.parse(text);
        const forceNicknameChange = data && data.change_name === false;
        if (forceNicknameChange) {
          showRef.current('닉네임 변경이 필요합니다.');
          localStorage.setItem('nickname', '신규 고객');
        } else {
          showRef.current(`${data.name}님 환영합니다!`);
          localStorage.setItem('nickname', data.name);
        }
        localStorage.setItem('access', data.access);

        // 주소줄 정리 후 이동
        window.history.replaceState({}, '', '/login');
        nav('/products', { replace: true, state: forceNicknameChange ? { forceNicknameChange: true } : {} });
      } catch (e: any) {
        safeErrorLog(e, 'LoginPage - login');
        showRef.current(getSafeErrorMessage(e, '로그인 중 오류가 발생했습니다.'), { variant: 'error' });
        window.history.replaceState({}, '', '/login');
      } finally {
        setBusy(false);
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem(AUTH_LOCK_KEY);
      }
    })();
  }, [params, nav]);

  /**
   * ③ 카카오 로그인 버튼
   * - (선택) access 토큰이 로컬 exp 기준으로 충분히 남아 있으면 바로 /products
   * - 아니면 카카오 OAuth 시작
   */
  const startKakao = useCallback(async () => {
    try {
      setBusy(true);

      // (선택) 보호 API 호출 없이, 로컬 exp만 빠르게 확인
      const access = localStorage.getItem('access');
      if (access) {
        try {
          const payload = JSON.parse(atob(access.split('.')[1] || ''));
          const expMs = (payload?.exp ?? 0) * 1000;
          if (expMs - Date.now() > 30_000) {
            nav('/products', { replace: true });
            return;
          }
        } catch {
          // 파싱 실패 시 그냥 카카오 진행
        }
      }

      // 비-PROD 환경: 서버 /api/login 바로 호출 (SDK 미사용)
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
              'LoginPage - dev login response'
            );
            throw new Error('로그인 처리에 실패했습니다.');
          }
          const data: LoginSuccess = JSON.parse(text || '{}');
          if (!data?.access) throw new Error('토큰이 없습니다.');
          const forceNicknameChange = data && data.change_name === false;
          if (forceNicknameChange) {
            showRef.current('닉네임 변경이 필요합니다.');
            localStorage.setItem('nickname', '신규 고객');
          } else {
            showRef.current(`${data.name || '사용자'}님 환영합니다!`);
            if (data.name) localStorage.setItem('nickname', data.name);
          }
          localStorage.setItem('access', data.access);
          nav('/products', { replace: true, state: forceNicknameChange ? { forceNicknameChange: true } : {} });
          return;
        } finally {
          setBusy(false);
        }
      }
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
      safeErrorLog(e, 'LoginPage - startKakao');
      show(getSafeErrorMessage(e, '로그인 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [show, nav]);

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