// 브라우저 감지 유틸리티
export function getBrowserInfo() {
    if (typeof window === 'undefined') return { name: 'unknown', isInApp: false };

    const ua = navigator.userAgent.toLowerCase();

    // 카카오톡 인앱 브라우저
    if (ua.includes('kakaotalk')) {
        return { name: 'kakaotalk', isInApp: true };
    }

    // 네이버 인앱 브라우저
    if (ua.includes('naver')) {
        return { name: 'naver', isInApp: true };
    }

    // iOS Safari
    if (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('crios')) {
        const isIOS = /iphone|ipad|ipod/.test(ua);
        return { name: 'safari', isInApp: false, isIOS };
    }

    // Chrome
    if (ua.includes('chrome') || ua.includes('crios')) {
        return { name: 'chrome', isInApp: false };
    }

    return { name: 'other', isInApp: false };
}

export function getInstallInstructions() {
    const browser = getBrowserInfo();

    if (browser.isInApp) {
        if (browser.name === 'kakaotalk') {
            return {
                canInstall: true,
                title: '카카오톡에서 열기',
                instructions: [
                    '우측 상단 ⋯ 메뉴를 탭하세요',
                    '\'다른 브라우저로 열기\'를 선택하세요',
                    'Safari나 Chrome을 선택하세요',
                    '브라우저에서 홈 화면에 추가하세요'
                ]
            };
        }
        return {
            canInstall: true,
            title: '외부 브라우저에서 열기',
            instructions: [
                '우측 상단 메뉴를 탭하세요',
                '\'외부 브라우저로 열기\'를 선택하세요',
                '브라우저에서 홈 화면에 추가하세요'
            ]
        };
    }

    if (browser.name === 'safari' && browser.isIOS) {
        return {
            canInstall: true,
            title: 'Safari에서 설치하기',
            instructions: [
                '하단 공유 버튼(□↑)을 탭하세요',
                '\'홈 화면에 추가\'를 선택하세요',
                '\'추가\'를 탭하세요'
            ]
        };
    }

    return null;
}
