import React, { useEffect, useState } from 'react';
import { useSnackbar } from '../../../components/snackbar';
import AdminCourierHeader from '../../../components/AdminCourierHeader';
import { safeErrorLog, getSafeErrorMessage } from '../../../utils/environment';
import {
  getAdminCourierConfig,
  updateAdminCourierConfig,
  getAdminCourierShippingFeePolicies,
  updateAdminCourierShippingFeePolicies,
  getAdminCourierShippingFeeTemplates,
  createAdminCourierShippingFeeTemplate,
  updateAdminCourierShippingFeeTemplate,
  deleteAdminCourierShippingFeeTemplate,
  AdminCourierConfigResponse,
  ShippingFeePolicyResponse,
  ShippingFeeTemplateResponse,
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

const DEFAULT_POLICY: ShippingFeePolicyResponse = {
  id: null,
  minQuantity: 0,
  maxQuantity: 0,
  fee: 0,
  sortOrder: 0,
};

const DEFAULT_TEMPLATE_FORM = {
  name: '',
  baseFee: 0,
  perQuantityFee: '' as string | number,
  freeShippingMinAmount: '' as string | number,
  sortOrder: 0,
};

type TemplateForm = typeof DEFAULT_TEMPLATE_FORM;

const formatPrice = (amount: number | null | undefined) =>
  amount != null ? amount.toLocaleString('ko-KR') + '원' : '-';

export default function AdminCourierConfigPage() {
  const { show } = useSnackbar();

  const [config, setConfig] = useState<AdminCourierConfigResponse>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  const [policies, setPolicies] = useState<ShippingFeePolicyResponse[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [policiesSaving, setPoliciesSaving] = useState(false);

  const [templates, setTemplates] = useState<ShippingFeeTemplateResponse[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateModalMode, setTemplateModalMode] = useState<'create' | 'edit'>('create');
  const [templateModalForm, setTemplateModalForm] = useState<TemplateForm>(DEFAULT_TEMPLATE_FORM);

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

    (async () => {
      try {
        const data = await getAdminCourierShippingFeePolicies();
        if (alive) setPolicies(data.policies ?? []);
      } catch (err) {
        safeErrorLog(err, 'AdminCourierConfigPage - loadPolicies');
        if (alive) show(getSafeErrorMessage(err, '배송비 정책을 불러오지 못했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setPoliciesLoading(false);
      }
    })();

    (async () => {
      try {
        const data = await getAdminCourierShippingFeeTemplates();
        if (alive) setTemplates(data.templates ?? []);
      } catch (err) {
        safeErrorLog(err, 'AdminCourierConfigPage - loadTemplates');
        if (alive) show(getSafeErrorMessage(err, '배송 정책을 불러오지 못했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setTemplatesLoading(false);
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

  const handlePolicySave = async () => {
    setPoliciesSaving(true);
    try {
      const data = await updateAdminCourierShippingFeePolicies(policies);
      setPolicies(data.policies ?? []);
      show('배송비 정책이 저장되었습니다.', { variant: 'success' });
    } catch (err) {
      safeErrorLog(err, 'AdminCourierConfigPage - savePolicies');
      show(getSafeErrorMessage(err, '배송비 정책 저장에 실패했습니다.'), { variant: 'error' });
    } finally {
      setPoliciesSaving(false);
    }
  };

  const addPolicy = () => {
    setPolicies(prev => [
      ...prev,
      { ...DEFAULT_POLICY, sortOrder: prev.length },
    ]);
  };

  const removePolicy = (index: number) => {
    setPolicies(prev => prev.filter((_, i) => i !== index));
  };

  const updatePolicy = (index: number, field: keyof ShippingFeePolicyResponse, value: unknown) => {
    setPolicies(prev =>
      prev.map((p, i) => i === index ? { ...p, [field]: value } : p)
    );
  };

  const buildTemplatePayload = (form: TemplateForm): Omit<ShippingFeeTemplateResponse, 'id'> => ({
    name: form.name,
    baseFee: Number(form.baseFee) || 0,
    perQuantityFee: form.perQuantityFee === '' ? null : Number(form.perQuantityFee),
    freeShippingMinAmount: form.freeShippingMinAmount === '' ? null : Number(form.freeShippingMinAmount),
    sortOrder: Number(form.sortOrder) || 0,
  });

  const openCreateModal = () => {
    setTemplateModalMode('create');
    setTemplateModalForm(DEFAULT_TEMPLATE_FORM);
    setTemplateModalOpen(true);
  };

  const openEditModal = (t: ShippingFeeTemplateResponse) => {
    setEditingTemplateId(t.id);
    setTemplateModalMode('edit');
    setTemplateModalForm({
      name: t.name,
      baseFee: t.baseFee,
      perQuantityFee: t.perQuantityFee ?? '',
      freeShippingMinAmount: t.freeShippingMinAmount ?? '',
      sortOrder: t.sortOrder,
    });
    setTemplateModalOpen(true);
  };

  const handleCreateTemplate = async () => {
    if (!templateModalForm.name.trim()) {
      show('템플릿 이름을 입력해주세요.', { variant: 'error' });
      return;
    }
    setTemplateSaving(true);
    try {
      const created = await createAdminCourierShippingFeeTemplate(buildTemplatePayload(templateModalForm));
      setTemplates(prev => [...prev, created]);
      setTemplateModalOpen(false);
      show('배송 정책이 추가되었습니다.', { variant: 'success' });
    } catch (err) {
      safeErrorLog(err, 'AdminCourierConfigPage - createTemplate');
      show(getSafeErrorMessage(err, '배송 정책 생성에 실패했습니다.'), { variant: 'error' });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (editingTemplateId === null) return;
    if (!templateModalForm.name.trim()) {
      show('템플릿 이름을 입력해주세요.', { variant: 'error' });
      return;
    }
    setTemplateSaving(true);
    try {
      const updated = await updateAdminCourierShippingFeeTemplate(editingTemplateId, buildTemplatePayload(templateModalForm));
      setTemplates(prev => prev.map(t => t.id === editingTemplateId ? updated : t));
      setEditingTemplateId(null);
      setTemplateModalOpen(false);
      show('배송 정책이 수정되었습니다.', { variant: 'success' });
    } catch (err) {
      safeErrorLog(err, 'AdminCourierConfigPage - updateTemplate');
      show(getSafeErrorMessage(err, '배송 정책 수정에 실패했습니다.'), { variant: 'error' });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('이 배송 정책을 삭제하시겠습니까?')) return;
    try {
      await deleteAdminCourierShippingFeeTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (editingTemplateId === id) setEditingTemplateId(null);
      show('배송 정책이 삭제되었습니다.', { variant: 'success' });
    } catch (err) {
      safeErrorLog(err, 'AdminCourierConfigPage - deleteTemplate');
      show(getSafeErrorMessage(err, '배송 정책 삭제에 실패했습니다.'), { variant: 'error' });
    }
  };

  if (configLoading || policiesLoading || templatesLoading) {
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

      {/* 배송 정책 */}
      <section className="max-w-lg mx-auto p-6 bg-white rounded shadow space-y-4">
        <div>
          <h2 className="text-lg font-bold">배송 정책</h2>
          <p className="text-sm text-gray-500 mt-1">상품별로 지정할 수 있는 배송비 정책입니다. 상품 등록/수정 시 선택할 수 있습니다.</p>
        </div>

        <div className="space-y-3">
          {templates.length === 0 && (
            <div className="text-center text-gray-400 py-6 border rounded-lg">
              등록된 배송 정책이 없습니다.
            </div>
          )}
          {templates.map(t => (
            <div key={t.id} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{t.name}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(t)}
                    className="px-3 py-1 rounded text-xs border border-orange-400 text-orange-500 hover:bg-orange-50 font-medium"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(t.id)}
                    className="px-3 py-1 rounded text-xs bg-red-500 hover:bg-red-600 text-white font-medium"
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
                <span>기본 배송비: {formatPrice(t.baseFee)}</span>
                <span>수량당 추가: {t.perQuantityFee != null ? formatPrice(t.perQuantityFee) : '-'}</span>
                <span>무료배송 기준: {t.freeShippingMinAmount != null ? formatPrice(t.freeShippingMinAmount) : '-'}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="w-full border border-orange-500 text-orange-500 py-2 rounded hover:bg-orange-50 font-medium text-sm"
        >
          + 정책 추가
        </button>
      </section>

      {/* 수량별 배송비 */}
      <section className="max-w-lg mx-auto p-6 bg-white rounded shadow space-y-4">
        <div>
          <h2 className="text-lg font-bold">수량별 배송비</h2>
          <p className="text-sm text-gray-500 mt-1">주문 수량 구간에 따라 자동 적용되는 배송비입니다. 배송 정책이 지정되지 않은 상품에 적용됩니다.</p>
        </div>

        <div className="space-y-3">
          {policies.length === 0 && (
            <div className="text-center text-gray-400 py-6 border rounded-lg">
              등록된 수량별 배송비가 없습니다.
            </div>
          )}
          {policies.map((policy, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">최소 수량</label>
                  <input
                    type="number"
                    value={policy.minQuantity}
                    onChange={e => updatePolicy(index, 'minQuantity', Number(e.target.value))}
                    className="w-full border px-3 py-2 rounded text-sm"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">최대 수량</label>
                  <input
                    type="number"
                    value={policy.maxQuantity}
                    onChange={e => updatePolicy(index, 'maxQuantity', Number(e.target.value))}
                    className="w-full border px-3 py-2 rounded text-sm"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">배송비 (원)</label>
                  <input
                    type="number"
                    value={policy.fee}
                    onChange={e => updatePolicy(index, 'fee', Number(e.target.value))}
                    className="w-full border px-3 py-2 rounded text-sm"
                    min={0} step={100}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removePolicy(index)}
                    className="h-[38px] px-3 rounded bg-red-500 hover:bg-red-600 text-white text-xs font-medium w-full"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={addPolicy}
            className="flex-1 border border-orange-500 text-orange-500 py-2 rounded hover:bg-orange-50 font-medium text-sm"
          >
            + 구간 추가
          </button>
          <button
            type="button"
            onClick={handlePolicySave}
            disabled={policiesSaving}
            className="flex-1 bg-orange-500 text-white py-2 rounded hover:bg-orange-600 disabled:bg-gray-300 font-medium text-sm"
          >
            {policiesSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </section>

      {/* 배송 정책 모달 */}
      {templateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold">
              {templateModalMode === 'create' ? '배송 정책 추가' : '배송 정책 수정'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">정책 이름</label>
                <input
                  type="text"
                  value={templateModalForm.name}
                  onChange={e => setTemplateModalForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border px-3 py-2 rounded text-sm"
                  placeholder="정책 이름"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">기본 배송비 (원)</label>
                <input
                  type="number"
                  value={templateModalForm.baseFee}
                  onChange={e => setTemplateModalForm(prev => ({ ...prev, baseFee: Number(e.target.value) || 0 }))}
                  className="w-full border px-3 py-2 rounded text-sm"
                  min={0} step={100}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">수량당 추가비 (원, 선택)</label>
                <input
                  type="number"
                  value={templateModalForm.perQuantityFee}
                  onChange={e => setTemplateModalForm(prev => ({ ...prev, perQuantityFee: e.target.value }))}
                  className="w-full border px-3 py-2 rounded text-sm"
                  min={0} step={100} placeholder="미입력 시 없음"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">무료배송 기준금액 (원, 선택)</label>
                <input
                  type="number"
                  value={templateModalForm.freeShippingMinAmount}
                  onChange={e => setTemplateModalForm(prev => ({ ...prev, freeShippingMinAmount: e.target.value }))}
                  className="w-full border px-3 py-2 rounded text-sm"
                  min={0} step={1000} placeholder="미입력 시 없음"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50 text-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateModalMode === 'create') handleCreateTemplate();
                  else handleUpdateTemplate();
                }}
                disabled={templateSaving}
                className="flex-1 h-10 rounded bg-orange-500 text-white hover:bg-orange-600 disabled:bg-gray-300 font-medium text-sm"
              >
                {templateSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
