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
  active: true,
};

const DEFAULT_TEMPLATE_FORM = {
  name: '',
  baseFee: 0,
  perQuantityFee: '' as string | number,
  freeShippingMinAmount: '' as string | number,
  active: true,
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
  const [editingTemplateForm, setEditingTemplateForm] = useState<TemplateForm>(DEFAULT_TEMPLATE_FORM);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateForm, setNewTemplateForm] = useState<TemplateForm>(DEFAULT_TEMPLATE_FORM);
  const [templateSaving, setTemplateSaving] = useState(false);

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
        if (alive) show(getSafeErrorMessage(err, '배송비 템플릿을 불러오지 못했습니다.'), { variant: 'error' });
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
    active: form.active,
    sortOrder: Number(form.sortOrder) || 0,
  });

  const handleCreateTemplate = async () => {
    if (!newTemplateForm.name.trim()) {
      show('템플릿 이름을 입력해주세요.', { variant: 'error' });
      return;
    }
    setTemplateSaving(true);
    try {
      const created = await createAdminCourierShippingFeeTemplate(buildTemplatePayload(newTemplateForm));
      setTemplates(prev => [...prev, created]);
      setShowNewTemplate(false);
      setNewTemplateForm(DEFAULT_TEMPLATE_FORM);
      show('배송비 템플릿이 추가되었습니다.', { variant: 'success' });
    } catch (err) {
      safeErrorLog(err, 'AdminCourierConfigPage - createTemplate');
      show(getSafeErrorMessage(err, '배송비 템플릿 생성에 실패했습니다.'), { variant: 'error' });
    } finally {
      setTemplateSaving(false);
    }
  };

  const startEditTemplate = (t: ShippingFeeTemplateResponse) => {
    setEditingTemplateId(t.id);
    setEditingTemplateForm({
      name: t.name,
      baseFee: t.baseFee,
      perQuantityFee: t.perQuantityFee ?? '',
      freeShippingMinAmount: t.freeShippingMinAmount ?? '',
      active: t.active,
      sortOrder: t.sortOrder,
    });
  };

  const handleUpdateTemplate = async () => {
    if (editingTemplateId === null) return;
    if (!editingTemplateForm.name.trim()) {
      show('템플릿 이름을 입력해주세요.', { variant: 'error' });
      return;
    }
    setTemplateSaving(true);
    try {
      const updated = await updateAdminCourierShippingFeeTemplate(editingTemplateId, buildTemplatePayload(editingTemplateForm));
      setTemplates(prev => prev.map(t => t.id === editingTemplateId ? updated : t));
      setEditingTemplateId(null);
      show('배송비 템플릿이 수정되었습니다.', { variant: 'success' });
    } catch (err) {
      safeErrorLog(err, 'AdminCourierConfigPage - updateTemplate');
      show(getSafeErrorMessage(err, '배송비 템플릿 수정에 실패했습니다.'), { variant: 'error' });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('이 배송비 템플릿을 삭제하시겠습니까?')) return;
    try {
      await deleteAdminCourierShippingFeeTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (editingTemplateId === id) setEditingTemplateId(null);
      show('배송비 템플릿이 삭제되었습니다.', { variant: 'success' });
    } catch (err) {
      safeErrorLog(err, 'AdminCourierConfigPage - deleteTemplate');
      show(getSafeErrorMessage(err, '배송비 템플릿 삭제에 실패했습니다.'), { variant: 'error' });
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
      <div className="max-w-md mx-auto mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">택배 서비스 설정</h1>
          <AdminCourierHeader />
        </div>
      </div>

      {/* 택배 서비스 설정 */}
      <section className="max-w-md mx-auto p-6 bg-white rounded shadow space-y-4">

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
      </section>

      {/* 발송인 정보 */}
      <section className="max-w-md mx-auto p-6 bg-white rounded shadow space-y-4">
        <h2 className="text-xl font-bold">발송인 정보</h2>

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

      {/* 배송비 템플릿 */}
      <section className="max-w-2xl mx-auto p-6 bg-white rounded shadow space-y-4">
        <h2 className="text-xl font-bold">배송비 템플릿</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border px-2 py-2 font-medium">이름</th>
                <th className="border px-2 py-2 font-medium">기본배송비</th>
                <th className="border px-2 py-2 font-medium">수량당추가</th>
                <th className="border px-2 py-2 font-medium">무료배송기준</th>
                <th className="border px-2 py-2 font-medium">활성</th>
                <th className="border px-2 py-2 font-medium">순서</th>
                <th className="border px-2 py-2 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && !showNewTemplate && (
                <tr>
                  <td colSpan={7} className="border px-2 py-4 text-center text-gray-400">
                    등록된 배송비 템플릿이 없습니다.
                  </td>
                </tr>
              )}
              {templates.map(t => (
                editingTemplateId === t.id ? (
                  <tr key={t.id} className="bg-blue-50">
                    <td className="border px-2 py-1">
                      <input
                        type="text"
                        value={editingTemplateForm.name}
                        onChange={e => setEditingTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full border px-2 py-1 rounded text-sm"
                        placeholder="템플릿 이름"
                      />
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        type="number"
                        value={editingTemplateForm.baseFee}
                        onChange={e => setEditingTemplateForm(prev => ({ ...prev, baseFee: Number(e.target.value) || 0 }))}
                        className="w-full border px-2 py-1 rounded text-sm"
                        min={0}
                        step={100}
                      />
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        type="number"
                        value={editingTemplateForm.perQuantityFee}
                        onChange={e => setEditingTemplateForm(prev => ({ ...prev, perQuantityFee: e.target.value }))}
                        className="w-full border px-2 py-1 rounded text-sm"
                        min={0}
                        step={100}
                        placeholder="선택"
                      />
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        type="number"
                        value={editingTemplateForm.freeShippingMinAmount}
                        onChange={e => setEditingTemplateForm(prev => ({ ...prev, freeShippingMinAmount: e.target.value }))}
                        className="w-full border px-2 py-1 rounded text-sm"
                        min={0}
                        step={1000}
                        placeholder="선택"
                      />
                    </td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => setEditingTemplateForm(prev => ({ ...prev, active: !prev.active }))}
                        className={`px-2 py-1 rounded text-xs font-medium transition ${
                          editingTemplateForm.active
                            ? 'bg-green-500 hover:bg-green-600 text-white'
                            : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                        }`}
                      >
                        {editingTemplateForm.active ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        type="number"
                        value={editingTemplateForm.sortOrder}
                        onChange={e => setEditingTemplateForm(prev => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))}
                        className="w-full border px-2 py-1 rounded text-sm"
                        min={0}
                      />
                    </td>
                    <td className="border px-2 py-1">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={handleUpdateTemplate}
                          disabled={templateSaving}
                          className="px-2 py-1 rounded text-xs bg-orange-500 hover:bg-orange-600 text-white font-medium disabled:bg-gray-300"
                        >
                          {templateSaving ? '...' : '확인'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTemplateId(null)}
                          className="px-2 py-1 rounded text-xs border hover:bg-gray-50 text-gray-600 font-medium"
                        >
                          취소
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="border px-2 py-2">{t.name}</td>
                    <td className="border px-2 py-2">{formatPrice(t.baseFee)}</td>
                    <td className="border px-2 py-2 text-gray-500">
                      {t.perQuantityFee != null ? formatPrice(t.perQuantityFee) : '-'}
                    </td>
                    <td className="border px-2 py-2 text-gray-500">
                      {t.freeShippingMinAmount != null ? formatPrice(t.freeShippingMinAmount) : '-'}
                    </td>
                    <td className="border px-2 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {t.active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="border px-2 py-2 text-center">{t.sortOrder}</td>
                    <td className="border px-2 py-2">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => startEditTemplate(t)}
                          className="px-2 py-1 rounded text-xs border border-orange-400 text-orange-500 hover:bg-orange-50 font-medium"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t.id)}
                          className="px-2 py-1 rounded text-xs bg-red-500 hover:bg-red-600 text-white font-medium"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
              {/* New template inline form */}
              {showNewTemplate && (
                <tr className="bg-green-50">
                  <td className="border px-2 py-1">
                    <input
                      type="text"
                      value={newTemplateForm.name}
                      onChange={e => setNewTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      placeholder="템플릿 이름"
                      autoFocus
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={newTemplateForm.baseFee}
                      onChange={e => setNewTemplateForm(prev => ({ ...prev, baseFee: Number(e.target.value) || 0 }))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      min={0}
                      step={100}
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={newTemplateForm.perQuantityFee}
                      onChange={e => setNewTemplateForm(prev => ({ ...prev, perQuantityFee: e.target.value }))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      min={0}
                      step={100}
                      placeholder="선택"
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={newTemplateForm.freeShippingMinAmount}
                      onChange={e => setNewTemplateForm(prev => ({ ...prev, freeShippingMinAmount: e.target.value }))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      min={0}
                      step={1000}
                      placeholder="선택"
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => setNewTemplateForm(prev => ({ ...prev, active: !prev.active }))}
                      className={`px-2 py-1 rounded text-xs font-medium transition ${
                        newTemplateForm.active
                          ? 'bg-green-500 hover:bg-green-600 text-white'
                          : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      }`}
                    >
                      {newTemplateForm.active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={newTemplateForm.sortOrder}
                      onChange={e => setNewTemplateForm(prev => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      min={0}
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleCreateTemplate}
                        disabled={templateSaving}
                        className="px-2 py-1 rounded text-xs bg-orange-500 hover:bg-orange-600 text-white font-medium disabled:bg-gray-300"
                      >
                        {templateSaving ? '...' : '추가'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewTemplate(false); setNewTemplateForm(DEFAULT_TEMPLATE_FORM); }}
                        className="px-2 py-1 rounded text-xs border hover:bg-gray-50 text-gray-600 font-medium"
                      >
                        취소
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!showNewTemplate && (
          <button
            type="button"
            onClick={() => { setShowNewTemplate(true); setEditingTemplateId(null); }}
            className="w-full border border-orange-500 text-orange-500 py-2 rounded hover:bg-orange-50 font-medium text-sm"
          >
            + 템플릿 추가
          </button>
        )}
      </section>

      {/* 배송비 정책 */}
      <section className="max-w-2xl mx-auto p-6 bg-white rounded shadow space-y-4">
        <h2 className="text-xl font-bold">배송비 정책</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border px-2 py-2 font-medium">최소수량</th>
                <th className="border px-2 py-2 font-medium">최대수량</th>
                <th className="border px-2 py-2 font-medium">배송비 (원)</th>
                <th className="border px-2 py-2 font-medium">정렬순서</th>
                <th className="border px-2 py-2 font-medium">활성화</th>
                <th className="border px-2 py-2 font-medium">삭제</th>
              </tr>
            </thead>
            <tbody>
              {policies.length === 0 && (
                <tr>
                  <td colSpan={6} className="border px-2 py-4 text-center text-gray-400">
                    등록된 배송비 정책이 없습니다.
                  </td>
                </tr>
              )}
              {policies.map((policy, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={policy.minQuantity}
                      onChange={e => updatePolicy(index, 'minQuantity', Number(e.target.value))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      min={0}
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={policy.maxQuantity}
                      onChange={e => updatePolicy(index, 'maxQuantity', Number(e.target.value))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      min={0}
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={policy.fee}
                      onChange={e => updatePolicy(index, 'fee', Number(e.target.value))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      min={0}
                      step={100}
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={policy.sortOrder}
                      onChange={e => updatePolicy(index, 'sortOrder', Number(e.target.value))}
                      className="w-full border px-2 py-1 rounded text-sm"
                      min={0}
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => updatePolicy(index, 'active', !policy.active)}
                      className={`px-2 py-1 rounded text-xs font-medium transition ${
                        policy.active
                          ? 'bg-green-500 hover:bg-green-600 text-white'
                          : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      }`}
                    >
                      {policy.active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => removePolicy(index)}
                      className="px-2 py-1 rounded text-xs bg-red-500 hover:bg-red-600 text-white font-medium"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

    </main>
  );
}
