import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Variant = 'success' | 'error' | 'info';
type SnackbarItem = { id: number; message: string; variant: Variant; duration: number };

type Ctx = {
  show: (message: string, opts?: { variant?: Variant; duration?: number }) => void;
  hide: () => void;
};

const SnackbarContext = createContext<Ctx | null>(null);

export function useSnackbar() {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used within <SnackbarProvider>');
  return ctx;
}

export const SnackbarProvider: React.FC<{
  children: React.ReactNode;
  /** 상단 고정바/헤더가 있을 경우 겹침 방지용 여백(px) */
  topOffset?: number;
}> = ({ children, topOffset = 56 }) => {
  const [current, setCurrent] = useState<SnackbarItem | null>(null);
  const queueRef = useRef<SnackbarItem[]>([]);
  const timerRef = useRef<number | null>(null);
  const idRef = useRef(1);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const showNext = useCallback(() => {
    clearTimer();
    const next = queueRef.current.shift() || null;
    setCurrent(next);
    if (next) {
      timerRef.current = window.setTimeout(() => {
        setCurrent(null);
        timerRef.current = null;
        // 다음 큐 자동 재생
        requestAnimationFrame(showNext);
      }, next.duration);
    }
  }, []);

  const show = useCallback<Ctx['show']>((message, opts) => {
    const item: SnackbarItem = {
      id: idRef.current++,
      message,
      variant: opts?.variant ?? 'success',
      duration: Math.max(1200, Math.min(6000, opts?.duration ?? 2500)),
    };
    queueRef.current.push(item);
    if (!current && !timerRef.current) {
      showNext();
    }
  }, [current, showNext]);

  const hide = useCallback(() => {
    clearTimer();
    setCurrent(null);
    // 현재 걸려있던 타이머 취소 후, 큐가 있으면 이어서 재생
    requestAnimationFrame(showNext);
  }, [showNext]);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  const colorByVariant: Record<Variant, string> = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    info:    'bg-gray-800',
  };

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {/* 서버 에러(alert) 구독: 401/403 제외 공통 처리 */}
      <ErrorEventListener onShow={show} />
      {/* Snackbar (상단 고정, 토스트와 달리 FAB 가리지 않음) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed left-0 right-0 z-50 flex justify-center"
        style={{ top: topOffset }}
      >
        <div
          className={`transition-all duration-200 ease-out ${
            current ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'
          }`}
        >
          {current && (
            <div
              role="status"
              className={`pointer-events-auto mx-4 max-w-md rounded-full text-white shadow-lg ${colorByVariant[current.variant]}`}
              onClick={hide}
            >
              <div className="px-4 py-2 text-sm flex items-start gap-2">
                {/* 상태 아이콘(간단) */}
                <span className="text-white/90">
                  {current.variant === 'success' ? '✅' : current.variant === 'error' ? '⚠️' : 'ℹ️'}
                </span>
                <span className="whitespace-pre-line break-words">{current.message}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </SnackbarContext.Provider>
  );
};

// api.ts에서 dispatch하는 'api-error' 이벤트를 수신해 스낵바로 노출
const ErrorEventListener: React.FC<{ onShow: (message: string, opts?: { variant?: Variant; duration?: number }) => void }>= ({ onShow }) => {
  React.useEffect(() => {
    const handler = () => {
      const msg = localStorage.getItem('api-error-message');
      const type = (localStorage.getItem('api-error-type') as Variant) || 'error';
      if (msg) {
        onShow(msg, { variant: type });
        localStorage.removeItem('api-error-message');
        localStorage.removeItem('api-error-type');
      }
    };
    window.addEventListener('api-error', handler as EventListener);
    return () => window.removeEventListener('api-error', handler as EventListener);
  }, [onShow]);
  return null;
};
