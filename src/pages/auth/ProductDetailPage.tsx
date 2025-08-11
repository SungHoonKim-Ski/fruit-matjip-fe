import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  sellDate?: string;       // YYYY-MM-DD
  description?: string;
  images?: string[];
};

const KRW = (n: number) => n.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

export default function ProductDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { show } = useSnackbar();
  const API_BASE = process.env.REACT_APP_API_BASE || '';

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        if (USE_MOCKS) {
          const data = getProductById(Number(id!));
          if (!data) throw new Error('상품 정보를 불러오지 못했습니다.');
          if (alive) {
            setProduct(data as Product);
            setActiveImage((data as Product).images?.[0] || (data as Product).imageUrl);
          }
        } else {
          const res = await fetch(`${API_BASE}/api/products/${id}`);
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            await res.text();
            throw new Error('서버 응답이 JSON이 아닙니다. API 주소 설정을 확인해주세요.');
          }
          if (!res.ok) throw new Error('상품 정보를 불러오지 못했습니다.');
          const data = (await res.json()) as Product;
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
  }, [id, show, API_BASE]);

  // 예약 관련 기능은 사용자 상세에서 숨김 처리

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-16 pb-24">
        <div className="max-w-md mx-auto">
          <div className="w-full aspect-[4/3] bg-gray-200 animate-pulse rounded-lg" />
          <div className="mt-4 h-6 bg-gray-200 animate-pulse rounded w-2/3" />
          <div className="mt-2 h-4 bg-gray-200 animate-pulse rounded w-1/2" />
          <div className="mt-6 h-24 bg-gray-200 animate-pulse rounded" />
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-16">
        <div className="max-w-md mx-auto text-center text-gray-500">
          상품을 찾을 수 없어요.
          <div className="mt-4">
            <button onClick={() => nav(-1)} className="h-10 px-4 rounded border">뒤로가기</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-16 pb-28">
      {/* 상단 바 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b">
        <div className="mx-auto max-w-md h-14 flex items-center justify-between px-4">
          <button onClick={() => nav(-1)} className="text-sm text-gray-600">← 뒤로</button>
          <div className="font-bold text-gray-800">상품 상세</div>
          <div className="w-8" />
        </div>
      </header>

      <section className="max-w-md mx-auto">
        <div>
          <img
            src={activeImage || product.imageUrl}
            alt={product.name}
            className="w-full aspect-[4/3] object-cover rounded-lg border"
          />
        </div>

        <div className="mt-4 bg-white rounded-lg shadow p-4">
          <h1 className="text-xl font-bold">{product.name}</h1>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-orange-600 font-semibold">{KRW(product.price)}</span>
            <span className="text-sm text-gray-500">재고 {product.stock}개</span>
          </div>

          {/* 판매일 표시 제거 */}

          {product.description && (
            <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap break-keep">
              {product.description}
            </p>
          )}

          {/* 예약 관련 UI 제거 */}
          {/* 추가 이미지: 하단에 한번에 표시 */}
          {product.images && product.images.length > 0 && (
            <div className="mt-6">
              <h3 className="text-base font-semibold text-gray-800 mb-2">추가 이미지</h3>
              <div className="flex flex-col gap-3">
                {product.images.map((src) => (
                  <img key={src} src={src} alt="sub" className="w-full object-cover rounded border" />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}