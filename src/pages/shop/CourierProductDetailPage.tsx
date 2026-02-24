import DOMPurify from 'dompurify';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import { safeErrorLog, getSafeErrorMessage } from '../../utils/environment';
import { getCourierProduct, getCourierConfig, type CourierConfigResponse } from '../../utils/api';
import { addToCart, setBuyNowItem, SelectedOption } from '../../utils/courierCart';
import { theme } from '../../brand';

type OptionItem = {
  id: number;
  name: string;
  additionalPrice: number;
  stock: number | null;
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
  soldOut?: boolean;
  imageUrl: string;
  weight?: string;
  description?: string;
  optionGroups: OptionGroup[];
};

interface CourierProductDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  productId: number;
}

const IMG_BASE = process.env.REACT_APP_IMG_URL || '';

const addImgPrefix = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return IMG_BASE ? `${IMG_BASE}/${url}` : url;
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const DRAG_CLOSE_THRESHOLD = 80;

export default function CourierProductDetailPage({ isOpen, onClose, productId }: CourierProductDetailDialogProps) {
  const nav = useNavigate();
  const { show } = useSnackbar();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [courierConfig, setCourierConfig] = useState<CourierConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Map<number, number>>(new Map());
  const [showOrderSheet, setShowOrderSheet] = useState(false);
  const [sheetAnimating, setSheetAnimating] = useState(false);

  // Drag state
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setProduct(null);
        setQuantity(1);
        setSelectedOptions(new Map());
        setShowOrderSheet(false);
        setSheetAnimating(false);
        const [res, configData] = await Promise.all([
          getCourierProduct(productId),
          getCourierConfig().catch(() => null),
        ]);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) return;
          throw new Error('상품 정보를 불러오지 못했습니다.');
        }
        const raw = await res.json();
        const data = raw?.response ?? raw;
        if (alive && configData) setCourierConfig(configData);
        if (alive) {
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
            soldOut: data.sold_out === true || data.soldOut === true,
            imageUrl: addImgPrefix(data.product_url ?? data.image_url ?? data.imageUrl ?? ''),
            weight: data.weight ?? undefined,
            description: data.description ?? undefined,
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
  }, [isOpen, productId, show]);

  const handleOptionSelect = (groupId: number, optionId: number) => {
    setSelectedOptions(prev => {
      const next = new Map(prev);
      if (next.get(groupId) === optionId) {
        next.delete(groupId);
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
      return next;
    });
  };

  const handleDirectInput = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) {
      setQuantity(1);
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
      selectedOptions: buildSelectedOptions(),
    });
    show('장바구니에 담겼습니다.', { variant: 'info' });
    closeOrderSheet();
    onClose();
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (!canAddToCart) {
      show('필수 옵션을 선택해주세요.', { variant: 'error' });
      return;
    }
    setBuyNowItem({
      courierProductId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      imageUrl: product.imageUrl,
      selectedOptions: buildSelectedOptions(),
    });
    nav('/shop/checkout');
  };

  const openOrderSheet = () => {
    setShowOrderSheet(true);
    requestAnimationFrame(() => setSheetAnimating(true));
  };

  const closeOrderSheet = useCallback(() => {
    setSheetAnimating(false);
    setDragY(0);
    setIsDragging(false);
    setTimeout(() => setShowOrderSheet(false), 300);
  }, []);

  // --- Drag handlers ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, delta)); // only allow dragging down
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    if (dragY > DRAG_CLOSE_THRESHOLD) {
      closeOrderSheet();
    } else {
      setDragY(0);
    }
    setIsDragging(false);
  }, [isDragging, dragY, closeOrderSheet]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[#f6f6f6] rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col relative overflow-hidden">
        {/* Dialog header */}
        <div className="bg-white z-10 flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <span className="font-semibold text-gray-900">상품 상세</span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 transition p-1"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              <div className="w-full aspect-square bg-gray-200 animate-pulse rounded" />
              <div className="h-6 bg-gray-200 animate-pulse rounded w-3/4" />
              <div className="h-5 bg-gray-200 animate-pulse rounded w-1/3" />
              <div className="h-20 bg-gray-200 animate-pulse rounded" />
            </div>
          ) : !product ? (
            <div className="p-10 text-center text-gray-500">
              상품을 찾을 수 없습니다.
            </div>
          ) : (
            <>
              {/* Main image */}
              <div className="bg-white">
                <div className="relative w-full">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className={`w-full block${product.soldOut ? ' opacity-40' : ''}`}
                  />
                  {product.soldOut && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-white font-bold text-lg bg-black/60 px-4 py-2 rounded-full">품절</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Product info */}
              <div className="bg-white px-4 py-4 mt-1">
                <h1 className="text-lg font-bold text-gray-900 leading-tight">{product.name}</h1>
                <div className="mt-2 text-xl font-bold" style={{ color: 'var(--color-primary-700)' }}>{formatPrice(product.price)}</div>
                {courierConfig && (
                  <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                    <div>
                      배송비 {courierConfig.shippingBaseFee.toLocaleString()}원
                      {courierConfig.freeShippingThreshold != null && ` | ${courierConfig.freeShippingThreshold.toLocaleString()}원 이상 무료배송`}
                    </div>
                    {courierConfig.remoteAreaExtraFee > 0 && (
                      <div>도서산간 추가 {courierConfig.remoteAreaExtraFee.toLocaleString()}원</div>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              {product.description && (
                <div className="bg-white px-4 py-4 mt-1">
                  <h2 className="text-sm font-semibold text-gray-700 mb-2">상품 설명</h2>
                  <style>{`
                    .desc-content img { width: 100%; height: auto; border-radius: 4px; margin: 8px 0; }
                    .desc-content p { margin: 4px 0; }
                    .desc-content ul { list-style: disc; padding-left: 20px; }
                    .desc-content ol { list-style: decimal; padding-left: 20px; }
                    .desc-content li { margin: 2px 0; }
                    .desc-content a { color: #2563eb; text-decoration: underline; }
                    .desc-content blockquote { border-left: 4px solid #d1d5db; padding-left: 12px; font-style: italic; }
                    .desc-content strong, .desc-content b { font-weight: bold; }
                    .desc-content em, .desc-content i { font-style: italic; }
                    .desc-content .ql-size-small { font-size: 0.75rem; }
                    .desc-content .ql-size-large { font-size: 1.25rem; }
                    .desc-content .ql-size-huge { font-size: 1.5rem; }
                  `}</style>
                  <div
                    className="desc-content text-sm text-gray-600 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description || '', {
                      ALLOWED_TAGS: ['b', 'i', 'u', 'p', 'br', 'ol', 'ul', 'li', 'a', 'img', 'strong', 'em', 'span', 'h1', 'h2', 'h3', 'blockquote'],
                      ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'rel', 'class', 'style']
                    }) }}
                  />
                </div>
              )}

              {/* Legal info */}
              <div className="mt-4 mx-4 rounded-md border bg-white p-3 text-xs text-gray-700 space-y-2">
                <div className="font-semibold text-gray-800">배송/교환/환불 안내</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>택배 배송 (결제 후 2-3일 이내 발송)</li>
                  <li>교환/환불: 수령 후 7일 이내 요청 가능 (신선식품 특성상 제한될 수 있음)</li>
                </ul>
                <div className="flex flex-wrap gap-3 text-blue-600">
                  <Link to="/store/refund" target="_blank" rel="noopener noreferrer" className="hover:underline">교환/환불 정책</Link>
                  <Link to="/store/terms" target="_blank" rel="noopener noreferrer" className="hover:underline">이용약관</Link>
                </div>
              </div>

              <div className="mt-3 mx-4 mb-4 rounded-md border bg-white p-3 text-xs text-gray-600 space-y-1">
                <div className="font-semibold text-gray-800">{theme.companyName}</div>
                <div>대표자: {theme.contact.representative}</div>
                <div>사업자등록번호: {theme.contact.businessNumber}</div>
                {theme.contact.address && <div>주소: {theme.contact.address}</div>}
                <div>전화번호: {theme.contact.phone}</div>
              </div>
            </>
          )}
        </div>

        {/* Bottom bar: 주문하기 or 품절 */}
        {!loading && product && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0 z-20">
            {product.soldOut ? (
              <div className="w-full h-12 rounded-lg bg-gray-200 flex items-center justify-center text-gray-500 font-semibold text-sm">
                품절된 상품입니다
              </div>
            ) : (
              <button
                type="button"
                onClick={showOrderSheet ? closeOrderSheet : openOrderSheet}
                className="w-full h-12 rounded-lg text-white font-semibold text-sm transition"
                style={{ backgroundColor: 'var(--color-primary-500)' }}
              >
                {showOrderSheet ? '닫기' : '주문하기'}
              </button>
            )}
          </div>
        )}

        {/* Order sheet overlay (inside modal) */}
        {showOrderSheet && product && !product.soldOut && (
          <div
            className={`absolute inset-0 top-[52px] bottom-[72px] z-10 flex items-end transition-opacity duration-300 ${
              sheetAnimating && dragY === 0 ? 'bg-black/30' : 'bg-black/0'
            }`}
            onClick={closeOrderSheet}
          >
            <div
              ref={sheetRef}
              className={`bg-white rounded-t-2xl shadow-xl w-full max-h-full flex flex-col ${
                isDragging ? '' : 'transition-transform duration-300 ease-out'
              } ${sheetAnimating ? '' : 'translate-y-full'}`}
              style={{ transform: sheetAnimating ? `translateY(${dragY}px)` : undefined }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div
                className="flex justify-center pt-3 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* Scrollable: options + quantity */}
              <div className="overflow-y-auto flex-1 px-4 pt-1 pb-2">
                {/* Option groups */}
                {product.optionGroups && product.optionGroups.length > 0 && (
                  <div className="mb-3">
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
                                    ? 'font-medium'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                }`}
                                style={!isSoldOut && isSelected ? { borderColor: 'var(--color-primary-500)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-700)' } : undefined}
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
                                  <span className="text-xs ml-1" style={{ color: 'var(--color-primary-600)' }}>
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
                <div className="flex items-center justify-between py-3 border-t border-gray-100">
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
                    />
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(1)}
                      className="w-9 h-full bg-gray-50 hover:bg-gray-100 text-gray-700 text-lg disabled:opacity-30 flex items-center justify-center"
                      aria-label="수량 증가"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Total + action buttons */}
              <div className="px-4 py-3 border-t border-gray-200 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">총 금액</span>
                  <span className="text-lg font-bold" style={{ color: 'var(--color-primary-700)' }}>
                    {formatPrice(unitPrice * quantity)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={!canAddToCart}
                    className="flex-1 h-12 rounded-lg border-2 font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--color-primary-500)', color: 'var(--color-primary-500)' }}
                  >
                    장바구니 담기
                  </button>
                  <button
                    type="button"
                    onClick={handleBuyNow}
                    disabled={!canAddToCart}
                    className="flex-1 h-12 rounded-lg text-white font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--color-primary-500)' }}
                  >
                    바로 주문
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
