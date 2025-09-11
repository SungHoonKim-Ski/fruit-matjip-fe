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

  // 검색 관련 상태
  const [search, setSearch] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [tempSearch, setTempSearch] = useState('');
  const [filteredSellDate, setFilteredSellDate] = useState<string | null>(null);
  
  // 각 그룹별 확장 상태
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // 검색 관련 함수들

  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;
    
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 px-1 rounded">{part}</mark>
      ) : part
    );
  };

  const openSearchModal = () => {
    setTempSearch(search);
    setSearchModalOpen(true);
  };

  const closeSearchModal = () => {
    setSearchModalOpen(false);
    setTempSearch('');
    setFilteredSellDate(null);
  };

  const applySearch = () => {
    setSearch(tempSearch);
    setSearchModalOpen(false);
    
    // 검색 결과가 있는 모든 날짜 그룹을 펼치기
    if (tempSearch.trim()) {
      const filteredProducts = getFilteredProducts(tempSearch);
      const groups = new Set<string>();
      
      // 오늘 날짜 계산 (KST)
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = kstNow.toISOString().split('T')[0];
      const sevenDaysAgo = new Date(kstNow);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
      
      filteredProducts.forEach(product => {
        let dateKey = product.sellDate || '미설정';
        
        // 7일 전 이전의 상품들은 "과거 상품" 카테고리로
        if (dateKey !== '미설정' && dateKey < sevenDaysAgoStr) {
          dateKey = '과거 상품';
        }
        
        groups.add(dateKey);
      });
      
      setExpandedGroups(groups);
    }
  };

  const clearSearch = () => {
    setSearch('');
    setTempSearch('');
    setFilteredSellDate(null);
  };

  // 개별 그룹 토글 핸들러
  const toggleGroup = (dateKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  };

  // 검색 필터링된 상품 목록
  const getFilteredProducts = (searchQuery: string) => {
    const query = searchQuery.trim().toLowerCase();
    if (query === '') return products;
    
    return products.filter(p => p.name.toLowerCase().includes(query));
  };

  // 날짜별로 상품 그룹화 (검색 필터링 포함, 7일 전 상품은 "7일+", 30일 전 상품은 "30일+" 카테고리로)
  const groupedProducts = React.useMemo(() => {
    const filteredProducts = getFilteredProducts(search);
    const groups: { [key: string]: Product[] } = {};
    
    // 오늘 날짜 계산 (KST)
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(kstNow);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(kstNow);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    filteredProducts.forEach(product => {
      let dateKey = product.sellDate || '미설정';
      
      // 30일 전 이전의 상품들은 "과거 상품+" 카테고리로
      if (dateKey !== '미설정' && dateKey < thirtyDaysAgoStr) {
        dateKey = '과거 상품+';
      }
      // 7일 전 이전의 상품들은 "과거 상품" 카테고리로
      else if (dateKey !== '미설정' && dateKey < sevenDaysAgoStr) {
        dateKey = '과거 상품';
      }
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(product);
    });
    
    // 날짜순으로 정렬 (미래~과거순, 미설정은 마지막, 과거 상품 다음에 과거 상품+)
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      if (a === '미설정') return 1;
      if (b === '미설정') return -1;
      if (a === '과거 상품' && b === '과거 상품+') return -1;
      if (a === '과거 상품+' && b === '과거 상품') return 1;
      if (a === '과거 상품') return 1;
      if (b === '과거 상품') return -1;
      if (a === '과거 상품+') return 1;
      if (b === '과거 상품+') return -1;
      return b.localeCompare(a);
    });
    
    return sortedGroups;
  }, [products, search]);

  // 필터링된 상품 목록 (날짜 필터 포함)
  const visibleProducts = React.useMemo(() => {
    const filteredProducts = getFilteredProducts(search);
    
    if (!filteredSellDate) return filteredProducts;
    
    // 오늘 날짜 계산 (KST)
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(kstNow);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(kstNow);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    return filteredProducts.filter(product => {
      let productDateKey = product.sellDate || '미설정';
      
      // 30일 전 이전의 상품들은 "과거 상품+" 카테고리로
      if (productDateKey !== '미설정' && productDateKey < thirtyDaysAgoStr) {
        productDateKey = '과거 상품+';
      }
      // 7일 전 이전의 상품들은 "과거 상품" 카테고리로
      else if (productDateKey !== '미설정' && productDateKey < sevenDaysAgoStr) {
        productDateKey = '과거 상품';
      }
      
      return productDateKey === filteredSellDate;
    });
  }, [products, search, filteredSellDate]);

  // 날짜 포맷팅 함수
  const formatDate = (dateStr: string) => {
    if (dateStr === '미설정') return '미설정';
    if (dateStr === '과거 상품') return '과거 상품';
    if (dateStr === '과거 상품+') return '과거 상품+';
    
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

  // 날짜 상태 가져오기 함수
  const getDateStatus = (dateStr: string) => {
    if (dateStr === '미설정') return { text: '미설정', color: 'bg-gray-100 text-gray-600' };
    if (dateStr === '과거 상품') return { text: '7일+', color: 'bg-gray-200 text-gray-700' };
    if (dateStr === '과거 상품+') return { text: '30일+', color: 'bg-gray-300 text-gray-800' };
    
    try {
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = kstNow.toISOString().split('T')[0];
      
      if (dateStr > todayStr) return { text: '예정', color: 'bg-blue-100 text-blue-700' };
      if (dateStr === todayStr) return { text: '당일', color: 'bg-green-100 text-green-700' };
      return { text: '종료', color: 'bg-red-100 text-red-700' };
    } catch {
      return { text: '미설정', color: 'bg-gray-100 text-gray-600' };
    }
  };

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📅 판매일 일괄 변경</h1>
          <div className="flex justify-end">
            <AdminHeader />
          </div>
        </div>
        


        {/* 상품 목록 - 날짜별 그룹화 또는 필터링된 상품 */}
        <div className={`space-y-6 ${selectedProducts.size > 0 ? 'pb-24' : ''}`}>
          {filteredSellDate ? (
            // 필터링된 상품들을 직접 표시
            <div className="space-y-3">
              {visibleProducts.map((product) => (
                <div 
                  key={product.id} 
                  className={`bg-white rounded-lg shadow p-3 border-2 transition-all duration-200 cursor-pointer ${
                    selectedProducts.has(product.id)
                      ? 'border-orange-500 bg-orange-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleSelectProduct(product.id)}
                >
                  <div className="flex items-center gap-3">
                    {/* 체크박스 */}
                    <input
                      type="checkbox"
                      checked={selectedProducts.has(product.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectProduct(product.id);
                      }}
                      className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                    />
                    
                    {/* 상품 이미지 */}
                    <img
                      src={product.imageUrl || ''}
                      alt={product.name}
                      className="w-16 h-16 object-cover rounded border flex-shrink-0"
                    />
                    
                    {/* 상품 정보 */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate mb-1">
                        {highlightSearchTerm(product.name, search)}
                      </h3>
                      
                      <div className="text-xs text-gray-600">
                        <span>재고: {product.stock}개</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // 기존 날짜별 그룹화 표시
            groupedProducts.map(([dateKey, productsInGroup]) => {
            const groupSelectedCount = productsInGroup.filter(p => selectedProducts.has(p.id)).length;
            const isGroupAllSelected = groupSelectedCount === productsInGroup.length;
            const isExpanded = expandedGroups.has(dateKey);
            const displayProducts = isExpanded ? productsInGroup : [];
            const remainingCount = productsInGroup.length;
            
            const handleGroupSelectAll = () => {
              if (isGroupAllSelected) {
                // 전체 해제
                const newSelected = new Set(selectedProducts);
                productsInGroup.forEach(p => newSelected.delete(p.id));
                setSelectedProducts(newSelected);
                
                // 해당 그룹을 접기
                if (isExpanded) {
                  toggleGroup(dateKey);
                }
              } else {
                // 전체 선택
                const newSelected = new Set(selectedProducts);
                productsInGroup.forEach(p => newSelected.add(p.id));
                setSelectedProducts(newSelected);
                
                // 해당 그룹을 펼치기
                if (!isExpanded) {
                  toggleGroup(dateKey);
                }
              }
            };

            return (
              <div key={dateKey}>
                {/* 날짜 헤더 */}
                <div 
                  className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded-lg mb-3 cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => toggleGroup(dateKey)}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroup(dateKey);
                      }}
                      className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    >
                      <svg 
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <span className="text-sm font-semibold text-gray-700">
                      {formatDate(dateKey)}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDateStatus(dateKey).color}`}>
                      {getDateStatus(dateKey).text}
                    </span>
                    <span className="text-xs text-gray-500">
                      {productsInGroup.length}개 상품
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGroupSelectAll();
                    }}
                    className="px-2 py-1 text-xs font-medium text-orange-600 hover:text-orange-700 border border-orange-300 rounded hover:bg-orange-50 transition-colors flex-shrink-0"
                  >
                    {isGroupAllSelected ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                
                {/* 해당 날짜의 상품들 */}
                <div className="space-y-3">
                  {displayProducts.map((product) => (
                    <div 
                      key={product.id} 
                      className={`bg-white rounded-lg shadow p-3 border-2 transition-all duration-200 cursor-pointer ${
                        selectedProducts.has(product.id)
                          ? 'border-orange-500 bg-orange-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleSelectProduct(product.id)}
                    >
                      <div className="flex items-center gap-3">
                        {/* 체크박스 */}
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectProduct(product.id);
                          }}
                          className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                        />
                        
                        {/* 상품 이미지 */}
                        <img
                          src={product.imageUrl || ''}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded border flex-shrink-0"
                        />
                        
                        {/* 상품 정보 */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate mb-1">
                            {highlightSearchTerm(product.name, search)}
                          </h3>
                          
                          <div className="text-xs text-gray-600">
                            <span>재고: {product.stock}개</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                </div>
              </div>
            );
            })
          )}
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

        {/* FAB 검색 버튼 */}
        <button
          onClick={search ? clearSearch : openSearchModal}
          className={`fixed right-4 z-[60] bg-white text-gray-800 rounded-full shadow-lg flex items-center gap-2 px-4 py-3 transition-all duration-200 hover:scale-105 active:scale-95 ${
            search ? 'border border-blue-500' : 'border-2 border-blue-500'
          } ${selectedProducts.size > 0 ? 'bottom-20' : 'bottom-4'}`}
          aria-label={search ? "필터 초기화" : "상품 검색"}
        >
          {search ? (
            // 필터 초기화 아이콘 (필터)
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3"/>
            </svg>
          ) : (
            // 검색 아이콘 (돋보기)
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          )}
          <span className="text-sm font-bold text-gray-900">
            {search ? '초기화' : ''}
          </span>
        </button>

        {/* 검색 모달 */}
        {searchModalOpen && (
          <div
            className="fixed inset-0 z-50 grid place-items-center p-4"
            aria-modal="true"
            role="dialog"
          >
            <div className="absolute inset-0 bg-black/40" onClick={closeSearchModal} />
            <div className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-xl border">
              {/* 검색 헤더 */}
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold text-gray-800">상품 검색</h2>
                <button
                  onClick={closeSearchModal}
                  className="h-8 w-8 grid place-items-center rounded-md hover:bg-gray-50"
                  aria-label="검색창 닫기"
                >
                  ✕
                </button>
              </div>
              
              {/* 검색 입력 */}
              <div className="p-4">
                <div className="relative">
                  <input
                    type="text"
                    value={tempSearch}
                    onChange={e => setTempSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        applySearch();
                      }
                    }}
                    placeholder="상품명을 입력하세요 (예: 토마토, 사과)"
                    className="w-full h-12 pl-10 pr-10 rounded-lg border-2 border-gray-300 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm bg-white"
                    autoFocus
                  />
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔎</span>
                  {tempSearch && (
                    <button
                      type="button"
                      onClick={() => setTempSearch('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm w-6 h-6 flex items-center justify-center"
                      aria-label="검색어 지우기"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              
              {/* 검색 결과 미리보기 */}
              {tempSearch && (
                <div className="px-4 pb-4">
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(() => {
                      const filteredProducts = getFilteredProducts(tempSearch);
                      const groups: { [key: string]: Product[] } = {};
                      
                      // 오늘 날짜 계산 (KST)
                      const now = new Date();
                      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                      const todayStr = kstNow.toISOString().split('T')[0];
                      const sevenDaysAgo = new Date(kstNow);
                      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
                      const thirtyDaysAgo = new Date(kstNow);
                      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
                      
                      filteredProducts.forEach(product => {
                        let dateKey = product.sellDate || '미설정';
                        
                        // 30일 전 이전의 상품들은 "과거 상품+" 카테고리로
                        if (dateKey !== '미설정' && dateKey < thirtyDaysAgoStr) {
                          dateKey = '과거 상품+';
                        }
                        // 7일 전 이전의 상품들은 "과거 상품" 카테고리로
                        else if (dateKey !== '미설정' && dateKey < sevenDaysAgoStr) {
                          dateKey = '과거 상품';
                        }
                        
                        if (!groups[dateKey]) {
                          groups[dateKey] = [];
                        }
                        groups[dateKey].push(product);
                      });
                      
                      // 날짜순으로 정렬
                      const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
                        if (a === '미설정') return 1;
                        if (b === '미설정') return -1;
                        if (a === '과거 상품' && b === '과거 상품+') return -1;
                        if (a === '과거 상품+' && b === '과거 상품') return 1;
                        if (a === '과거 상품') return 1;
                        if (b === '과거 상품') return -1;
                        if (a === '과거 상품+') return 1;
                        if (b === '과거 상품+') return -1;
                        return b.localeCompare(a);
                      });
                      
                      return sortedGroups.map(([dateKey, productsInGroup]) => (
                        <div 
                          key={dateKey} 
                          className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => {
                            // 해당 날짜로 필터 적용하고 모달 닫기
                            setSearch(tempSearch);
                            setFilteredSellDate(dateKey);
                            setSearchModalOpen(false);
                            setTempSearch('');
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800">
                                {formatDate(dateKey)}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDateStatus(dateKey).color}`}>
                                {getDateStatus(dateKey).text}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {productsInGroup.length}개
                            </span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
              
              
              {/* 버튼 영역 */}
              <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
                <button
                  onClick={closeSearchModal}
                  className="flex-1 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={applySearch}
                  className="flex-1 h-10 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors"
                >
                  검색 적용
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
