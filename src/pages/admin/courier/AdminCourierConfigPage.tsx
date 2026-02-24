import React, { useEffect, useState } from 'react';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  getAdminCourierConfig,
  updateAdminCourierConfig,
  AdminCourierConfigResponse,
} from '../../../utils/api';

const DEFAULT_CONFIG: AdminCourierConfigResponse = {
  id: 0,
  enabled: false,
  islandSurcharge: 0,
  noticeText: '',
  senderName: '',
  senderPhone: '',
  senderPhone2: '',
  senderAddress: '',
  senderDetailAddress: '',
};

export default function AdminCourierConfigPage() {
  const { show } = useSnackbar();

  const [config, setConfig] = useState<AdminCourierConfigResponse>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const data = await getAdminCourierConfig();
        if (alive) {
          setConfig({
            ...data,
            noticeText: data.noticeText ?? '',
            senderName: data.senderName ?? '',
            senderPhone: data.senderPhone ?? '',
            senderPhone2: data.senderPhone2 ?? '',
            senderAddress: data.senderAddress ?? '',
            senderDetailAddress: data.senderDetailAddress ?? '',
          });
        }
      } catch (err) {
        safeErrorLog(err, 'AdminCourierConfigPage - loadConfig');
        if (alive) show(getSafeErrorMessage(err, '택배 설정을 불러오지 못했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setConfigLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  const handleConfigSave = async () => {
    setConfigSaving(true);
    try {
      const updated = await updateAdminCourierConfig(config);
      setConfig({
        ...updated,
        noticeText: updated.noticeText ?? '',
        senderName: updated.senderName ?? '',
        senderPhone: updated.senderPhone ?? '',
        senderPhone2: updated.senderPhone2 ?? '',
        senderAddress: updated.senderAddress ?? '',
        senderDetailAddress: updated.senderDetailAddress ?? '',
      });
      show('택배 설정이 저장되었습니다.', { variant: 'success' });
    } catch (err) {
      safeErrorLog(err, 'AdminCourierConfigPage - saveConfig');
      show(getSafeErrorMessage(err, '택배 설정 저장에 실패했습니다.'), { variant: 'error' });
    } finally {
      setConfigSaving(false);
    }
  };

  if (configLoading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24 flex items-center justify-center">
        <p className="text-gray-500">불러오는 중...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24 space-y-6">
      <div className="max-w-lg mx-auto mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">택배 서비스 설정</h1>
          <AdminCourierHeader />
        </div>
      </div>

      {/* 기본 설정 */}
      <section className="max-w-lg mx-auto p-6 bg-white rounded shadow space-y-4">
        <div>
          <h2 className="text-lg font-bold">기본 설정</h2>
          <p className="text-sm text-gray-500 mt-1">택배 서비스 운영에 필요한 기본 설정입니다.</p>
        </div>

        {/* 활성화 토글 */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">택배 서비스 활성화</label>
          <button
            type="button"
            onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
            className={`h-9 w-full rounded font-medium transition text-sm ${
              config.enabled
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-rose-500 hover:bg-rose-600 text-white'
            }`}
          >
            {config.enabled ? '활성화' : '비활성화'}
          </button>
        </div>

        {/* 도서산간 추가비 */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">도서산간 추가비 (원)</label>
          <input
            type="number"
            value={config.islandSurcharge}
            onChange={e => {
              const num = Number(e.target.value);
              if (!Number.isFinite(num) || num < 0) return;
              setConfig(prev => ({ ...prev, islandSurcharge: num }));
            }}
            className="w-full border px-3 py-2 rounded"
            min={0}
            step={100}
          />
        </div>

        {/* 공지사항 */}
        <div className="space-y-1">
          <label className="block text-sm font-medium">공지사항 (선택)</label>
          <textarea
            value={config.noticeText ?? ''}
            onChange={e => setConfig(prev => ({ ...prev, noticeText: e.target.value }))}
            className="w-full border px-3 py-2 rounded min-h-[80px] resize-y"
            placeholder="고객에게 표시될 공지사항을 입력하세요"
            maxLength={500}
          />
          <p className="text-xs text-gray-500 text-right">{(config.noticeText ?? '').length} / 500</p>
        </div>

        <button
          type="button"
          onClick={handleConfigSave}
          disabled={configSaving}
          className="w-full bg-orange-500 text-white py-2.5 rounded hover:bg-orange-600 disabled:bg-gray-300 font-medium"
        >
          {configSaving ? '저장 중...' : '저장'}
        </button>
      </section>

      {/* 발송인 정보 */}
      <section className="max-w-lg mx-auto p-6 bg-white rounded shadow space-y-4">
        <div>
          <h2 className="text-lg font-bold">발송인 정보</h2>
          <p className="text-sm text-gray-500 mt-1">운송장에 표시될 발송인 정보입니다.</p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">보내는 사람 이름</label>
          <input
            type="text"
            value={config.senderName ?? ''}
            onChange={e => setConfig(prev => ({ ...prev, senderName: e.target.value }))}
            className="w-full border px-3 py-2 rounded"
            placeholder="홍길동"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">전화번호</label>
          <input
            type="text"
            value={config.senderPhone ?? ''}
            onChange={e => setConfig(prev => ({ ...prev, senderPhone: e.target.value }))}
            className="w-full border px-3 py-2 rounded"
            placeholder="010-0000-0000"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">전화번호2 (선택)</label>
          <input
            type="text"
            value={config.senderPhone2 ?? ''}
            onChange={e => setConfig(prev => ({ ...prev, senderPhone2: e.target.value }))}
            className="w-full border px-3 py-2 rounded"
            placeholder="02-0000-0000"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">주소</label>
          <input
            type="text"
            value={config.senderAddress ?? ''}
            onChange={e => setConfig(prev => ({ ...prev, senderAddress: e.target.value }))}
            className="w-full border px-3 py-2 rounded"
            placeholder="서울시 강남구 테헤란로 123"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">상세 주소</label>
          <input
            type="text"
            value={config.senderDetailAddress ?? ''}
            onChange={e => setConfig(prev => ({ ...prev, senderDetailAddress: e.target.value }))}
            className="w-full border px-3 py-2 rounded"
            placeholder="101동 101호"
          />
        </div>

        <button
          type="button"
          onClick={handleConfigSave}
          disabled={configSaving}
          className="w-full bg-orange-500 text-white py-2.5 rounded hover:bg-orange-600 disabled:bg-gray-300 font-medium"
        >
          {configSaving ? '저장 중...' : '저장'}
        </button>
      </section>
    </main>
  );
}
