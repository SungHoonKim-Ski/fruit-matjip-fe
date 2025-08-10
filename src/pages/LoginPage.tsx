// src/pages/auth/LoginPage.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSnackbar } from '../components/snackbar'; 

declare global { interface Window { Kakao: any } }

const KAKAO_SDK_SRC =
  'https://t1.kakaocdn.net/kakao_js_sdk/2.7.6/kakao.min.js';
const KAKAO_SDK_INTEGRITY =
  'sha384-WAtVcQYcmTO/N+C1N+1m6Gp8qxh+3NlnP7X1U7qP6P5dQY/MsRBNTh+e1ahJrkEm';


const JS_KAKAO_KEY = process.env.REACT_APP_JS_KAKAO_KEY;
const REDIRECT_URI = process.env.REACT_APP_REDIRECT_URI;
const API_BASE = process.env.REACT_APP_API_BASE;

const OAUTH_STATE_KEY = 'kakao_oauth_state_v1';
// 중복 요청 방지용 (StrictMode 재마운트/이펙트 재실행 대비)
const AUTH_LOCK_KEY = 'kakao_oauth_lock_v1';
const AUTH_START_DELAY_MS = 300;

function genState() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

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
  // show의 참조가 바뀌어도 콜백 이펙트가 재실행되지 않도록 ref로 고정 사용
  const showRef = React.useRef(show);
  useEffect(() => { showRef.current = show; }, [show]);
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [busy, setBusy] = useState(false);

  // SDK preload
  useEffect(() => {
    if (!JS_KAKAO_KEY) return;
    ensureKakaoSDK(JS_KAKAO_KEY).catch(() => {});
  }, []);

  // 콜백 처리 (?code=...)
  useEffect(() => {
    const code = params.get('code');
    const stateFromUrl = params.get('state');
    if (!code) return;

    (async () => {
      try {
        // 중복 호출 방지: 세션 락 체크
        const locked = sessionStorage.getItem(AUTH_LOCK_KEY);
        if (locked === code) return;
        sessionStorage.setItem(AUTH_LOCK_KEY, code);

        setBusy(true);

        const expected = sessionStorage.getItem(OAUTH_STATE_KEY);
        if (expected && stateFromUrl && expected !== stateFromUrl) {
          throw new Error('잘못된 요청입니다. (state mismatch)');
        }
        // 너무 빠른 연속 트리거 방지용 소량의 지연
        if (AUTH_START_DELAY_MS > 0) {
          await new Promise(res => setTimeout(res, AUTH_START_DELAY_MS));
        }
        
        const res = await fetch(`${API_BASE}/auth/kakao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, redirectUri: REDIRECT_URI, state: stateFromUrl }),
        });

        if (!res.ok) throw new Error('로그인 처리에 실패했습니다.');

        const data = await res.json() as { id: number; nickname: string; next?: string };
        showRef.current(`${data.nickname}님 환영합니다!`);
        
        window.history.replaceState({}, '', '/login');
        
        nav(data.next || '/shop', { replace: true });
      } catch (e: any) {
        showRef.current(e?.message || '로그인 중 오류가 발생했습니다.', { variant: 'error' });
        window.history.replaceState({}, '', '/login');
      } finally {
        setBusy(false);
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem(AUTH_LOCK_KEY);
      }
    })();
  }, [params, nav]);

  const startKakao = useCallback(async () => {
    try {
      if (!JS_KAKAO_KEY) {
        show('카카오 JS 키가 설정되지 않았습니다. (REACT_APP_KAKAO_JAVASCRIPT_KEY)', { variant: 'error' });
        return;
      }
      await ensureKakaoSDK(JS_KAKAO_KEY);
      const state = genState();
      sessionStorage.setItem(OAUTH_STATE_KEY, state);

      window.Kakao.Auth.authorize({
        redirectUri: REDIRECT_URI, // 콘솔 등록값과 완전히 동일
        state,
        scope: 'profile_nickname', // 필요한 스코프
      });
    } catch (e: any) {
      show(e?.message || '카카오 인증 시작 실패', { variant: 'error' });
    }
  }, [show]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold text-center">로그인</h1>
        <p className="text-sm text-gray-500 text-center mt-1">카카오로 간편 로그인</p>

        {busy && (
          <div className="mt-6 rounded-lg border bg-orange-50 text-orange-700 text-sm p-3">
            카카오와 통신 중입니다…
          </div>
        )}

        <button
          type="button"
          onClick={startKakao}
          disabled={busy}
          className={`mt-6 w-full h-12 rounded-xl border shadow-sm active:scale-[0.99] transition
            ${busy ? 'bg-gray-200' : 'bg-[#FEE500] hover:brightness-95'}`}
        >
          <span className="text-black font-semibold">카카오로 시작하기</span>
        </button>
      </div>
    </main>
  );
}