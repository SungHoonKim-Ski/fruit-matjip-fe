import React, { useEffect, useState } from 'react';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { getProductById } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  sellDate?: string;
  description?: string;
  images?: string[];
};

const KRW = (n: number) => n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

// HTML 텍스트를 안전하게 렌더링하는 함수
const renderSafeHTML = (text: string) => {
  // 허용된 태그만 유지하고 나머지는 제거
  const allowedTags = ['b', 'strong', 'span'];
  
  // 개행 문자를 <br> 태그로 변환
  let processedText = text.replace(/\n/g, '<br>');
  
  return processedText.replace(/<(\/?)([\w-]+)([^>]*)>/g, (match, closing, tagName, attributes) => {
    // br 태그는 허용
    if (tagName.toLowerCase() === 'br') {
      return '<br>';
    }
    
    // 허용된 태그가 아니면 제거
    if (!allowedTags.includes(tagName.toLowerCase())) {
      return '';
    }
    
    // 닫는 태그는 그대로 허용
    if (closing === '/') {
      return `</${tagName}>`;
    }
    
    // style 속성만 허용하고 font-size만 허용
    if (attributes && tagName.toLowerCase() === 'span') {
      const styleMatch = attributes.match(/style="([^"]*)"/) || [];
      const style = styleMatch[1] || '';
      
      // font-size만 허용
      if (style.includes('font-size:')) {
        const fontSizeMatch = style.match(/font-size:\s*(\d+px)/);
        if (fontSizeMatch) {
          const fontSize = fontSizeMatch[1];
          // 허용된 크기만 허용 + 크기에 따른 line-height 설정
          if (['14px', '24px', '40px'].includes(fontSize)) {
            const lineHeight = fontSize === '14px' ? '22px' : fontSize === '24px' ? '34px' : '56px';
            return `<span style="font-size: ${fontSize}; line-height: ${lineHeight}">`;
          }
        }
      }
    }
    
    // 기본 태그 (b, strong)
    return `<${tagName}>`;
  });
};

interface ProductDetailPageProps {
  isOpen: boolean;
  onClose: () => void;
  productId: number;
}

export default function ProductDetailPage({ isOpen, onClose, productId }: ProductDetailPageProps) {
  const { show } = useSnackbar();
  const API_BASE = process.env.REACT_APP_API_BASE || '';

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !productId) return;
    
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (USE_MOCKS) {
          const data = getProductById(productId);
          if (!data) throw new Error('상품 정보를 불러오지 못했습니다.');
          if (alive) {
            setProduct(data as Product);
            setActiveImage((data as Product).images?.[0] || (data as Product).imageUrl);
          }
        } else {
          const res = await fetch(`${API_BASE}/api/products/${productId}`);
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            await res.text();
            throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
          }
          if (!res.ok) throw new Error('상품 정보를 불러오지 못했습니다.');
          const data = await res.json() as Product;
          if (alive) {
            setProduct(data);
            setActiveImage(data.images?.[0] || data.imageUrl);
          }
        }
      } catch (e: any) {
        safeErrorLog(e, 'ProductDetailPage - loadProduct');
        show(getSafeErrorMessage(e, '상품 정보를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isOpen, productId, show, API_BASE]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Dialog 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">상품 상세</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Dialog 내용 */}
        <div className="p-4">
          {loading ? (
            <div className="space-y-4">
              <div className="w-full aspect-[4/3] bg-gray-200 animate-pulse rounded-lg" />
              <div className="h-6 bg-gray-200 animate-pulse rounded w-2/3" />
              <div className="h-4 bg-gray-200 animate-pulse rounded w-1/2" />
            </div>
          ) : product ? (
            <>
            <div>
            <h1 className="text-xl font-bold">{product.name}</h1>
                <div className="mt-1 flex items-center justify-between" />
                <span className="text-orange-600 font-semibold">{KRW(product.price)}</span>                  
            </div>
              <div>
                <img
                  src={activeImage || product.imageUrl}
                  alt={product.name}
                  className="w-full aspect-[4/3] object-cover rounded-lg border"
                />
              </div>

              <div className="mt-4">
                

                {product.description && (
                  <div 
                    className="mt-3 text-sm text-gray-700 break-keep leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderSafeHTML(product.description) }}
                  />
                )}

                {/* 추가 이미지 */}
                {product.images && product.images.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-base font-semibold text-gray-800 mb-2">상세 이미지</h3>
                    <div className="flex flex-col gap-3">
                      {product.images.map((src) => (
                        <img key={src} src={src} alt="sub" className="w-full object-cover rounded border" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 py-8">
              상품을 찾을 수 없어요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}