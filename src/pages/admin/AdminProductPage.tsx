// AdminProductPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { toggleVisible as apiToggleVisible, deleteAdminProduct, getAdminProductsMapped, AdminProductListItem, toggleDeliveryAvailable as apiToggleDeliveryAvailable } from '../../utils/api';
import { useLocation } from 'react-router-dom';
import AdminHeader from '../../components/AdminHeader';

type Product = AdminProductListItem;

export default function AdminProductPage() {
  const location = useLocation() as any;
  // 재고 상태 기준값 (UI 배지 표시용)
  const LOW_STOCK_THRESHOLD = 10;    // 품절임박 기준
  const DANGER_STOCK_THRESHOLD = 5;  // 위험 재고 기준

  const { show } = useSnackbar();

  // 시간을 12시간 형식으로 변환 (HH:mm -> 오전/오후 h:mm)
  const formatTime12Hour = (time24: string): string => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? '오후' : '오전';
    const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${period} ${hours12}:${minutes.toString().padStart(2, '0')}`;
  };
  const [products, setProducts] = useState<Product[]>([]);
  const navigate = useNavigate();

  // 스크롤 투 탑 관련 상태
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // 스크롤 이벤트 핸들러
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setShowScrollToTop(scrollTop > 160); // 160px 이상 스크롤하면 버튼 표시 (FloatingActions와 동일)
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 맨 위로 스크롤하는 함수
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // --- Dialog 상태들 ---
  const [toggleDeliveryDialog, setToggleDeliveryDialog] = useState<{
    isOpen: boolean;
    productId: number;
    productName: string;
    newAllowed: boolean;
  }>({ isOpen: false, productId: 0, productName: '', newAllowed: true });

  const [deleteProductDialog, setDeleteProductDialog] = useState<{
    isOpen: boolean;
    productId: number;
    productName: string;
  }>({ isOpen: false, productId: 0, productName: '' });

  const [toggleStatusDialog, setToggleStatusDialog] = useState<{
    isOpen: boolean;
    productId: number;
    productName: string;
    newStatus: 'active' | 'inactive';
  }>({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });

  // 상세 정보 표시 상태
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // 뒤로가기 처리 제어용 플래그 (프로그램적으로 back() 했을 때 popstate 중복 처리 방지)
  const suppressNextPop = useRef(false);

  // 검색어 (상품명)
  const [search, setSearch] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [tempSearch, setTempSearch] = useState('');

  // 필터링된 판매일 (검색 결과에서 날짜 클릭 시)
  const [filteredSellDate, setFilteredSellDate] = useState<string | null>(null);

  const visibleProducts = useMemo(() => {
    let filtered = products;

    // 검색어 필터링
    const q = search.trim();
    if (q) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
    }

    // 판매일 필터링
    if (filteredSellDate) {
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

      filtered = filtered.filter(p => {
        let sellDate = p.sellDate || '미설정';

        // 30일 전 이전의 상품들은 "과거 상품+" 카테고리로
        if (sellDate !== '미설정' && sellDate < thirtyDaysAgoStr) {
          sellDate = '과거 상품+';
        }
        // 7일 전 이전의 상품들은 "과거 상품" 카테고리로
        else if (sellDate !== '미설정' && sellDate < sevenDaysAgoStr) {
          sellDate = '과거 상품';
        }

        return sellDate === filteredSellDate;
      });
    }

    return filtered;
  }, [products, search, filteredSellDate]);

  // 판매일별로 그룹화 (7일 전 상품은 "과거 상품", 30일 전 상품은 "과거 상품+" 카테고리로)
  const groupedProducts = useMemo(() => {
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

    visibleProducts.forEach(product => {
      let sellDate = product.sellDate || '미설정';

      // 30일 전 이전의 상품들은 "과거 상품+" 카테고리로
      if (sellDate !== '미설정' && sellDate < thirtyDaysAgoStr) {
        sellDate = '과거 상품+';
      }
      // 7일 전 이전의 상품들은 "과거 상품" 카테고리로
      else if (sellDate !== '미설정' && sellDate < sevenDaysAgoStr) {
        sellDate = '과거 상품';
      }

      if (!groups[sellDate]) {
        groups[sellDate] = [];
      }
      groups[sellDate].push(product);
    });
    return groups;
  }, [visibleProducts]);

  // 판매일별 상품 개수
  const countOf = (sellDate: string) => {
    return groupedProducts[sellDate]?.length || 0;
  };

  // 날짜 포맷팅 함수
  const formatSellDate = (sellDate: string) => {
    if (sellDate === '미설정') return '미설정';
    if (sellDate === '과거 상품') return '과거 상품';
    if (sellDate === '과거 상품+') return '과거 상품+';
    const date = new Date(sellDate + 'T00:00:00');
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };

  // 판매일 상태 확인
  const getSellDateStatus = (sellDate: string) => {
    if (sellDate === '미설정') return { text: '미설정', color: 'bg-gray-100 text-gray-600' };
    if (sellDate === '과거 상품') return { text: '7일+', color: 'bg-gray-200 text-gray-700' };
    if (sellDate === '과거 상품+') return { text: '30일+', color: 'bg-gray-300 text-gray-800' };

    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().split('T')[0];

    if (sellDate > todayStr) return { text: '판매예정', color: 'bg-blue-100 text-blue-700' };
    if (sellDate === todayStr) return { text: '판매당일', color: 'bg-green-100 text-green-700' };
    return { text: '판매종료', color: 'bg-red-100 text-red-700' };
  };

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
  };

  const applySearch = () => {
    setSearch(tempSearch);
    setSearchModalOpen(false);

    // 검색 적용 시 모든 그룹을 펼치기
    if (tempSearch.trim()) {
      const availableDates = getAvailableDates(tempSearch);
      setExpandedGroups(new Set(availableDates));
    }
  };

  const clearSearch = () => {
    setSearch('');
    setTempSearch('');
    setFilteredSellDate(null);
  };

  // 임시 검색어로 필터링된 상품 목록 (검색 모달용)
  const getFilteredProductsByTempSearch = (searchQuery: string) => {
    const query = searchQuery.trim().toLowerCase();
    if (query === '') return products;

    return products.filter(p => p.name.toLowerCase().includes(query));
  };

  // 날짜별 필터링된 상품 목록 (검색 모달용)
  const getFilteredProductsForDate = (sellDate: string, searchQuery: string) => {
    const filteredProducts = getFilteredProductsByTempSearch(searchQuery);

    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(kstNow);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(kstNow);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    if (sellDate === '과거 상품') {
      return filteredProducts.filter(p => {
        const d = p.sellDate || '미설정';
        return d !== '미설정' && d < sevenDaysAgoStr && d >= thirtyDaysAgoStr;
      });
    }
    if (sellDate === '과거 상품+') {
      return filteredProducts.filter(p => {
        const d = p.sellDate || '미설정';
        return d !== '미설정' && d < thirtyDaysAgoStr;
      });
    }
    return filteredProducts.filter(p => (p.sellDate || '미설정') === sellDate);
  };

  // 날짜별 필터링된 상품 개수 (검색 모달용)
  const getFilteredCountByDate = (sellDate: string, searchQuery: string) => {
    const filteredProducts = getFilteredProductsByTempSearch(searchQuery);

    // 과거 상품 카테고리 처리
    if (sellDate === '과거 상품') {
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(kstNow);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(kstNow);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      return filteredProducts.filter(p => {
        const productSellDate = p.sellDate || '미설정';
        return productSellDate !== '미설정' && productSellDate < sevenDaysAgoStr && productSellDate >= thirtyDaysAgoStr;
      }).length;
    }

    // 과거 상품+ 카테고리 처리
    if (sellDate === '과거 상품+') {
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(kstNow);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      return filteredProducts.filter(p => {
        const productSellDate = p.sellDate || '미설정';
        return productSellDate !== '미설정' && productSellDate < thirtyDaysAgoStr;
      }).length;
    }

    return filteredProducts.filter(p => (p.sellDate || '미설정') === sellDate).length;
  };

  // 검색 결과가 있는 날짜들 (검색 모달용)
  const getAvailableDates = (searchQuery: string) => {
    const filteredProducts = getFilteredProductsByTempSearch(searchQuery);

    // 7일 전, 30일 전 카테고리 처리
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(kstNow);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(kstNow);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const dates = new Set<string>();

    filteredProducts.forEach(p => {
      const productSellDate = p.sellDate || '미설정';
      if (productSellDate !== '미설정' && productSellDate < thirtyDaysAgoStr) {
        dates.add('과거 상품+');
      } else if (productSellDate !== '미설정' && productSellDate < sevenDaysAgoStr) {
        dates.add('과거 상품');
      } else {
        dates.add(productSellDate);
      }
    });

    return Array.from(dates).sort((a, b) => {
      if (a === '미설정') return 1;
      if (b === '미설정') return -1;
      if (a === '과거 상품' && b === '과거 상품+') return -1;
      if (a === '과거 상품+' && b === '과거 상품') return 1;
      if (a === '과거 상품') return 1;
      if (b === '과거 상품') return -1;
      if (a === '과거 상품+') return 1;
      if (b === '과거 상품+') return -1;
      return b.localeCompare(a); // desc
    });
  };

  // 그룹 토글 함수
  const toggleGroup = (sellDate: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sellDate)) {
        newSet.delete(sellDate);
      } else {
        newSet.add(sellDate);
      }
      return newSet;
    });
  };

  // 필터링이 적용되었을 때 해당 날짜의 그룹을 자동으로 펼치기
  useEffect(() => {
    if (filteredSellDate) {
      setExpandedGroups(prev => new Set([...prev, filteredSellDate]));
    }
  }, [filteredSellDate]);

  // --- 다이얼로그 열기: pushState로 히스토리 한 단계 추가 (뒤로가기 시 다이얼로그만 닫힘) ---
  const pushDialogState = () => {
    window.history.pushState({ modal: true }, '');
  };

  const openToggleDeliveryDialog = (id: number, name: string, currentAllowed?: boolean) => {
    const nextAllowed = !(currentAllowed ?? false);
    setToggleDeliveryDialog({ isOpen: true, productId: id, productName: name, newAllowed: nextAllowed });
    pushDialogState();
  };

  const openDeleteProductDialog = (id: number, name: string) => {
    setDeleteProductDialog({ isOpen: true, productId: id, productName: name });
    pushDialogState();
  };

  const openToggleStatusDialog = (id: number, name: string, currentStatus: 'active' | 'inactive') => {
    setToggleStatusDialog({ isOpen: true, productId: id, productName: name, newStatus: currentStatus === 'active' ? 'inactive' : 'active' });
    pushDialogState();
  };

  // --- 다이얼로그 닫기(취소/확인 공통): 상태 닫고, 우리가 추가한 히스토리 1스텝만 소비 ---
  const programmaticCloseDialog = () => {
    suppressNextPop.current = true;
    window.history.back();
  };

  // --- 브라우저/안드로이드 뒤로가기 처리: 다이얼로그만 닫기 ---
  useEffect(() => {
    const onPop = () => {
      if (suppressNextPop.current) {
        suppressNextPop.current = false;
        return;
      }
      if (toggleStatusDialog.isOpen || deleteProductDialog.isOpen || toggleDeliveryDialog.isOpen) {
        setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });
        setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' });
        setToggleDeliveryDialog({ isOpen: false, productId: 0, productName: '', newAllowed: true });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [toggleStatusDialog.isOpen, deleteProductDialog.isOpen, toggleDeliveryDialog.isOpen]);



  // --- API 실행 핸들러들 (Confirm에서 즉시 호출) ---
  const handleToggleDeliveryAvailable = async (id: number, newAllowed: boolean) => {
    try {
      if (USE_MOCKS) {
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, deliveryAvailable: newAllowed } : p)));
        show(`배달이 ${newAllowed ? '가능' : '불가'} 처리되었습니다.`, { variant: 'success' });
      } else {
        const res = await apiToggleDeliveryAvailable(id);
        if (!res.ok) throw new Error('배달 가능 여부 변경에 실패했습니다.');
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, deliveryAvailable: newAllowed } : p)));
        show(`배달이 ${newAllowed ? '가능' : '불가'} 처리되었습니다.`, { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleToggleDeliveryAvailable');
      show(getSafeErrorMessage(e, '배달 가능 여부 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      if (USE_MOCKS) {
        setProducts(prev => prev.filter(p => p.id !== id));
        show('상품이 삭제되었습니다.', { variant: 'success' });
      } else {
        const res = await deleteAdminProduct(id);
        if (!res.ok) throw new Error('상품 삭제에 실패했습니다.');
        setProducts(prev => prev.filter(p => p.id !== id));
        show('상품이 삭제되었습니다.', { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleDeleteProduct');
      show(getSafeErrorMessage(e, '상품 삭제 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  const handleToggleStatus = async (id: number, newStatus: 'active' | 'inactive') => {
    try {
      if (USE_MOCKS) {
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, status: newStatus } : p)));
        show(`상품이 ${newStatus === 'active' ? '노출' : '숨김'} 처리되었습니다.`, { variant: 'success' });
      } else {
        const res = await apiToggleVisible(id);
        if (!res.ok) throw new Error('상태 변경에 실패했습니다.');
        setProducts(prev => prev.map(p => (p.id === id ? { ...p, status: newStatus } : p)));
        show(`상품이 ${newStatus === 'active' ? '노출' : '숨김'} 처리되었습니다.`, { variant: 'success' });
      }
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductPage - handleToggleStatus');
      show(getSafeErrorMessage(e, '상태 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  // --- 상품 목록 조회 ---
  useEffect(() => {
    const loadProducts = async () => {
      if (USE_MOCKS) {
        const mocked = listProducts();
        const mapped: Product[] = mocked.map(p => ({
          id: p.id,
          name: p.name,
          price: p.price,
          stock: p.stock,
          status: p.stock > 0 ? 'active' : 'inactive',
          imageUrl: p.imageUrl,
          sellDate: p.sellDate,
          sellTime: p.sellTime,
          deliveryAvailable: true,
        }));
        setProducts(mapped);
      } else {
        try {
          const forceTs = location?.state?.bustTs as number | undefined;
          const mapped = await getAdminProductsMapped(forceTs);
          setProducts(mapped as Product[]);
        } catch (e: any) {
          safeErrorLog(e, 'AdminProductPage - loadProducts');
          show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
        }
      }
    };
    loadProducts();
  }, [show, location?.state?.bustTs]);



  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📦 매장 상품 관리</h1>
          <div className="flex justify-end">
            <AdminHeader />
          </div>
        </div>

      </div>

      <div className="space-y-4 max-w-3xl mx-auto">
        {Object.keys(groupedProducts).length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            {search ? `"${search}"에 대한 검색 결과가 없습니다.` : '등록된 상품이 없습니다.'}
          </div>
        )}

        {Object.entries(groupedProducts).map(([sellDate, products]) => {
          const isExpanded = expandedGroups.has(sellDate);
          const status = getSellDateStatus(sellDate);

          return (
            <div key={sellDate} className="bg-white rounded-lg shadow">
              {/* 그룹 헤더 */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleGroup(sellDate)}
              >
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold text-gray-800">
                    {formatSellDate(sellDate)}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                    {status.text}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {countOf(sellDate)}개 상품
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* 상품 목록 (펼쳐진 경우에만) */}
              {isExpanded && (
                <div className="border-t">
                  {products.map((product) => (
                    <div key={product.id} className="p-4 border-b last:border-b-0">
                      <div className="flex flex-row items-stretch gap-4">
                        <img
                          src={(() => {
                            const url = product.imageUrl || '';
                            const ts = location?.state?.bustTs;
                            if (!ts) return url;
                            return url.includes('?') ? `${url}&ts=${ts}` : `${url}?ts=${ts}`;
                          })()}
                          alt={product.name}
                          className="w-20 h-20 object-cover rounded border flex-shrink-0"
                        />
                        <div className="flex-1 flex flex-col justify-between min-h-[5rem]">
                          {/* 상품 정보 */}
                          <div className="space-y-1 flex-1">
                            <h3 className="text-sm font-semibold break-keep">{highlightSearchTerm(product.name, search)}</h3>
                            <p className="text-sm text-gray-500">가격: {product.price.toLocaleString()}원</p>
                            <p className="text-sm text-gray-500">
                              <span className="font-medium">재고: {product.stock.toLocaleString()}개</span>
                              <span
                                className="ml-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border"
                                style={{
                                  backgroundColor: (() => {
                                    if (product.stock === 0) return '#E0F2FE';
                                    if (product.stock < DANGER_STOCK_THRESHOLD) return '#FECACA';
                                    if (product.stock < LOW_STOCK_THRESHOLD) return '#FEF3C7';
                                    return '#DCFCE7';
                                  })(),
                                  borderColor: '#e5e7eb',
                                  color: '#374151'
                                }}
                              >
                                {(() => {
                                  if (product.stock === 0) return '품절';
                                  if (product.stock < DANGER_STOCK_THRESHOLD) return '위험';
                                  if (product.stock < LOW_STOCK_THRESHOLD) return '품절임박';
                                  return '여유';
                                })()}
                              </span>
                            </p>
                            {product.sellTime && (
                              <p className="text-sm text-gray-500">판매 개시: <b>{formatTime12Hour(product.sellTime.substring(0, 5))}</b></p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 조작 버튼들 */}
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/shop/products/${product.id}/edit`)}
                            className="h-8 w-full rounded border border-gray-300 hover:bg-gray-50 text-sm"
                          >
                            상세 정보 수정
                          </button>
                          <button
                            type="button"
                            onClick={() => openToggleDeliveryDialog(product.id, product.name, !!product.deliveryAvailable)}
                            className={`h-8 w-full rounded font-medium transition text-sm
                              ${product.deliveryAvailable ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-rose-500 hover:bg-rose-600 text-white'}`}
                          >
                            {product.deliveryAvailable ? '배달 가능' : '배달 불가'}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => openToggleStatusDialog(product.id, product.name, product.status)}
                            className={`h-8 w-full rounded font-medium transition text-sm
                              ${product.status === 'active'
                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                : 'bg-rose-500 hover:bg-rose-600 text-white'}`}
                          >
                            {product.status === 'active' ? '노출 O' : '노출 X'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteProductDialog(product.id, product.name)}
                            className="h-8 w-full rounded bg-gray-700 text-white hover:bg-gray-800 text-sm"
                          >
                            상품 삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* === 다이얼로그 3종 === */}

      {/* 배달 가능 여부 변경 Dialog */}
      {toggleDeliveryDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">배달 가능 여부 변경</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{toggleDeliveryDialog.productName}"</span> 상품을
              {toggleDeliveryDialog.newAllowed ? ' 배달 가능' : ' 배달 불가'} 처리합니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setToggleDeliveryDialog({ isOpen: false, productId: 0, productName: '', newAllowed: true });
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const { productId, newAllowed } = toggleDeliveryDialog;
                  setToggleDeliveryDialog({ isOpen: false, productId: 0, productName: '', newAllowed: true });
                  programmaticCloseDialog();
                  await handleToggleDeliveryAvailable(productId, newAllowed);
                }}
                className={`flex-1 h-10 rounded text-white font-medium ${toggleDeliveryDialog.newAllowed ? 'bg-green-500 hover:bg-green-600' : 'bg-rose-500 hover:bg-rose-600'
                  }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상품 삭제 확인 Dialog */}
      {deleteProductDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">상품 삭제</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{deleteProductDialog.productName}"</span> 상품을 삭제합니다.
              <br />
              <span className="text-sm text-red-600">이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' });
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setDeleteProductDialog({ isOpen: false, productId: 0, productName: '' });
                  programmaticCloseDialog();
                  await handleDeleteProduct(deleteProductDialog.productId);
                }}
                className="flex-1 h-10 rounded bg-red-500 text-white hover:bg-red-600"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상품 목록 노출 상태 변경 확인 Dialog */}
      {toggleStatusDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">상품 노출 상태 변경</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium">"{toggleStatusDialog.productName}"</span> 상품을
              {toggleStatusDialog.newStatus === 'active' ? ' 목록에 노출' : ' 목록에서 숨김'} 처리합니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });
                  programmaticCloseDialog();
                }}
                className="flex-1 h-10 rounded border text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  const { productId, newStatus } = toggleStatusDialog;
                  setToggleStatusDialog({ isOpen: false, productId: 0, productName: '', newStatus: 'inactive' });
                  programmaticCloseDialog();
                  await handleToggleStatus(productId, newStatus);
                }}
                className={`flex-1 h-10 rounded text-white font-medium ${toggleStatusDialog.newStatus === 'active' ? 'bg-green-500 hover:bg-green-600' : 'bg-rose-500 hover:bg-rose-600'
                  }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB 검색 버튼 */}
      <button
        type="button"
        onClick={search ? clearSearch : openSearchModal}
        aria-label={search ? "필터 초기화" : "상품 검색"}
        className="fixed bottom-4 right-4 z-[60] bg-white rounded-full shadow-lg border-2 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          borderColor: 'var(--color-primary-500)',
          width: search ? 'auto' : '48px',
          height: '48px',
          paddingLeft: search ? '16px' : '0',
          paddingRight: search ? '16px' : '0',
          gap: search ? '6px' : '0',
        }}
      >
        {search ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-500)" strokeWidth="2">
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-500)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}
        {search && <span className="text-sm font-bold text-gray-900">초기화</span>}
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
                  className="w-full h-12 pl-10 pr-10 rounded-lg border-2 border-gray-300 outline-none text-sm bg-white"
                  style={{ ['--tw-ring-color' as any]: 'var(--color-primary-500)' }}
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

            {/* 날짜별 검색 결과 */}
            {tempSearch && (
              <div className="px-4 pb-4">
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  {getAvailableDates(tempSearch).map(date => {
                    const productsForDate = getFilteredProductsForDate(date, tempSearch);
                    if (productsForDate.length === 0) return null;

                    const status = getSellDateStatus(date);

                    return (
                      <div key={date}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800">
                              {formatSellDate(date)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${status.color}`}>
                              {status.text}
                            </span>
                          </div>
                          <span className="text-xs font-medium" style={{ color: 'var(--color-primary-600)' }}>
                            {productsForDate.length}개 상품
                          </span>
                        </div>
                        <div className="space-y-2">
                          {productsForDate.map(product => (
                            <div
                              key={product.id}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                              onClick={() => {
                                setSearch(tempSearch);
                                setFilteredSellDate(date);
                                setSearchModalOpen(false);
                                setTempSearch('');
                                setExpandedGroups(new Set([date]));
                              }}
                            >
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-12 h-12 rounded object-cover border flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate">
                                  {highlightSearchTerm(product.name, tempSearch)}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">{product.price.toLocaleString()}원</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 검색 결과 없음 */}
                {getAvailableDates(tempSearch).every(date => getFilteredCountByDate(date, tempSearch) === 0) && (
                  <div className="text-center text-gray-500 py-6">
                    <div className="text-sm">
                      <span className="font-medium" style={{ color: 'var(--color-primary-600)' }}>"{tempSearch}"</span>에 대한 검색 결과가 없습니다.
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      다른 검색어를 시도해보세요.
                    </div>
                  </div>
                )}
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
                className="flex-1 h-10 rounded-lg text-white font-medium transition-colors hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary-500)' }}
              >
                검색 적용
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 스크롤 투 탑 버튼 (FloatingActions 스타일) */}
      <button
        type="button"
        aria-label="맨 위로"
        onClick={scrollToTop}
        className={`fixed left-4 bottom-4 z-50 rounded-full
                    bg-gradient-to-br from-white to-gray-50 text-gray-900
                    border-2 border-gray-300 shadow-2xl h-12 w-12 grid place-items-center
                    hover:from-white hover:to-gray-100 hover:shadow-[0_12px_24px_rgba(0,0,0,0.2)]
                    active:scale-[0.98] transition
                    ${showScrollToTop ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <span className="text-lg font-bold">↑</span>
      </button>
    </main>
  );
}
