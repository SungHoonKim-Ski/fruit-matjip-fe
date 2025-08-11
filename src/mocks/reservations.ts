/**
 * 예약/구매 관련 Mock 데이터
 */

export type ReservationRow = {
  id: number;
  date: string;        // YYYY-MM-DD
  productName: string;
  buyerName: string;
  quantity: number;
  amount: number;
  pickupStatus: 'pending' | 'picked'; // 미수령 / 수령
};

export const mockReservations: ReservationRow[] = [
  // 오늘 날짜 기준으로 다양한 데이터 생성
  { id: 201, date: '2025-08-11', productName: '신선한 토마토 1kg', buyerName: '홍길동', quantity: 2, amount: 6000, pickupStatus: 'pending' },
  { id: 202, date: '2025-08-11', productName: '햇양파 1.5kg', buyerName: '이민지', quantity: 1, amount: 3000, pickupStatus: 'picked' },
  { id: 203, date: '2025-08-11', productName: '유기농 감자 2kg', buyerName: '박철수', quantity: 3, amount: 9000, pickupStatus: 'pending' },
  { id: 204, date: '2025-08-11', productName: '제주 감귤 3kg', buyerName: '김영희', quantity: 1, amount: 5000, pickupStatus: 'picked' },
  { id: 205, date: '2025-08-11', productName: 'GAP 사과 2kg', buyerName: '최민수', quantity: 2, amount: 14000, pickupStatus: 'pending' },

  // 어제 날짜
  { id: 206, date: '2025-08-10', productName: '신선한 토마토 1kg', buyerName: '정수진', quantity: 1, amount: 3000, pickupStatus: 'picked' },
  { id: 207, date: '2025-08-10', productName: '친환경 바나나 1송이', buyerName: '한지민', quantity: 2, amount: 9000, pickupStatus: 'picked' },
  { id: 208, date: '2025-08-10', productName: '햇양파 1.5kg', buyerName: '송민호', quantity: 1, amount: 3000, pickupStatus: 'picked' },

  // 그제 날짜
  { id: 209, date: '2025-08-09', productName: '복숭아 6입', buyerName: '윤서연', quantity: 1, amount: 12000, pickupStatus: 'picked' },
  { id: 210, date: '2025-08-09', productName: '귤 2kg', buyerName: '임태현', quantity: 2, amount: 12000, pickupStatus: 'picked' },
  { id: 211, date: '2025-08-09', productName: '샤인머스켓 1송이', buyerName: '오승우', quantity: 1, amount: 25000, pickupStatus: 'picked' },

  // 내일 날짜 (예약)
  { id: 212, date: '2025-08-12', productName: '신선한 토마토 1kg', buyerName: '강동원', quantity: 2, amount: 6000, pickupStatus: 'pending' },
  { id: 213, date: '2025-08-12', productName: '유기농 감자 2kg', buyerName: '배두나', quantity: 1, amount: 3000, pickupStatus: 'pending' },
  { id: 214, date: '2025-08-12', productName: 'GAP 사과 2kg', buyerName: '류준열', quantity: 3, amount: 21000, pickupStatus: 'pending' },

  // 모레 날짜 (예약)
  { id: 215, date: '2025-08-13', productName: '제주 감귤 3kg', buyerName: '김태희', quantity: 2, amount: 10000, pickupStatus: 'pending' },
  { id: 216, date: '2025-08-13', productName: '친환경 바나나 1송이', buyerName: '원빈', quantity: 1, amount: 4500, pickupStatus: 'pending' },
];

// Mock API 함수들
export const listReservations = async (date: string): Promise<ReservationRow[]> => {
  // 해당 날짜의 예약 데이터만 필터링
  return mockReservations.filter(reservation => reservation.date === date);
};

export const updatePickupStatus = async (id: number, status: 'pending' | 'picked'): Promise<boolean> => {
  // 실제로는 서버에서 업데이트하지만, mock에서는 성공으로 처리
  return true;
};
