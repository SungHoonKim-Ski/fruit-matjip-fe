/**
 * 주문 관련 Mock 데이터
 */

export type OrderItem = {
  id: number;
  name: string;
  quantity: number;
  price: number;
  imageUrl?: string;
};

export type OrderRow = {
  id: number;
  displayCode: string;
  date: string;           // YYYY-MM-DD
  status: 'pending' | 'picked' | 'canceled';
  items: OrderItem[];
  deliveryOrderCode?: string;
  delivery?: {
    status?: string;
    displayCode?: string;
    deliveryHour?: number;
    deliveryMinute?: number;
    deliveryFee?: number;
    estimatedMinutes?: number;
    acceptedAt?: string;
    scheduledDeliveryHour?: number | null;
    scheduledDeliveryMinute?: number | null;
  };
};

export const mockOrders: OrderRow[] = [
  {
    id: 101,
    displayCode: 'R-101',
    date: '2025-08-11',
    status: 'pending',
    items: [
      { id: 1, name: '신선한 토마토 1kg', quantity: 2, price: 3000, imageUrl: '/images/image1.png' },
    ],
  },
  {
    id: 102,
    displayCode: 'R-102',
    date: '2025-08-12',
    status: 'picked',
    items: [
      { id: 2, name: '유기농 감자 2kg', quantity: 1, price: 3000, imageUrl: '/images/image2.png' },
      { id: 3, name: '햇양파 1.5kg', quantity: 1, price: 3000, imageUrl: '/images/image3.png' },
    ],
  },
  {
    id: 103,
    displayCode: 'R-103',
    date: '2025-08-13',
    status: 'pending',
    items: [
      { id: 4, name: '제주 감귤 3kg', quantity: 1, price: 5000, imageUrl: '/images/image4.png' },
    ],
  },
  {
    id: 104,
    displayCode: 'R-104',
    date: '2025-08-14',
    status: 'canceled',
    items: [
      { id: 5, name: 'GAP 사과 2kg', quantity: 2, price: 7000, imageUrl: '/images/image5.png' },
    ],
  },
  {
    id: 105,
    displayCode: 'R-105',
    date: '2025-08-15',
    status: 'pending',
    items: [
      { id: 6, name: '친환경 바나나 1송이', quantity: 1, price: 4500, imageUrl: '/images/image6.png' },
    ],
  },
  {
    id: 106,
    displayCode: 'R-106',
    date: '2025-08-16',
    status: 'pending',
    items: [
      { id: 7, name: '신선한 딸기 500g', quantity: 2, price: 8000, imageUrl: '/images/image7.png' },
    ],
  },
];

// Mock API 함수들
export const listOrders = async (page: number = 1): Promise<{ rows: OrderRow[]; hasMore: boolean }> => {
  // 페이지네이션 시뮬레이션
  const pageSize = 10;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedOrders = mockOrders.slice(startIndex, endIndex);
  
  return {
    rows: paginatedOrders,
    hasMore: endIndex < mockOrders.length
  };
};
