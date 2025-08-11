/**
 * 판매 관련 Mock 데이터
 */

export type SaleRow = {
  id: number;
  date: string;        // YYYY-MM-DD
  productName: string;
  buyerName: string;
  price: number;       // 단가
  quantity: number;    // 수량
  revenue: number;     // 매출
};

export const mockSales: SaleRow[] = [
  { id: 1, date: '2025-08-07', productName: '신선한 토마토 1kg', buyerName: '홍길동', price: 3000, quantity: 5,  revenue: 15000 },
  { id: 2, date: '2025-08-07', productName: '유기농 감자 2kg',   buyerName: '이민지', price: 3000, quantity: 2,  revenue:  6000 },
  { id: 3, date: '2025-08-08', productName: '햇양파 1.5kg',     buyerName: '박철수', price: 3000, quantity: 10, revenue: 30000 },
  { id: 4, date: '2025-08-09', productName: '제주 감귤 3kg',     buyerName: '김영희', price: 5000, quantity: 3,  revenue: 15000 },
  { id: 5, date: '2025-08-10', productName: 'GAP 사과 2kg',     buyerName: '최민수', price: 7000, quantity: 2,  revenue: 14000 },
  { id: 6, date: '2025-08-11', productName: '친환경 바나나 1송이', buyerName: '정수진', price: 4500, quantity: 4,  revenue: 18000 },
];

// Mock API 함수들
export const listSales = async (year: number, month: number): Promise<SaleRow[]> => {
  // 해당 월의 판매 데이터만 필터링
  const targetMonth = month.toString().padStart(2, '0');
  return mockSales.filter(sale => sale.date.startsWith(`${year}-${targetMonth}`));
};
