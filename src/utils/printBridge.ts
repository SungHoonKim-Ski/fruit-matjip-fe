// printBridge.ts
// 로컬 프린터 브릿지 서버와 통신하는 유틸리티
// Chrome은 http://127.0.0.1을 secure context로 취급하므로
// HTTPS 사이트에서도 Mixed Content 경고 없이 호출 가능
// (localhost는 브라우저마다 다르지만 127.0.0.1은 표준 예외)

const PRINTER_URL = 'http://127.0.0.1:18181';

// 영수증 출력 요청 데이터 타입
export interface PrintReceiptData {
  orderId: number;
  paidAt: string; // ISO datetime 문자열
  deliveryHour: number;
  deliveryMinute: number;
  buyerName: string;
  phone: string;
  items: { productName: string; quantity: number; amount: number }[];
  totalProductAmount: number;
  deliveryFee: number;
  distanceKm: number;
  address1: string;
  address2?: string;
}

/**
 * 로컬 프린터 브릿지 서버에 영수증 출력 요청
 *
 * @param data 영수증 출력 데이터
 * @returns 성공 시 true, 실패 시 false
 *
 * 기술적 판단 근거:
 * - timeout 3초: 로컬 서버 응답은 수백ms 이내여야 정상. 프린터 미연결/서버 중단 시 빠른 실패 필요
 * - AbortController: fetch는 기본 timeout이 없으므로 명시적 중단 필요
 * - console.warn: 프린터 연결 실패는 치명적 에러가 아니므로 warn 레벨 사용
 * - CORS: 브릿지 서버가 Access-Control-Allow-Origin: * 헤더를 반환해야 함 (로컬이므로 보안 문제 없음)
 */
export async function printReceipt(data: PrintReceiptData): Promise<boolean> {
  // AbortController로 3초 timeout 구현
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${PRINTER_URL}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
      // credentials: 'omit' — 로컬 서버에 쿠키 불필요 (기본값이지만 명시)
      credentials: 'omit',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[printBridge] 프린터 출력 실패: HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    clearTimeout(timeoutId);

    // AbortError는 timeout, 나머지는 네트워크/CORS 에러
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn('[printBridge] 프린터 출력 timeout (3초 초과)');
      } else {
        console.warn('[printBridge] 프린터 출력 실패:', error.message);
      }
    }

    return false;
  }
}

/**
 * 로컬 프린터 브릿지 서버 Health Check
 *
 * @returns 서버가 정상 응답하면 true, 실패 시 false
 *
 * 사용 시나리오:
 * - 관리자 페이지 진입 시 프린터 연결 상태 확인
 * - 출력 전 사전 검증 (옵션)
 */
export async function checkPrinterHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${PRINTER_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[printBridge] Health check 실패: HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn('[printBridge] Health check timeout (3초 초과)');
      } else {
        console.warn('[printBridge] Health check 실패:', error.message);
      }
    }

    return false;
  }
}
