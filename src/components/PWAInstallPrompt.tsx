import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function PWAInstallPrompt() {
    const { isInstallable, promptInstall } = usePWAInstall();
    const [showBanner, setShowBanner] = useState(true);

    const handleInstallClick = async () => {
        const accepted = await promptInstall();
        if (accepted) {
            setShowBanner(false);
        }
    };

    const handleDismiss = () => {
        setShowBanner(false);
        localStorage.setItem('pwa-install-dismissed', 'true');
    };

    // 사용자가 이전에 배너를 닫았는지 확인
    const dismissed = typeof window !== 'undefined' && localStorage.getItem('pwa-install-dismissed');

    if (!isInstallable || !showBanner || dismissed) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
            <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 mb-1">
                            앱으로 설치하기
                        </h3>
                        <p className="text-xs text-gray-600 mb-3">
                            홈 화면에 추가하여 더 빠르고 편리하게 이용하세요
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleInstallClick}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                설치하기
                            </button>
                            <button
                                onClick={handleDismiss}
                                className="px-3 text-gray-500 hover:text-gray-700 text-sm"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
