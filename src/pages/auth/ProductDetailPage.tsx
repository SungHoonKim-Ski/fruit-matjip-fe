import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { USE_MOCKS } from '../../config';
import { getProductById } from '../../mocks/products';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getProduct } from '../../utils/api';

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  sellDate?: string;
  description?: string;
  detail_images?: string[];
};

const KRW = (n: number) => n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

// HTML 텍스트를 안전하게 렌더링하는 함수
const renderSafeHTML = (html: string) => {
  if (!html) return '';

  // 블록 태그가 하나도 없을 때만 \n -> <br> 치환
  const hasBlock = /<\/?(div|p|ul|ol|li|h[1-6])\b/i.test(html);
  let processed = hasBlock ? html : html.replace(/\n/g, '<br>');

  const allowedTags = ['b', 'strong', 'span', 'div', 'p', 'br'];

  return processed.replace(/<(\/?)([\w-]+)([^>]*)>/g, (match, closing, tagName, attrs) => {
    const t = tagName.toLowerCase();

    // br은 그대로 통과
    if (t === 'br') return '<br>';

    // 허용된 태그만 살림
    if (!allowedTags.includes(t)) return '';

    // 닫는 태그는 그대로
    if (closing === '/') return `</${t}>`;

    // span/div는 style에서 font-size, text-align만 통과 + line-height 보정
    if ((t === 'span' || t === 'div') && attrs) {
      const styleMatch = attrs.match(/style="([^"]*)"/i);
      const style = styleMatch?.[1] || '';
      const fontSizeMatch = style.match(/font-size:\s*(14px|24px|40px)/i);
      const alignMatch = style.match(/text-align:\s*(left|center|right)/i);

      const fontSize = fontSizeMatch?.[1];
      const lineHeight =
        fontSize === '14px' ? '22px' :
        fontSize === '24px' ? '34px' :
        fontSize === '40px' ? '56px' : undefined;

      const css = [
        fontSize ? `font-size:${fontSize}` : '',
        lineHeight ? `line-height:${lineHeight}` : '',
        alignMatch ? `text-align:${alignMatch[1]}` : '',
      ].filter(Boolean).join('; ');

      return css ? `<${t} style="${css}">` : `<${t}>`;
    }

    // 기본 허용 태그(b,strong,p,div)
    return `<${t}>`;
  });
};

interface ProductDetailPageProps {
  isOpen: boolean;
  onClose: () => void;
  productId: number;
}

export default function ProductDetailPage({ isOpen, onClose, productId }: ProductDetailPageProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState<string>('');
  const { show } = useSnackbar();

  useEffect(() => {
    if (!isOpen || !productId) return;
    
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (USE_MOCKS) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const data = getProductById(productId);
          if (!data) throw new Error('상품 정보를 불러오지 못했습니다.');
          if (alive) {
            setProduct(data as Product);
            setActiveImage((data as Product).imageUrl);
          }
        } else {
          const res = await getProduct(productId);
          if (!res.ok) throw new Error('상품 정보를 불러오지 못했습니다.');
          const rawData = await res.json();
          
          // API 응답 매핑: 메인 이미지 + 상세 이미지(detail_images 우선)
          const imgBase = process.env.REACT_APP_IMG_URL || '';
          const toAbs = (u: string) => (u?.startsWith('http') ? u : (imgBase ? `${imgBase}/${u}` : u));

          const detailList: string[] = Array.isArray(rawData.detail_images)
            ? rawData.detail_images
            : (Array.isArray(rawData.images) ? rawData.images : []);

          const data: Product = {
            ...rawData,
            imageUrl: rawData.image_url ? toAbs(rawData.image_url) : (rawData.imageUrl || ''),
            detail_images: detailList.map(toAbs),
          } as Product;
          
          if (alive) {
            setProduct(data);
            setActiveImage(data.imageUrl);
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
  }, [isOpen, productId, show]);

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

                <div className="mt-4 rounded-md border bg-gray-50 p-3 text-xs text-gray-700 space-y-2">
                  <div className="font-semibold text-gray-800">배송/교환/환불 안내</div>
                  <ul className="list-disc list-inside space-y-1">
                    <li>서비스 제공 기간: 수령일 당일 수령/배달(배달 12~20시)</li>
                    <li>교환/환불: 수령 후 7일 이내 요청 가능 (신선식품 특성상 제한될 수 있음)</li>
                    <li>정기결제: 제공하지 않습니다.</li>
                  </ul>
                  <div className="flex flex-wrap gap-3 text-blue-600">
                    <Link to="/refund" className="hover:underline">교환/환불 정책</Link>
                    <Link to="/terms" className="hover:underline">이용약관</Link>
                  </div>
                </div>

                {/* 추가 이미지 */}
                {product.detail_images && product.detail_images.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-base font-semibold text-gray-800 mb-2">상세 이미지</h3>
                    <div className="flex flex-col gap-3">
                      {product.detail_images.map((src) => (
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
