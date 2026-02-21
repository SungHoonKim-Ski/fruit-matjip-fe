import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getCourierProduct } from '../../utils/api';
import { addToCart } from '../../utils/courierCart';
import CourierNav from '../../components/shop/CourierNav';

type ProductDetail = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  weight?: string;
  description?: string;
  detailImages?: string[];
};

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return IMG_BASE ? `${IMG_BASE}/${url}` : url;
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function CourierProductDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getCourierProduct(Number(id));
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return;
          throw new Error('상품 정보를 불러오지 못했습니다.');
        }
        const raw = await res.json();
        const data = raw?.response ?? raw;
        if (alive) {
          const detailUrls: string[] = Array.isArray(data.detail_urls ?? data.detailUrls)
            ? (data.detail_urls ?? data.detailUrls).map((u: string) => addImgPrefix(u))
            : [];
          setProduct({
            id: Number(data.id),
            name: String(data.name ?? ''),
            price: Number(data.price ?? 0),
            stock: Number(data.stock ?? 0),
            imageUrl: addImgPrefix(data.image_url ?? data.imageUrl ?? data.product_url ?? ''),
            weight: data.weight ?? undefined,
            description: data.description ?? undefined,
            detailImages: detailUrls,
          });
        }
      } catch (e: any) {
        safeErrorLog(e, 'CourierProductDetailPage - load');
        show(getSafeErrorMessage(e, '상품 정보를 불러오는 중 오류가 발생했습니다.'), { variant: 'error' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, show]);

  const allImages = product
    ? [product.imageUrl, ...(product.detailImages || [])].filter(Boolean)
    : [];

  const handleQuantityChange = (diff: number) => {
    setQuantity(prev => {
      const next = prev + diff;
      if (next < 1) return 1;
      if (product && next > product.stock) return product.stock;
      return next;
    });
  };

  const handleDirectInput = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) {
      setQuantity(1);
      return;
    }
    if (product && num > product.stock) {
      setQuantity(product.stock);
      return;
    }
    setQuantity(num);
  };

  const handleAddToCart = () => {
    if (!product) return;
    addToCart({
      courierProductId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      imageUrl: product.imageUrl,
      stock: product.stock,
    });
    show('장바구니에 담겼습니다.', { variant: 'info' });
  };

  const handleBuyNow = () => {
    if (!product) return;
    addToCart({
      courierProductId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      imageUrl: product.imageUrl,
      stock: product.stock,
    });
    nav('/shop/checkout');
  };

  if (loading) {
    return (
      <main className="bg-[#f6f6f6] min-h-screen pt-14">
        <CourierNav title="상품 상세" backTo="/shop" />
        <div className="max-w-md mx-auto">
          <div className="w-full aspect-square bg-gray-200 animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-6 bg-gray-200 animate-pulse rounded w-3/4" />
            <div className="h-5 bg-gray-200 animate-pulse rounded w-1/3" />
            <div className="h-20 bg-gray-200 animate-pulse rounded" />
          </div>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="bg-[#f6f6f6] min-h-screen pt-14">
        <CourierNav title="상품 상세" backTo="/shop" />
        <div className="max-w-md mx-auto p-10 text-center text-gray-500">
          상품을 찾을 수 없습니다.
        </div>
      </main>
    );
  }

  return (
    <main className="bg-[#f6f6f6] min-h-screen pt-14 pb-32">
      <CourierNav title="상품 상세" backTo="/shop" />

      <div className="max-w-md mx-auto">
        {/* Main image area */}
        <div className="relative w-full aspect-square bg-gray-100">
          <img
            src={allImages[activeImageIndex] || product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          {product.stock === 0 && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white font-bold text-lg bg-black/60 px-4 py-2 rounded-full">품절</span>
            </div>
          )}
        </div>

        {/* Image thumbnails */}
        {allImages.length > 1 && (
          <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white">
            {allImages.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveImageIndex(i)}
                className={`w-14 h-14 rounded border-2 overflow-hidden flex-shrink-0 transition ${
                  activeImageIndex === i ? 'border-orange-500' : 'border-gray-200'
                }`}
              >
                <img src={src} alt={`${product.name} ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Product info */}
        <div className="bg-white px-4 py-4 mt-1">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{product.name}</h1>
          <div className="mt-2 text-xl font-bold text-orange-500">{formatPrice(product.price)}</div>
          <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
            {product.weight && (
              <span>중량: {product.weight}</span>
            )}
            <span>재고: {product.stock > 0 ? `${product.stock}개` : '품절'}</span>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div className="bg-white px-4 py-4 mt-1">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">상품 설명</h2>
            <div
              className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>
        )}

        {/* Detail images (full-width below description) */}
        {product.detailImages && product.detailImages.length > 0 && (
          <div className="bg-white px-4 py-4 mt-1">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">상세 이미지</h2>
            <div className="space-y-2">
              {product.detailImages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`${product.name} 상세 ${i + 1}`}
                  className="w-full rounded-lg"
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar: quantity + buttons */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-md mx-auto px-4 py-3">
          {product.stock > 0 ? (
            <>
              {/* Quantity selector */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">수량</span>
                <div className="flex items-center border rounded-lg overflow-hidden h-9">
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(-1)}
                    disabled={quantity <= 1}
                    className="w-9 h-full bg-gray-50 hover:bg-gray-100 text-gray-700 text-lg disabled:opacity-30 flex items-center justify-center"
                    aria-label="수량 감소"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={e => handleDirectInput(e.target.value)}
                    className="w-12 h-full text-center text-sm border-x outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min={1}
                    max={product.stock}
                  />
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(1)}
                    disabled={quantity >= product.stock}
                    className="w-9 h-full bg-gray-50 hover:bg-gray-100 text-gray-700 text-lg disabled:opacity-30 flex items-center justify-center"
                    aria-label="수량 증가"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm font-bold text-gray-800">
                  {formatPrice(product.price * quantity)}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex-1 h-12 rounded-lg border-2 border-orange-500 text-orange-500 font-semibold text-sm hover:bg-orange-50 transition"
                >
                  장바구니 담기
                </button>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  className="flex-1 h-12 rounded-lg bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition"
                >
                  바로 주문
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              disabled
              className="w-full h-12 rounded-lg bg-gray-300 text-gray-500 font-semibold text-sm cursor-not-allowed"
            >
              품절된 상품입니다
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
