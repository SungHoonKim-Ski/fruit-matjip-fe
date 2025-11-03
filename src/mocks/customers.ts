// src/mocks/customers.ts
// Mock data for customer management

export type MockCustomer = {
  id: number;
  name: string;
  totalRevenue: number;
  monthlyWarnCount: number;
  totalWarnCount: number;
  isFirstTimeBuyer: boolean;
};

// In-memory storage (localStorage를 사용하지 않음, 읽기 전용)
let mockCustomers: MockCustomer[] = [];

// Seed data - 50명의 고객 데이터 생성
function generateMockCustomers(): MockCustomer[] {
  const names = [
    '김철수', '이영희', '박민수', '최지영', '정수진',
    '강호동', '신동엽', '유재석', '박명수', '하하',
    '송지효', '김종국', '지석진', '전소민', '양세찬',
    '이광수', '조세호', '홍길동', '김영수', '이수진',
    '박철수', '최영희', '정민수', '강지영', '신수진',
    '유호동', '송동엽', '김재석', '이명수', '박하하',
    '최지효', '정종국', '강석진', '신소민', '유세찬',
    '송광수', '김세호', '이길동', '박영수', '최수진',
    '정철수', '강영희', '신민수', '유지영', '송수진',
    '김호동', '이동엽', '박재석', '최명수', '정하하',
  ];

  const customers: MockCustomer[] = [];

  for (let i = 0; i < 50; i++) {
    const totalRevenue = Math.floor(Math.random() * 1000000) + 10000; // 10,000 ~ 1,000,000
    const monthlyWarnCount = Math.floor(Math.random() * 5); // 0 ~ 4
    const totalWarnCount = Math.floor(Math.random() * 10) + monthlyWarnCount; // warn_count 이상
    const isFirstTimeBuyer = Math.random() < 0.3; // 30% 확률로 신규 고객

    customers.push({
      id: i + 1,
      name: names[i],
      totalRevenue,
      monthlyWarnCount,
      totalWarnCount,
      isFirstTimeBuyer,
    });
  }

  return customers;
}

// 초기화
mockCustomers = generateMockCustomers();

// 고객 목록 조회 (서버에서 정렬된 데이터 제공)
export function getMockCustomers(
  offset: number = 0,
  filterBy: 'total_revenue' | 'warn_count' | 'total_warn_count' = 'total_revenue',
  sortOrder: 'asc' | 'desc' = 'desc',
  limit: number = 20,
  search?: string
): { users: MockCustomer[]; hasMore: boolean } {
  // 검색 필터 적용
  let filtered = mockCustomers;
  if (search && search.trim()) {
    const searchLower = search.trim().toLowerCase();
    filtered = mockCustomers.filter(c => c.name.toLowerCase().includes(searchLower));
  }

  // 서버에서 정렬된 데이터라고 가정하고 단순히 페이지네이션만 수행
  const start = offset;
  const end = start + limit;
  const users = filtered.slice(start, end);
  const hasMore = end < filtered.length;

  return { users, hasMore };
}

// 고객 warn count 업데이트
export function updateMockCustomerWarnCount(userId: number, increment: number): MockCustomer | null {
  const customer = mockCustomers.find(c => c.id === userId);
  if (!customer) return null;

  customer.monthlyWarnCount = Math.max(0, customer.monthlyWarnCount + increment);
  customer.totalWarnCount = Math.max(0, customer.totalWarnCount + increment);

  return customer;
}

