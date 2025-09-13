import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { listProducts } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getAdminProductsMapped, AdminProductListItem, updateProductOrder } from '../../utils/api';
import AdminHeader from '../../components/AdminHeader';

type Product = AdminProductListItem;

// 상품 아이템 컴포넌트
const ProductItem = ({ 
  product, 
  index
}: { 
  product: Product; 
  index: number; 
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-3 border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200">
      <div className="flex items-center gap-3">
        {/* 순서 번호 */}
        <div className="flex-shrink-0 w-6 h-6 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
          {product.orderIndex || index + 1}
        </div>
        
        {/* 상품 이미지 */}
        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-lg overflow-hidden">
          <img 
            src={product.imageUrl} 
            alt={product.name}
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* 상품 정보 */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {product.name}
          </h3>
          <div className="mt-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-orange-600">
                {product.price.toLocaleString()}원
              </span>
              <span className="text-xs text-gray-500">
                재고 <b>{product.stock}</b>개
              </span>
            </div>
            {product.sellTime && (
              <div className="text-xs text-gray-500 mt-1">
                판매 개시: <b>{formatTime12Hour(product.sellTime.substring(0, 5))}</b>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 날짜별 상품 그룹 컴포넌트
const ProductGroup = ({ 
  dateKey, 
  products, 
  onOpenDialog
}: { 
  dateKey: string; 
  products: Product[]; 
  onOpenDialog: (date: string, products: Product[]) => void;
}) => {
  const sortedProducts = products.sort((a, b) => {
    // orderIndex로 정렬 (오름차순)
    if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
      return a.orderIndex - b.orderIndex;
    }
    if (a.orderIndex !== undefined && b.orderIndex === undefined) return -1;
    if (a.orderIndex === undefined && b.orderIndex !== undefined) return 1;
    return 0;
  });

  const displayProducts = sortedProducts.slice(0, 5);
  const remainingCount = sortedProducts.length - 5;

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
            {products.length}개 상품
          </span>
          <button
            type="button"
            onClick={() => onOpenDialog(dateKey, products)}
            className="px-2 py-1 text-xs font-medium text-orange-600 hover:text-orange-700 border border-orange-300 rounded hover:bg-orange-50 transition-colors"
          >
            순서 변경
          </button>
        </div>
        <div className="flex-1 h-px bg-gray-300"></div>
      </div>
      
      {/* 해당 날짜의 상품들 (최대 5개만 표시) */}
      <div className="space-y-3">
        {displayProducts.map((product, index) => (
          <ProductItem 
            key={product.id} 
            product={product} 
            index={index}
          />
        ))}
        
        {/* 더 많은 상품이 있을 때 표시 */}
        {remainingCount > 0 && (
          <div 
            className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => onOpenDialog(dateKey, products)}
          >
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">{remainingCount}개</span>의 상품이 더 있습니다
            </p>
            <p className="text-xs text-gray-500 mt-1">
              버튼을 클릭하여 모든 상품을 확인하세요
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

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

// 순서 편집 다이얼로그 컴포넌트
const OrderEditDialog = ({
  isOpen,
  onClose,
  date,
  products,
  onSave
}: {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  products: Product[];
  onSave: (updatedProducts: Product[], productOrders: Map<number, number>) => void;
}) => {
  const [productOrders, setProductOrders] = useState<Map<number, number>>(new Map());
  const [usedOrders, setUsedOrders] = useState<Set<number>>(new Set());
  const [sortedProducts, setSortedProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // 다이얼로그가 열릴 때 초기화
  useEffect(() => {
    if (isOpen && products.length > 0) {
      // 초기 순서 설정: 0이나 충돌하는 값들을 위치에 따라 1~n으로 배치
      const initialOrders = new Map<number, number>();
      const initialUsedOrders = new Set<number>();
      
      // 먼저 기존 orderIndex를 그대로 설정 (0이나 충돌 값도 포함)
      products.forEach(product => {
        const orderIndex = product.orderIndex !== undefined ? product.orderIndex : 0;
        initialOrders.set(product.id, orderIndex);
        if (orderIndex > 0) {
          initialUsedOrders.add(orderIndex);
        }
      });
      
      // 0이나 충돌하는 값들을 찾아서 위치에 따라 1~n으로 재배치
      const orderCounts = new Map<number, number>();
      products.forEach(p => {
        const order = initialOrders.get(p.id) || 0;
        orderCounts.set(order, (orderCounts.get(order) || 0) + 1);
      });
      
      // 0이거나 중복되는 제품들을 찾기
      const problematicProducts: number[] = [];
      products.forEach(p => {
        const order = initialOrders.get(p.id) || 0;
        if (order === 0 || orderCounts.get(order)! > 1) {
          problematicProducts.push(p.id);
        }
      });
      
      // 문제가 있는 제품들을 위치에 따라 1~n으로 재배치
      let nextOrder = 1;
      problematicProducts.forEach(productId => {
        // 이미 사용된 순서는 건너뛰기
        while (initialUsedOrders.has(nextOrder)) {
          nextOrder++;
        }
        initialOrders.set(productId, nextOrder);
        initialUsedOrders.add(nextOrder);
        nextOrder++;
      });
      
      setProductOrders(initialOrders);
      setUsedOrders(initialUsedOrders);
      
      // orderIndex 순으로 정렬된 제품 목록
      const sorted = [...products].sort((a, b) => {
        const orderA = initialOrders.get(a.id) || 0;
        const orderB = initialOrders.get(b.id) || 0;
        return orderA - orderB;
      });
      
      setSortedProducts(sorted);
      setSelectedProductId(null);
    }
  }, [isOpen, products]);
  
  // 순서 변경 핸들러
  const handleOrderChange = (productId: number, newOrder: number) => {
    // 현재 제품의 이전 순서
    const currentOrder = productOrders.get(productId);
    
    // 새 순서가 현재 순서와 같으면 아무것도 하지 않음
    if (currentOrder === newOrder) return;
    
    // 순서 업데이트
    const newOrders = new Map(productOrders);
    
    // 새 순서 설정
    newOrders.set(productId, newOrder);
    
    // 다른 제품들의 순서 자동 조정
    if (currentOrder !== undefined && newOrder !== undefined) {
      products.forEach(p => {
        if (p.id !== productId) {
          const order = newOrders.get(p.id) || 0;
          
          // 현재 제품이 앞으로 이동하는 경우 (예: 5 → 2)
          if (currentOrder > newOrder) {
            // newOrder와 currentOrder 사이의 제품들을 +1
            if (order >= newOrder && order < currentOrder) {
              newOrders.set(p.id, order + 1);
            }
          }
          // 현재 제품이 뒤로 이동하는 경우 (예: 2 → 5)
          else if (currentOrder < newOrder) {
            // currentOrder와 newOrder 사이의 제품들을 -1
            if (order > currentOrder && order <= newOrder) {
              newOrders.set(p.id, order - 1);
            }
          }
        }
      });
    }
    
    // 사용 중인 순서 업데이트
    const newUsedOrders = new Set<number>();
    products.forEach(p => {
      const order = newOrders.get(p.id);
      if (order && order > 0) {
        newUsedOrders.add(order);
      }
    });
    
    setProductOrders(newOrders);
    setUsedOrders(newUsedOrders);
    
    // 순서에 따라 제품 목록 재정렬
    const newSortedProducts = [...products].sort((a, b) => {
      const orderA = newOrders.get(a.id) || 0;
      const orderB = newOrders.get(b.id) || 0;
      return orderA - orderB;
    });
    
    setSortedProducts(newSortedProducts);
    
    // 변경된 제품으로 부드럽게 스크롤
    setTimeout(() => {
      scrollToProduct(productId);
    }, 100); // 상태 업데이트 후 스크롤
  };
  


  // 특정 제품으로 스크롤하는 함수
  const scrollToProduct = (productId: number) => {
    const element = document.querySelector(`[data-product-id="${productId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
          <div>{formatDate(date)}</div>
          <div>상품 노출 순서 변경</div>
        </h3>
        
        
        {/* 제품 목록 */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">상품</th>
                <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">순서</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((product) => {
                const currentOrder = productOrders.get(product.id) || 1;
                const isSelected = selectedProductId === product.id;
                
                return (
                  <tr
                    key={product.id}
                    data-product-id={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    className={`cursor-pointer hover:bg-gray-50 ${
                      isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-10 h-10 object-cover rounded"
                        />
                        <div>
                          <div className="font-medium text-sm text-gray-900">{product.name}</div>
                          <div className="text-xs text-gray-500">
                            {product.price.toLocaleString()}원 · 재고 {product.stock}개
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={currentOrder}
                        onChange={(e) => handleOrderChange(product.id, parseInt(e.target.value))}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                      >
                        {Array.from({ length: products.length }, (_, i) => i + 1).map(num => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* 버튼들 */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded bg-gray-500 hover:bg-gray-600 text-white font-medium"
          >
            닫기
          </button>
          <button
            onClick={() => onSave(sortedProducts, productOrders)}
            className="flex-1 h-10 rounded bg-orange-500 hover:bg-orange-600 text-white font-medium"
          >
            변경하기
          </button>
        </div>
      </div>
    </div>
  );
};

// 메인 컴포넌트
const AdminProductOrderPage = () => {
  const { show } = useSnackbar();
  const navigate = useNavigate();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<string>('');
  const [dialogProducts, setDialogProducts] = useState<Product[]>([]);

  // 상품 목록 로드
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      try {
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
            orderIndex: p.orderIndex,
          }));
          
          // 날짜별로 정렬 (미래~과거순), 같은 날짜 내에서는 orderIndex 순
          const sorted = mapped.sort((a, b) => {
            // 1순위: 날짜별 정렬 (미래~과거순)
            if (!a.sellDate && !b.sellDate) return 0;
            if (!a.sellDate) return 1; // sellDate가 없는 것은 뒤로
            if (!b.sellDate) return -1;
            
            const dateCompare = b.sellDate.localeCompare(a.sellDate); // 내림차순 (미래~과거)
            if (dateCompare !== 0) return dateCompare;
            
            // 2순위: 같은 날짜 내에서는 orderIndex 순
            if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
              return a.orderIndex - b.orderIndex; // 오름차순
            }
            if (a.orderIndex !== undefined && b.orderIndex === undefined) return -1;
            if (a.orderIndex === undefined && b.orderIndex !== undefined) return 1;
            
            return 0;
          });
          
          setProducts(sorted);
        } else {
          const mapped = await getAdminProductsMapped();
          
          // 날짜별로 정렬 (미래~과거순), 같은 날짜 내에서는 orderIndex 순
          const sorted = mapped.sort((a, b) => {
            // 1순위: 날짜별 정렬 (미래~과거순)
            if (!a.sellDate && !b.sellDate) return 0;
            if (!a.sellDate) return 1; // sellDate가 없는 것은 뒤로
            if (!b.sellDate) return -1;
            
            const dateCompare = b.sellDate.localeCompare(a.sellDate); // 내림차순 (미래~과거)
            if (dateCompare !== 0) return dateCompare;
            
            // 2순위: 같은 날짜 내에서는 orderIndex 순
            if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
              return a.orderIndex - b.orderIndex; // 오름차순
            }
            if (a.orderIndex !== undefined && b.orderIndex === undefined) return -1;
            if (a.orderIndex === undefined && b.orderIndex !== undefined) return 1;
            
            return 0;
          });
          
          setProducts(sorted);
        }
      } catch (e: any) {
        safeErrorLog(e, 'AdminProductOrderPage - loadProducts');
        show(getSafeErrorMessage(e, '상품 목록을 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        setIsLoading(false);
      }
    };
    loadProducts();
  }, [show]);

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
    
    // 각 날짜 그룹 내에서 orderIndex 순으로 정렬
    Object.keys(groups).forEach(dateKey => {
      groups[dateKey].sort((a, b) => {
        if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
          return a.orderIndex - b.orderIndex;
        }
        if (a.orderIndex !== undefined && b.orderIndex === undefined) return -1;
        if (a.orderIndex === undefined && b.orderIndex !== undefined) return 1;
        return 0;
      });
    });
    
    return groups;
  }, [products]);
  
  // 일별 순서 변경 다이얼로그 열기
  const handleOpenDialog = (date: string, dateProducts: Product[]) => {
    setDialogDate(date);
    setDialogProducts(dateProducts);
    setIsDialogOpen(true);
  };
  
  // 일별 순서 변경 처리
  const handleOrderChange = async (updatedProducts: Product[], productOrders: Map<number, number>) => {
    try {
      // 1. productOrders Map의 순서대로 제품들을 정렬
      const sortedByOrder = [...updatedProducts].sort((a, b) => {
        const orderA = productOrders.get(a.id) || 1;
        const orderB = productOrders.get(b.id) || 1;
        return orderA - orderB;
      });
      
      // 2. 정렬된 순서대로 orderIndex 업데이트
      const updatedProductsWithOrder = sortedByOrder.map((product, index) => ({
        ...product,
        orderIndex: index + 1
      }));
      
      // 3. 전체 제품 배열에서 해당 날짜의 제품들만 업데이트
      const finalProducts = products.map(product => {
        const updatedProduct = updatedProductsWithOrder.find(p => p.id === product.id);
        return updatedProduct || product;
      });
      
      // 4. API 호출로 서버에 반영 (정렬된 순서대로 제품 ID 전송)
      const productIds = updatedProductsWithOrder.map(product => product.id);
      
      if (!USE_MOCKS) {
        await updateProductOrder(productIds);
      }
      
      // 5. 최종 제품들을 날짜별, orderIndex별로 정렬
      const sortedFinalProducts = finalProducts.sort((a, b) => {
        // 1순위: 날짜별 정렬 (미래~과거순)
        if (!a.sellDate && !b.sellDate) return 0;
        if (!a.sellDate) return 1;
        if (!b.sellDate) return -1;
        
        const dateCompare = b.sellDate.localeCompare(a.sellDate);
        if (dateCompare !== 0) return dateCompare;
        
        // 2순위: 같은 날짜 내에서는 orderIndex 순
        if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
          return a.orderIndex - b.orderIndex;
        }
        if (a.orderIndex !== undefined && b.orderIndex === undefined) return -1;
        if (a.orderIndex === undefined && b.orderIndex !== undefined) return 1;
        
        return 0;
      });
      
      // 6. 상태 업데이트
      setProducts(sortedFinalProducts);
      show(`${updatedProductsWithOrder.length}개 품목의 순서가 변경되었습니다.`);
      
    } catch (e: any) {
      safeErrorLog(e, 'AdminProductOrderPage - handleOrderChange');
      show(getSafeErrorMessage(e, '순서 변경 중 오류가 발생했습니다.'), { variant: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex justify-end p-4">
          <AdminHeader />
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="bg-gray-50 min-h-screen px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📋 노출순서 변경</h1>
          <div className="flex justify-end">
            <AdminHeader />
          </div>
        </div>
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">로딩 중...</p>
          </div>
        ) : (
          <div className="space-y-8">
          {Object.entries(groupedProducts)
            .sort(([a], [b]) => {
              if (a === '미설정') return 1;
              if (b === '미설정') return -1;
              return b.localeCompare(a); // 내림차순 (미래~과거)
            })
            .map(([dateKey, dateProducts]) => (
              <ProductGroup
                key={dateKey}
                dateKey={dateKey}
                products={dateProducts}
                onOpenDialog={handleOpenDialog}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* 순서 편집 다이얼로그 */}
      <OrderEditDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        date={dialogDate}
        products={dialogProducts}
        onSave={(updatedProducts, productOrders) => {
          handleOrderChange(updatedProducts, productOrders);
          setIsDialogOpen(false);
        }}
      />
    </main>
  );
};

export default AdminProductOrderPage;