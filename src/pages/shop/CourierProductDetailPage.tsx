import DOMPurify from 'dompurify';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getCourierProduct } from '../../utils/api';
import { addToCart, SelectedOption } from '../../utils/courierCart';
import CourierBottomNav from '../../components/shop/CourierBottomNav';

type OptionItem = {
  id: number;
  name: string;
  additionalPrice: number;
  stock: number | null; // null = unlimited
};

type OptionGroup = {
  id: number;
  name: string;
  required: boolean;
  options: OptionItem[];
};

type ProductDetail = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  weight?: string;
  description?: string;
  detailImages?: string[];
  optionGroups: OptionGroup[];
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
  const [selectedOptions, setSelectedOptions] = useState<Map<number, number>>(new Map()); // groupId -> optionId
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diff = e.changedTouches[0].clientY - dragStartY.current;
    if (diff > 80) closeSheet();
  }, [closeSheet]);

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
          const detailUrls: string[] = Array.isArray(data.detail_image_urls ?? data.detail_urls ?? data.detailUrls)
            ? (data.detail_image_urls ?? data.detail_urls ?? data.detailUrls).map((u: string) => addImgPrefix(u))
            : [];
          const rawGroups = data.option_groups ?? data.optionGroups;
          const optionGroups: OptionGroup[] = Array.isArray(rawGroups)
            ? rawGroups.map((g: any) => ({
                id: Number(g.id),
                name: String(g.name ?? ''),
                required: Boolean(g.required ?? true),
                options: Array.isArray(g.options) ? g.options.map((o: any) => ({
                  id: Number(o.id),
                  name: String(o.name ?? ''),
                  additionalPrice: Number(o.additional_price ?? o.additionalPrice ?? 0),
                  stock: o.stock != null ? Number(o.stock) : null,
                })) : [],
              }))
            : [];
          setProduct({
            id: Number(data.id),
            name: String(data.name ?? ''),
            price: Number(data.price ?? 0),
            stock: Number(data.stock ?? 0),
            imageUrl: addImgPrefix(data.product_url ?? data.image_url ?? data.imageUrl ?? ''),
            weight: data.weight ?? undefined,
            description: data.description ?? undefined,
            detailImages: detailUrls,
            optionGroups,
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

  const handleOptionSelect = (groupId: number, optionId: number) => {
    setSelectedOptions(prev => {
      const next = new Map(prev);
      if (next.get(groupId) === optionId) {
        next.delete(groupId); // deselect
      } else {
        next.set(groupId, optionId);
      }
      return next;
    });
  };

  const optionAdditionalPrice = useMemo(() => {
    if (!product?.optionGroups) return 0;
    let total = 0;
    for (const group of product.optionGroups) {
      const selectedId = selectedOptions.get(group.id);
      if (selectedId) {
        const option = group.options.find(o => o.id === selectedId);
        if (option) total += option.additionalPrice;
      }
    }
    return total;
  }, [product, selectedOptions]);

  const unitPrice = (product?.price ?? 0) + optionAdditionalPrice;

  const canAddToCart = useMemo(() => {
    if (!product?.optionGroups) return true;
    return product.optionGroups
      .filter(g => g.required)
      .every(g => selectedOptions.has(g.id));
  }, [product, selectedOptions]);

  const buildSelectedOptions = (): SelectedOption[] => {
    if (!product?.optionGroups) return [];
    const result: SelectedOption[] = [];
    for (const group of product.optionGroups) {
      const selectedId = selectedOptions.get(group.id);
      if (selectedId) {
        const option = group.options.find(o => o.id === selectedId);
        if (option) {
          result.push({
            groupName: group.name,
            optionId: option.id,
            optionName: option.name,
            additionalPrice: option.additionalPrice,
          });
        }
      }
    }
    return result;
  };

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
    if (!canAddToCart) {
      show('필수 옵션을 선택해주세요.', { variant: 'error' });
      return;
    }
    addToCart({
      courierProductId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      imageUrl: product.imageUrl,
      stock: product.stock,
      selectedOptions: buildSelectedOptions(),
    });
    show('장바구니에 담겼습니다.', { variant: 'info' });
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (!canAddToCart) {
      show('필수 옵션을 선택해주세요.', { variant: 'error' });
      return;
    }
    addToCart({
      courierProductId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      imageUrl: product.imageUrl,
      stock: product.stock,
      selectedOptions: buildSelectedOptions(),
    });
    nav('/shop/checkout');
  };

  if (loading) {
    return (
      <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-32">
        <div className="max-w-md mx-auto px-4 mb-2">
          <button type="button" onClick={() => nav(-1)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900" aria-label="뒤로 가기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            뒤로
          </button>
        </div>
        <div className="max-w-md mx-auto">
          <div className="w-full aspect-square bg-gray-200 animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-6 bg-gray-200 animate-pulse rounded w-3/4" />
            <div className="h-5 bg-gray-200 animate-pulse rounded w-1/3" />
            <div className="h-20 bg-gray-200 animate-pulse rounded" />
          </div>
        </div>
        <CourierBottomNav />
      </main>
    );
  }

  if (!product) {
    return (
      <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-32">
        <div className="max-w-md mx-auto px-4 mb-2">
          <button type="button" onClick={() => nav(-1)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900" aria-label="뒤로 가기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            뒤로
          </button>
        </div>
        <div className="max-w-md mx-auto p-10 text-center text-gray-500">
          상품을 찾을 수 없습니다.
        </div>
        <CourierBottomNav />
      </main>
    );
  }

  return (
    <main className="bg-[#f6f6f6] min-h-screen pt-4 pb-32">
      <div className="max-w-md mx-auto px-4 mb-2">
        <button type="button" onClick={() => nav(-1)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900" aria-label="뒤로 가기">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          뒤로
        </button>
      </div>

      <div className="max-w-md mx-auto">
        {/* Main image */}
        <div className="bg-white">
          <div className="relative w-full">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full block"
            />
            {product.stock === 0 && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-white font-bold text-lg bg-black/60 px-4 py-2 rounded-full">품절</span>
              </div>
            )}
          </div>
        </div>

        {/* Product info */}
        <div className="bg-white px-4 py-4 mt-1">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{product.name}</h1>
          <div className="mt-2 text-xl font-bold text-orange-500">{formatPrice(product.price)}</div>
          <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
            <span>재고: {product.stock > 0 ? `${product.stock}개` : '품절'}</span>
          </div>
        </div>

        {/* Detail images */}
        {product.detailImages && product.detailImages.length > 0 && (
          <div className="bg-white mt-1">
            {product.detailImages.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`${product.name} 상세 ${i + 1}`}
                className="w-full block"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {/* Description */}
        {product.description && (
          <div className="bg-white px-4 py-4 mt-1">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">상품 설명</h2>
            <div
              className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description || '', {
                ALLOWED_TAGS: ['b', 'i', 'u', 'p', 'br', 'ol', 'ul', 'li', 'a', 'img', 'strong', 'em', 'span', 'h1', 'h2', 'h3', 'blockquote'],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'rel', 'class', 'style']
              }) }}
            />
          </div>
        )}

      </div>

      {/* Bottom trigger bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-md mx-auto px-4 py-3">
          {product.stock > 0 ? (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="w-full h-12 rounded-lg bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition"
            >
              구매하기
            </button>
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

      {/* Bottom Sheet Overlay */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 transition-opacity"
          onClick={closeSheet}
        />
      )}

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-out ${
          sheetOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div className="max-w-md mx-auto">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2 cursor-grab">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="px-4 pb-6 space-y-4">
            {/* Option groups */}
            {product.optionGroups && product.optionGroups.length > 0 && (
              <div>
                {product.optionGroups.map(group => (
                  <div key={group.id} className="mb-3 last:mb-0">
                    <div className="text-sm font-semibold text-gray-700 mb-2">
                      {group.name}
                      {group.required && <span className="text-red-500 ml-1">*</span>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map(option => {
                        const isSelected = selectedOptions.get(group.id) === option.id;
                        const isSoldOut = option.stock !== null && option.stock <= 0;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => !isSoldOut && handleOptionSelect(group.id, option.id)}
                            disabled={isSoldOut}
                            className={`px-3 py-2 rounded-lg border text-sm transition ${
                              isSoldOut
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                                : isSelected
                                ? 'border-orange-500 bg-orange-50 text-orange-700 font-medium'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            {option.name}
                            {option.additionalPrice > 0 && (
                              <span className="text-xs ml-1 text-gray-500">
                                (+{option.additionalPrice.toLocaleString()}원)
                              </span>
                            )}
                            {isSoldOut && (
                              <span className="text-xs ml-1 text-red-400">품절</span>
                            )}
                            {option.stock !== null && option.stock > 0 && option.stock <= 10 && (
                              <span className="text-xs ml-1 text-orange-500">
                                ({option.stock}개 남음)
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity selector */}
            <div className="flex items-center justify-between">
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
            </div>

            {/* Total price */}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-gray-600">총 금액</span>
              <span className="text-lg font-bold text-orange-500">
                {formatPrice(unitPrice * quantity)}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { handleAddToCart(); closeSheet(); }}
                disabled={!canAddToCart}
                className="flex-1 h-12 rounded-lg border-2 border-orange-500 text-orange-500 font-semibold text-sm hover:bg-orange-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                장바구니 담기
              </button>
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={!canAddToCart}
                className="flex-1 h-12 rounded-lg bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                바로 주문
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
