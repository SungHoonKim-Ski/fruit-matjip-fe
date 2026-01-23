// src/brand/fruit-matjip/theme.ts
export interface BrandTheme {
    name: string;
    displayName: string;
    tagline: string;
    description: string;
    companyName: string;
    copyright: string;
    contact: {
        representative: string;
        businessNumber: string;
        phone: string;
        address?: string;
    };
    links: {
        kakaoOpenChat?: string;
        kakaoSupport?: string;
        directions?: string;
    };
    config: {
        apiBase: string;
        kakaoJsKey: string;
        redirectUri: string;
        gaKey: string;
        imgUrl: string;
        hideTagline?: boolean;
        reservationDeadline: string;
        cancellationDeadline: string;
        pickupDeadline: string;
    };
    colors: {
        primary: {
            50: string;
            100: string;
            200: string;
            300: string;
            400: string;
            500: string;
            600: string;
            700: string;
            800: string;
            900: string;
            950: string;
        };
    };
    metadata: {
        title: string;
        description: string;
        ogTitle: string;
        ogDescription: string;
        themeColor: string;
        manifestName: string;
        manifestFullName: string;
    };
}

export const theme: BrandTheme = {
    name: 'fruit-matjip',
    displayName: '과일맛집 1995',
    tagline: '🎁과일맛집1995 현장예약🎁',
    description: '더욱 혜택넘치는 가격으로\n우리들끼리 예약하고 먹자구요🤣',
    companyName: '과일맛집 1995',
    copyright: '© 과일맛집 1995',
    contact: {
        representative: '김지훈',
        businessNumber: '131-47-00411',
        phone: '02-2666-7412',
        address: '',
    },
    links: {
        kakaoOpenChat: 'https://open.kakao.com/o/gX73w4Yg',
        kakaoSupport: 'https://open.kakao.com/o/sfAUFYeh',
        directions: 'https://naver.me/FmfPi8Y8',
    },
    config: {
        apiBase: process.env.REACT_APP_API_BASE || '',
        kakaoJsKey: process.env.REACT_APP_JS_KAKAO_KEY || '',
        redirectUri: process.env.REACT_APP_REDIRECT_URI || '',
        gaKey: process.env.REACT_APP_GA_KEY || '',
        imgUrl: process.env.REACT_APP_IMG_URL || 'https://onuljang.store',
        hideTagline: true,
        reservationDeadline: '19:30',
        cancellationDeadline: '19:00',
        pickupDeadline: '20:00',
    },
    colors: {
        primary: {
            50: '#f0fdf4',
            100: '#dcfce7',
            200: '#bbf7d0',
            300: '#86efac',
            400: '#4ade80',
            500: '#3D7A5A',
            600: '#357A4D',
            700: '#2D6A42',
            800: '#255A37',
            900: '#1D4A2C',
            950: '#0f3a1f',
        },
    },
    metadata: {
        title: '과일맛집 1995',
        description: '🎁과일맛집1995 현장예약🎁 더욱 혜택넘치는 가격으로 우리들끼리 예약하고 먹자구요!',
        ogTitle: '과일맛집 1995 현장예약',
        ogDescription: '신선한 과일을 가장 합리적인 가격에 이웃과 함께! 지금 예약하세요.',
        themeColor: '#3D7A5A',
        manifestName: '과일맛집',
        manifestFullName: '과일맛집 1995 현장예약',
    },
};

// CSS Variables mapping for runtime injection
export const cssVariables: Record<string, string> = {
    '--color-primary-50': theme.colors.primary[50],
    '--color-primary-100': theme.colors.primary[100],
    '--color-primary-200': theme.colors.primary[200],
    '--color-primary-300': theme.colors.primary[300],
    '--color-primary-400': theme.colors.primary[400],
    '--color-primary-500': theme.colors.primary[500],
    '--color-primary-600': theme.colors.primary[600],
    '--color-primary-700': theme.colors.primary[700],
    '--color-primary-800': theme.colors.primary[800],
    '--color-primary-900': theme.colors.primary[900],
    '--color-primary-950': theme.colors.primary[950],
};
