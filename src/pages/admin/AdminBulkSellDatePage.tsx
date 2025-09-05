import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getAdminProductsMapped, AdminProductListItem, bulkUpdateSellDate, getBulkSellDates } from '../../utils/api';
import AdminHeader from '../../components/AdminHeader';

type Product = AdminProductListItem;

export default function AdminBulkSellDatePage() {
  const { show } = useSnackbar();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [newSellDate, setNewSellDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const navigate = useNavigate();

  // 상품 목록 로드 및 정렬 (미래~과거순)
  useEffect(() => {
    const loadProducts = async () => {
      if (USE_MOCKS) {
        const mocked = listProducts();
        const mapped: Product[] = mocked.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          stock: p.stock,
          totalSold: p.totalSold ?? 0,
          status: p.stock > 0 ? 'active' : 'inactive',
          imageUrl: p.imageUrl,
          sellDate: p.sellDate,
        }));
        
        // 날짜순 정렬 (미래~과거순)
        const sorted = mapped.sort((a, b) => {
          if (!a.sellDate && !b.sellDate) return 0;
          if (!a.sellDate) return 1; // sellDate가 없는 것은 뒤로
          if (!b.sellDate) return -1;
          return b.sellDate.localeCompare(a.sellDate); // 내림차순 (미래~과거)
        });
        
        setProducts(sorted);
      } else {
        try {
          const mapped = await getAdminProductsMapped();
          
          // 날짜순 정렬 (미래~과거순)
          const sorted = mapped.sort((a, b) => {
            if (!a.sellDate && !b.sellDate) return 0;
            if (!a.sellDate) return 1; // sellDate가 없는 것은 뒤로
            if (!b.sellDate) return -1;
            return b.sellDate.localeCompare(a.sellDate); // 내림차순 (미래~과거)
          });
          
          setProducts(sorted);
        } catch (e: any) {
          safeErrorLog(e, 'AdminBulkSellDatePage - loadProducts');
          show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
        }
      }
    };
    loadProducts();
  }, [show]);


  // 개별 선택/해제
  const handleSelectProduct = (productId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  // 일괄 변경 확인 다이얼로그 표시
  const handleBulkUpdateClick = () => {
    if (selectedProducts.size === 0) {
      show('변경할 상품을 선택해주세요.', { variant: 'error' });
      return;
    }

    if (!newSellDate) {
      show('새로운 판매일을 입력해주세요.', { variant: 'error' });
      return;
    }

    // 선택된 상품들의 현재 판매일 확인
    const selectedProductsList = products.filter(p => selectedProducts.has(p.id));
    const allSameDate = selectedProductsList.every(p => p.sellDate === newSellDate);
    
    if (allSameDate) {
      show('선택된 상품들의 판매일이 이미 해당 날짜로 설정되어 있습니다.', { variant: 'info' });
      return;
    }

    setShowConfirmDialog(true);
  };

  // 판매일 일괄 변경 실행
  const handleBulkUpdateSellDate = async () => {
    setShowConfirmDialog(false);
    setIsLoading(true);
    try {
      if (USE_MOCKS) {
        // Mock에서는 로컬 상태만 업데이트
        setProducts(prev => prev.map(p => 
          selectedProducts.has(p.id) ? { ...p, sellDate: newSellDate } : p
        ));
        show(`${selectedProducts.size}개 상품의 판매일이 변경되었습니다.`, { variant: 'success' });
      } else {
        // 실제 API 호출
        const res = await bulkUpdateSellDate(Array.from(selectedProducts), newSellDate);
        if (!res.ok) throw new Error('판매일 변경에 실패했습니다.');
        // 성공 시 로컬 상태도 업데이트
        setProducts(prev => prev.map(p => 
          selectedProducts.has(p.id) ? { ...p, sellDate: newSellDate } : p
        ));
        show(`${selectedProducts.size}개 상품의 판매일이 변경되었습니다.`, { variant: 'success' });
      }
      
      // 성공 후 선택 초기화
      setSelectedProducts(new Set());
      setNewSellDate('');
    } catch (e: any) {
      safeErrorLog(e, 'AdminBulkSellDatePage - handleBulkUpdateSellDate');
      show(getSafeErrorMessage(e, '판매일 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // 오늘 날짜를 기본값으로 설정
  useEffect(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    setNewSellDate(todayStr);
  }, []);

  // 날짜별로 상품 그룹화
  const groupedProducts = React.useMemo(() => {
    const groups: { [key: string]: Product[] } = {};
    
    products.forEach(product => {
      const dateKey = product.sellDate || '미설정';
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(product);
    });
    
    // 날짜순으로 정렬 (미래~과거순, 미설정은 마지막)
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      if (a === '미설정') return 1;
      if (b === '미설정') return -1;
      return b.localeCompare(a);
    });
    
    return sortedGroups;
  }, [products]);

  // 날짜 포맷팅 함수
  const formatDate = (dateStr: string) => {
    if (dateStr === '미설정') return '미설정';
    
    try {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📅 판매일 변경</h1>
          <div className="flex justify-end">
            <AdminHeader />
          </div>
        </div>
        

        {/* 상품 목록 - 날짜별 그룹화 */}
        <div className="space-y-6">
          {groupedProducts.map(([dateKey, productsInGroup]) => {
            const groupSelectedCount = productsInGroup.filter(p => selectedProducts.has(p.id)).length;
            const isGroupAllSelected = groupSelectedCount === productsInGroup.length;
            
            const handleGroupSelectAll = () => {
              if (isGroupAllSelected) {
                // 전체 해제
                const newSelected = new Set(selectedProducts);
                productsInGroup.forEach(p => newSelected.delete(p.id));
                setSelectedProducts(newSelected);
              } else {
                // 전체 선택
                const newSelected = new Set(selectedProducts);
                productsInGroup.forEach(p => newSelected.add(p.id));
                setSelectedProducts(newSelected);
              }
            };

            return (
              <div key={dateKey}>
                {/* 날짜 구분선 및 헤더 */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <div className="flex items-center gap-3 px-3 py-1 bg-gray-100 rounded-full">
                    <span className="text-sm font-semibold text-gray-700">
                      {formatDate(dateKey)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {productsInGroup.length}개 상품
                    </span>
                    <button
                      type="button"
                      onClick={handleGroupSelectAll}
                      className="px-2 py-1 text-xs font-medium text-orange-600 hover:text-orange-700 border border-orange-300 rounded hover:bg-orange-50 transition-colors"
                    >
                      {isGroupAllSelected ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>
                
                {/* 해당 날짜의 상품들 */}
                <div className="space-y-3">
                  {productsInGroup.map((product) => (
                    <div 
                      key={product.id} 
                                      className={`bg-white rounded-lg shadow p-4 border-2 transition-all duration-200 cursor-pointer ${
                  selectedProducts.has(product.id)
                    ? 'border-orange-500 bg-orange-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                      onClick={() => handleSelectProduct(product.id)}
                    >
                      <div className="flex items-center gap-4">
                        {/* 체크박스 */}
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectProduct(product.id);
                          }}
                          className="w-5 h-5 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                        />
                        
                        {/* 상품 이미지 */}
                        <img
                          src={product.imageUrl || ''}
                          alt={product.name}
                          className="w-20 h-20 object-cover rounded border flex-shrink-0"
                        />
                        
                        {/* 상품 정보 */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 truncate mb-2">{product.name}</h3>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                            <span>재고: {product.stock}개</span>
                          </div>
                          
                          {/* 판매일 표시 */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">판매일:</span>
                            <span className="text-sm font-medium text-gray-900">
                              {product.sellDate || '미설정'}
                            </span>
                            {product.sellDate && (
                              <span className={`text-xs font-medium px-2 py-1 rounded ${
                                (() => {
                                  if (!product.sellDate) return 'bg-gray-100 text-gray-600';
                                  
                                  // KST 기준으로 오늘 날짜 계산
                                  const now = new Date();
                                  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                                  const todayStr = kstNow.toISOString().split('T')[0];
                                  
                                  if (product.sellDate > todayStr) return 'bg-blue-100 text-blue-800'; // 미래 - 파란색
                                  if (product.sellDate === todayStr) return 'bg-red-100 text-red-800'; // 당일 - 빨간색
                                  return 'bg-yellow-100 text-yellow-800'; // 지난 날 - 노란색
                                })()
                              }`}>
                                {(() => {
                                  if (!product.sellDate) return '미설정';
                                  
                                  // KST 기준으로 오늘 날짜 계산
                                  const now = new Date();
                                  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                                  const todayStr = kstNow.toISOString().split('T')[0];
                                  
                                  if (product.sellDate > todayStr) return '예정';
                                  if (product.sellDate === todayStr) return '당일';
                                  return '종료';
                                })()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {products.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">등록된 상품이 없습니다.</p>
          </div>
        )}

        {/* 선택된 상품이 있을 때 하단 고정 버튼 */}
        {selectedProducts.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4 z-40">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 w-full">
                <div className="flex-1 flex flex-col gap-0">
                  <input
                    id="newSellDate"
                    type="date"
                    value={newSellDate}
                    onChange={(e) => setNewSellDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                
                <div className="flex-1 flex">
                  <button
                    type="button"
                    onClick={handleBulkUpdateClick}
                    disabled={isLoading || !newSellDate}
                    className="w-full px-6 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center justify-center"
                  >
                    {isLoading ? '변경 중...' : `${selectedProducts.size}개 판매일 변경`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 확인 다이얼로그 */}
        {showConfirmDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                판매일 일괄 변경
              </h3>
              <p className="text-gray-600 mb-6">
                <span className="font-medium">"{selectedProducts.size}개 상품"</span>의 판매일을<br/>
                <span className="font-medium">"{newSellDate}"</span>로 변경합니다.
              </p>
              <div className="mb-4">
                <span className="text-sm text-red-500">
                  <strong>재고와 노출 순서는 그대로 유지</strong>되며, 판매일만 변경됩니다. <br />
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 h-10 rounded bg-gray-500 hover:bg-gray-600 text-white"
                >
                  닫기
                </button>
                <button
                  type="button"
                  onClick={handleBulkUpdateSellDate}
                  disabled={isLoading}
                  className="flex-1 h-10 rounded bg-orange-500 hover:bg-orange-600 text-white font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isLoading ? '변경 중...' : '변경하기'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
