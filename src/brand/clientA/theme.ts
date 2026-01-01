// src/brand/clientA/theme.ts
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
}

export const theme: BrandTheme = {
    name: 'clientA',
    displayName: 'Fresh Market',
    tagline: '🍓Fresh Market - Premium Selection🍓',
    description: 'Experience the finest quality\nYour trusted fresh produce partner',
    companyName: 'Fresh Market Inc.',
    copyright: '© 2025 Fresh Market',
    contact: {
        representative: 'John Doe',
        businessNumber: '123-45-67890',
        phone: '02-1234-5678',
    },
    links: {
        kakaoOpenChat: 'https://open.kakao.com/o/example1',
        kakaoSupport: 'https://open.kakao.com/o/example2',
        directions: 'https://naver.me/example',
    },
    config: {
        apiBase: process.env.REACT_APP_API_BASE || '',
        kakaoJsKey: process.env.REACT_APP_JS_KAKAO_KEY || '',
        redirectUri: process.env.REACT_APP_REDIRECT_URI || '',
        gaKey: process.env.REACT_APP_GA_KEY || '',
        imgUrl: process.env.REACT_APP_IMG_URL || 'https://freshmarket.example.com',
    },
    colors: {
        primary: {
            50: '#fef2f2',
            100: '#fee2e2',
            200: '#fecaca',
            300: '#fca5a5',
            400: '#f87171',
            500: '#ef4444',
            600: '#dc2626',
            700: '#b91c1c',
            800: '#991b1b',
            900: '#7f1d1d',
            950: '#450a0a',
        },
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
