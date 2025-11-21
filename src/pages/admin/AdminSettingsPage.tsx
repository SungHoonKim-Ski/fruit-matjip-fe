import React, { useState, useEffect } from 'react';
import { useSnackbar } from '../../components/snackbar';

export default function AdminSettingsPage() {
    const { show } = useSnackbar();
    const [fees, setFees] = useState({ delivery: 3000, parcel: 3000 });

    useEffect(() => {
        const saved = localStorage.getItem('admin_fees');
        if (saved) {
            setFees(JSON.parse(saved));
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem('admin_fees', JSON.stringify(fees));
        show('설정이 저장되었습니다.', { variant: 'success' });
    };

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">관리자 설정</h1>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-lg font-semibold border-b pb-2">배송비 설정</h2>

                <div className="grid gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">배달비 (기본)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={fees.delivery}
                                onChange={e => setFees({ ...fees, delivery: Number(e.target.value) })}
                                className="border rounded p-2 w-full max-w-xs"
                            />
                            <span>원</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">택배비 (기본)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={fees.parcel}
                                onChange={e => setFees({ ...fees, parcel: Number(e.target.value) })}
                                className="border rounded p-2 w-full max-w-xs"
                            />
                            <span>원</span>
                        </div>
                    </div>
                </div>

                <div className="pt-4">
                    <button
                        onClick={handleSave}
                        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-medium"
                    >
                        저장하기
                    </button>
                </div>
            </div>
        </div>
    );
}
