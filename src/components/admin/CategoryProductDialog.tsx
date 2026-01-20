import React, { useEffect, useState, useCallback } from 'react';
import { getAdminProducts, updateCategoryProducts } from '../../utils/api';
import { useSnackbar } from '../snackbar';
import { theme } from '../../brand';

interface Props {
    categoryId: number;
    categoryName: string;
    initialProductIds: number[];
    onClose: () => void;
    onSuccess: () => void;
}

interface ProductInfo {
    id: number;
    name: string;
    price: number;
    productUrl?: string;
}

export default function CategoryProductDialog({ categoryId, categoryName, initialProductIds, onClose, onSuccess }: Props) {
    const { show } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [allProducts, setAllProducts] = useState<ProductInfo[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>(initialProductIds);
    const [searchTerm, setSearchTerm] = useState('');

    const loadProducts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getAdminProducts();
            const data = await res.json();
            // AdminProductListItems 형식 대응
            const list = Array.isArray(data) ? data : Array.isArray(data.response) ? data.response : [];
            setAllProducts(list);
        } catch (e: any) {
            show(e.message || '상품 목록을 불러오지 못했습니다.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [show]);

    useEffect(() => {
        loadProducts();
        // 모바일 스크롤 방해 금지 및 바디 스크롤 락
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, [loadProducts]);

    const handleSelectAll = () => {
        const filteredIds = filteredProducts.map(p => p.id);
        setSelectedIds(prev => {
            const next = new Set([...prev, ...filteredIds]);
            return Array.from(next);
        });
    };

    const handleDeselectAll = () => {
        const filteredIds = filteredProducts.map(p => p.id);
        setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
    };

    const handleToggle = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateCategoryProducts(categoryId, selectedIds);
            show('상품 연결이 변경되었습니다.', { variant: 'success' });
            onSuccess();
            onClose();
        } catch (e: any) {
            show(e.message || '저장 실패', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const filteredProducts = allProducts.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.includes(p.id));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh] overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800"><span className="text-orange-600 font-semibold">"{categoryName}"</span> 카테고리 상품 추가</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 py-3 bg-gray-50 border-b">
                    <input
                        type="text"
                        placeholder="상품명 검색"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    />
                </div>

                {/* Product List */}
                <div className="flex-1 overflow-y-auto px-2 py-2 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {loading ? (
                        <div className="py-10 text-center text-gray-500 text-sm">로딩 중...</div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="py-10 text-center text-gray-500 text-sm">상품이 없습니다.</div>
                    ) : (
                        <div className="space-y-1">
                            {filteredProducts.map(p => {
                                const isSelected = selectedIds.includes(p.id);
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => handleToggle(p.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${isSelected ? 'bg-orange-50 border-orange-100' : 'hover:bg-gray-50 border-transparent'
                                            } border`}
                                    >
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-300'
                                            }`}>
                                            {isSelected && (
                                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                        {p.productUrl && (
                                            <img
                                                src={`${theme.config.imgUrl}/${p.productUrl}`}
                                                className="w-10 h-10 rounded object-cover border bg-gray-100"
                                                alt=""
                                            />
                                        )}
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="text-sm font-medium text-gray-800 truncate">{p.name}</div>
                                            <div className="text-xs text-gray-500">{p.price.toLocaleString()}원</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-gray-50 flex flex-col gap-3">
                    <button
                        onClick={isAllSelected ? handleDeselectAll : handleSelectAll}
                        className={`w-full py-2 rounded-lg text-xs font-bold transition-all border ${isAllSelected
                            ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                            : 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100'
                            }`}
                    >
                        {isAllSelected ? '전체 선택 해제' : '전체 선택'}
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-2 flex-[2] py-3 rounded-xl font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-all shadow-md active:scale-95 flex items-center justify-center"
                        >
                            {saving ? '저장 중...' : `${selectedIds.length}개 추가`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
