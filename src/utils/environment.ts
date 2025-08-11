/**
 * 환경 체크 및 안전한 에러 처리 유틸리티
 */

// 환경 타입 정의
export type Environment = 'dev' | 'production' | 'local';

// 현재 환경 확인
export const getCurrentEnvironment = (): Environment => {
  // CI/CD에서 설정한 REACT_APP_NODE_ENV 우선 확인
  if (process.env.REACT_APP_NODE_ENV === 'PROD') {
    return 'production';
  } else if (process.env.REACT_APP_NODE_ENV === 'DEV') {
    return 'dev';
  } else {
    return 'local'
  }
  
};

// 개발 환경인지 확인 (dev 또는 local)
export const isDevelopment = (): boolean => {
  const env = getCurrentEnvironment();
  return env === 'dev' || env === 'local';
};

// 프로덕션 환경인지 확인
export const isProduction = (): boolean => {
  return getCurrentEnvironment() === 'production';
};

// 로컬 환경인지 확인 (dev 또는 환경변수가 설정되지 않은 경우)
export const isLocal = (): boolean => {
  return isDevelopment() || !process.env.REACT_APP_API_BASE;
};

// 안전한 에러 로깅
export const safeErrorLog = (error: any, context: string = 'Unknown error'): void => {
  if (isLocal()) {
    // 로컬/개발 환경: 상세 에러 로깅
    console.error(`[${context}]`, {
      message: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      error
    });
  } else {
    // 프로덕션 환경: 최소한의 로깅만 (민감한 정보 제외)
    console.error(`[${context}] Error occurred at ${new Date().toISOString()}`);
  }
};

// 사용자에게 표시할 안전한 에러 메시지 생성
export const getSafeErrorMessage = (error: any, defaultMessage: string = '요청을 처리하는 중 오류가 발생했습니다.'): string => {
  // 프로덕션 환경에서는 항상 기본 메시지 사용
  if (isProduction()) {
    return defaultMessage;
  }
  
  // 로컬/개발 환경에서만 에러 타입별 메시지 제공
  if (error?.message) {
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return '네트워크 연결을 확인해주세요.';
    } else if (error.message.includes('401')) {
      return '인증이 필요합니다. 다시 로그인해주세요.';
    } else if (error.message.includes('403')) {
      return '접근 권한이 없습니다.';
    } else if (error.message.includes('404')) {
      return '요청한 리소스를 찾을 수 없습니다.';
    } else if (error.message.includes('500')) {
      return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message.includes('JSON')) {
      return '서버 응답 형식이 올바르지 않습니다.';
    }
  }
  
  return defaultMessage;
};
