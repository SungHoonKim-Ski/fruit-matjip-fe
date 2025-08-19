// src/mocks/products.ts
// Simple in-memory + localStorage backed mock data for products

export type MockProduct = {
  id: number;
  name: string;
  price: number;
  stock: number;
  imageUrl: string;
  sellDate?: string;
  description?: string;
  images?: string[]; // additional gallery images
  totalSold?: number;
};

const STORAGE_KEY = 'mock_products_v1';

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const base = new Date();
base.setMinutes(base.getMinutes() - base.getTimezoneOffset());

const todayStr = (() => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
})();

const tomorrowStr = toYmd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1));
const plus2Str = toYmd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 2));
const yesterdayStr = toYmd(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1));
const minus2Str = toYmd(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 2));

const seedProducts: MockProduct[] = [
  {
    id: 1,
    name: '신선한 토마토 1kg',
    price: 3000,
    stock: 8,
    imageUrl: '/images/image1.png',
    sellDate: tomorrowStr, // 판매 전 (미래)
    description: '안녕하세요! 이것은 <b>굵은 텍스트</b>입니다.<br><br>이것은 보통 크기 텍스트입니다.<br><span style="font-size: 24px">이것은 큰 텍스트입니다.</span><br><span style="font-size: 40px">이것은 매우 큰 텍스트입니다.</span><br><br>여러 줄로 작성된<br>상품 설명입니다.',
    images: ['/images/image1.png', '/images/image2.png'],
    totalSold: 24,
  },
  {
    id: 2,
    name: '유기농 감자 2kg',
    price: 3000,
    stock: 0,
    imageUrl: '/images/image2.png',
    sellDate: todayStr, // 판매 당일
    description: '감칠맛 좋은 유기농 감자.',
    images: ['/images/image2.png'],
    totalSold: 12,
  },
  {
    id: 3,
    name: '햇양파 1.5kg',
    price: 3000,
    stock: 12,
    imageUrl: '/images/image3.png',
    sellDate: yesterdayStr, // 판매 후 (지남)
    description: '매콤달콤한 햇양파.',
    images: ['/images/image3.png'],
    totalSold: 7,
  },
  {
    id: 4,
    name: '아보카도 5입',
    price: 6900,
    stock: 15,
    imageUrl: '/images/image1.png',
    sellDate: plus2Str, // 판매 전 (미래)
    description: '부드럽고 고소한 아보카도.',
    images: ['/images/image1.png'],
    totalSold: 3,
  },
  {
    id: 5,
    name: '바나나 1송이',
    price: 3500,
    stock: 0,
    imageUrl: '/images/image2.png',
    sellDate: todayStr, // 판매 당일
    description: '달콤한 바나나.',
    images: ['/images/image2.png'],
    totalSold: 18,
  },
  {
    id: 6,
    name: '블루베리 500g',
    price: 5900,
    stock: 6,
    imageUrl: '/images/image3.png',
    sellDate: minus2Str, // 판매 후 (지남)
    description: '상큼한 블루베리.',
    images: ['/images/image3.png'],
    totalSold: 11,
  },
  // 관리자 검증용: 고정 날짜 8/10, 8/11, 8/12
  {
    id: 7,
    name: '복숭아 6입',
    price: 8900,
    stock: 9,
    imageUrl: '/images/image1.png',
    sellDate: '2025-08-10',
    description: '달콤한 복숭아.',
    images: ['/images/image1.png'],
    totalSold: 5,
  },
  {
    id: 8,
    name: '귤 2kg',
    price: 5900,
    stock: 20,
    imageUrl: '/images/image2.png',
    sellDate: '2025-08-11',
    description: '새콤달콤 귤.',
    images: ['/images/image2.png'],
    totalSold: 14,
  },
  {
    id: 9,
    name: '샤인머스켓 1송이',
    price: 12900,
    stock: 4,
    imageUrl: '/images/image3.png',
    sellDate: '2025-08-12',
    description: '탱글한 샤인머스켓.',
    images: ['/images/image3.png'],
    totalSold: 2,
  },
];

function load(): MockProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...seedProducts];
    const parsed = JSON.parse(raw) as MockProduct[];
    if (!Array.isArray(parsed)) return [...seedProducts];
    return parsed;
  } catch {
    return [...seedProducts];
  }
}

function save(list: MockProduct[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

let productsCache: MockProduct[] | null = null;

export function listProducts(): MockProduct[] {
  if (!productsCache) productsCache = load();
  return [...productsCache];
}

export function getProductById(id: number): MockProduct | null {
  return listProducts().find(p => p.id === id) || null;
}

export type MockProductUpdate = {
  id: number;
  name?: string;
  price?: number;
  stock?: number;
  imageUrl?: string;
  sellDate?: string | null;
  description?: string;
  images?: string[];
};

export function updateProduct(update: MockProductUpdate): MockProduct {
  const current = listProducts();
  const idx = current.findIndex(p => p.id === update.id);
  if (idx < 0) throw new Error('상품을 찾을 수 없습니다.');
  const next: MockProduct = {
    ...current[idx],
    ...update,
    sellDate: update.sellDate === null ? undefined : update.sellDate ?? current[idx].sellDate,
  };
  current[idx] = next;
  productsCache = current;
  save(current);
  return next;
}

export function deleteProduct(id: number) {
  const current = listProducts();
  const next = current.filter(p => p.id !== id);
  productsCache = next;
  save(next);
}

export async function reserveItems(items: { id: number; qty: number }[]) {
  const current = listProducts();
  const map = new Map(current.map(p => [p.id, p] as const));
  for (const { id, qty } of items) {
    const p = map.get(id);
    if (!p) throw new Error('상품 없음');
    p.stock = Math.max(0, p.stock - Math.max(0, qty));
  }
  const next = Array.from(map.values());
  productsCache = next;
  save(next);
}

export async function mockUploadImage(file: File): Promise<string> {
  // Return a blob URL for preview purposes in mock mode
  return URL.createObjectURL(file);
}


