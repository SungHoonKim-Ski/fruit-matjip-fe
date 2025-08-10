import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from '../../components/snackbar';
import FloatingActions from '../../components/FloatingActions';

type Product = {
  id: number;
  name: string;
  quantity: number;
  price: number;
  stock: number;
  imageUrl: string;
  sellDate: string; // YYYY-MM-DD
};

const formatPrice = (price: number) =>
  price.toLocaleString('ko-KR', { style: 'currency', currency: 'KRW' });

const d0 = '2025-08-13';
const d1 = '2025-08-14';
const d2 = '2025-08-15';

const initialProducts: Product[] = [
  { id: 1, name: '신선한 토마토 1kg', quantity: 0, price: 3000, stock: 8,  imageUrl: '/images/image1.png', sellDate: d0 },
  { id: 2, name: '유기농 감자 2kg',   quantity: 0, price: 3000, stock: 0,  imageUrl: '/images/image2.png', sellDate: d1 },
  { id: 3, name: '햇양파 1.5kg',     quantity: 0, price: 3000, stock: 12, imageUrl: '/images/image3.png', sellDate: d2 },
];

const storeTitle = '과일맛집 1955';
const branchName = '';

export default function ReservePage() {
  const [products, setProducts] = useState(initialProducts);
  const { show } = useSnackbar();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 닉네임 + 모달
  const [nickname, setNickname] = useState<string>(() => {
    const saved = localStorage.getItem('nickname');
    return saved && saved.trim() ? saved : '홍길동';
  });
  const [nickModalOpen, setNickModalOpen] = useState(false);
  const [draftNick, setDraftNick] = useState(nickname);
  const [savingNick, setSavingNick] = useState(false);
  const nickInputRef = useRef<HTMLInputElement>(null);

  // 날짜 탭
  const dates = useMemo(() => [d0, d1, d2], []);
  const [activeDate, setActiveDate] = useState<string>(dates[0]);

  const navigate = useNavigate();

  const productsOfDay = useMemo(
    () => products.filter(p => p.sellDate === activeDate),
    [products, activeDate]
  );
  const countOf = (date: string) => products.filter(p => p.sellDate === date).length;

  const handleQuantity = (id: number, diff: number) => {
    setProducts(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, quantity: Math.max(0, Math.min(p.stock, p.quantity + diff)) }
          : p
      )
    );
  };

  const handleReserve = (product: Product) => {
    if (product.quantity <= 0) return show('1개 이상 선택해주세요.', { variant: 'error' });
    if (product.quantity > product.stock) return show('재고보다 많이 예약할 수 없어요.', { variant: 'error' });
    // TODO: 실제 예약 API 연동
    show(`${product.name} ${product.quantity}개 예약 완료!`);
  };

  const prettyKdate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    const w = '일월화수목금토'[d.getDay()];
    return `${d.getMonth() + 1}월${d.getDate()}일 (${w})`;
  };

  // 닉네임 모달
  const openNickModal = () => {
    setDraftNick(nickname);
    setNickModalOpen(true);
  };

  useEffect(() => {
    if (nickModalOpen) {
      setTimeout(() => nickInputRef.current?.focus(), 0);
    }
  }, [nickModalOpen]);

  const onNickModalKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') setNickModalOpen(false);
  };

  const checkNicknameUnique = async (value: string) => {
    const res = await fetch(`/api/nickname/check?nickname=${encodeURIComponent(value)}`);
    if (!res.ok) throw new Error('중복 검사 실패');
    const data = await res.json();
    return Boolean(data.unique);
  };

  const saveNickname = async () => {
    const value = draftNick.trim();
    if (!value) {
      show('닉네임을 입력해주세요.', { variant: 'error' });
      return;
    }
    if (value === nickname) {
      setNickModalOpen(false);
      return;
    }

    try {
      setSavingNick(true);
      const unique = await checkNicknameUnique(value);
      if (!unique) {
        show('이미 사용 중인 닉네임입니다.', { variant: 'error' });
        return;
      }

      const res = await fetch('/api/nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: value }),
      });
      if (!res.ok) throw new Error('닉네임 저장 실패');

      setNickname(value);
      localStorage.setItem('nickname', value);
      show('닉네임이 변경되었습니다.');
      setNickModalOpen(false);
    } catch (e: any) {
      show(e?.message || '닉네임 변경 중 오류가 발생했습니다.', { variant: 'error' });
    } finally {
      setSavingNick(false);
    }
  };

  return (
    <main className="bg-[#f6f6f6] min-h-screen flex justify-center px-4 sm:px-6 lg:px-8 pt-16 pb-24">
      {/* 상단 바: 3등분 레이아웃로 균등 분배 */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="mx-auto w-full max-w-md h-14 flex items-center px-4">
          {/* 좌: 햄버거 */}
          <div className="flex-1 flex justify-start">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="h-10 w-10 grid place-items-center rounded-md hover:bg-gray-50 active:scale-[0.98]"
              aria-label="메뉴 열기"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
          </div>

          {/* 중: 상호/지점 */}
          <div className="flex-1 flex flex-col items-center leading-tight">
            <div className="text-lg font-bold text-gray-800">{storeTitle}</div>
            {branchName ? <div className="text-xs text-gray-600">- {branchName} -</div> : null}
          </div>

          {/* 우: 닉네임 */}
          <div className="flex-1 flex justify-end">
            <button onClick={openNickModal} className="text-right leading-tight text-sm" title="닉네임 변경">
              <div className="font-medium text-gray-800">{nickname}님</div>
              <div className="text-gray-500">안녕하세요</div>
            </button>
          </div>
        </div>
      </header>

      {/* 좌측 드로어 */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85%] bg-white shadow-xl border-r p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-base font-semibold">메뉴</div>
              <button
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-gray-50"
                onClick={() => setDrawerOpen(false)}
                aria-label="메뉴 닫기"
              >
                ✕
              </button>
            </div>

            <nav className="mt-2 space-y-2 text-sm">
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                 href="https://open.kakao.com/o/your-openchat" target="_blank" rel="noreferrer">카카오톡 오픈채팅</a>
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                 href="https://pf.kakao.com/your-1to1" target="_blank" rel="noreferrer">매니저 1:1 카카오톡</a>
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                 href="tel:0226667412">점장 문의처 전화번호</a>
              <a className="block h-10 rounded border px-3 flex items-center hover:bg-orange-50"
                 href="https://map.kakao.com/link/to/과일맛집,37.4979,127.0276" target="_blank" rel="noreferrer">찾아오시는 길</a>
            </nav>

            <div className="mt-6 text-xs text-gray-400">© 2025 과일맛집</div>
          </aside>
        </>
      )}

      {/* 닉네임 변경 모달 */}
      {nickModalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center"
          onKeyDown={onNickModalKeyDown}
          aria-modal="true"
          role="dialog"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setNickModalOpen(false)} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-xl shadow-xl border p-5">
            <h2 className="text-base font-semibold text-gray-800">닉네임 변경</h2>
            <p className="text-sm text-gray-500 mt-1">중복되지 않는 닉네임을 입력해 주세요.</p>
            <div className="mt-4">
              <input
                ref={nickInputRef}
                value={draftNick}
                onChange={e => setDraftNick(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveNickname(); }}
                className="w-full h-10 border rounded px-3"
                placeholder="닉네임"
                maxLength={16}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setNickModalOpen(false)}
                className="h-10 px-4 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
              >
                취소
              </button>
              <button
                onClick={saveNickname}
                disabled={savingNick}
                className="h-10 px-4 rounded bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
              >
                {savingNick ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="w-full max-w-md">
        {/* 안내 카드 */}
        <div className="bg-white p-5 rounded-xl shadow mb-6 text-center">
          <h1 className="text-lg font-bold text-gray-800 mb-1">🎁과일맛집1995 현장예약🎁</h1>
          <p className="text-sm text-gray-600">더욱 혜택넘치는 가격으로 우리들끼리 예약하고 먹자구요🤣</p>
        </div>

        {/* 날짜 탭 */}
        <div className="mt-2 mb-4">
          <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar">
            {dates.map(date => {
              const active = activeDate === date;
              return (
                <button
                  key={date}
                  onClick={() => setActiveDate(date)}
                  className={
                    'px-3 py-2 rounded-xl border text-sm whitespace-nowrap transition ' +
                    (active
                      ? 'bg-orange-500 text-white border-orange-500 shadow'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')
                  }
                >
                  <div className="font-semibold">{prettyKdate(date)}</div>
                  <div className="text-[11px] mt-1 text-center text-gray-600">
                    {countOf(date)}개 상품 예약중
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 상품 목록(선택 날짜) */}
        <div className="space-y-4 mb-6">
          {productsOfDay.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden">
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="p-4">
                <h2 className="text-lg font-semibold">{item.name}</h2>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>재고: {item.stock}개</span>
                  <span className="text-sm text-orange-500 font-semibold">{formatPrice(item.price)}</span>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center border rounded overflow-hidden w-full sm:w-40 h-10">
                    <button
                      onClick={() => handleQuantity(item.id, -1)}
                      className="w-1/6 h-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                      disabled={item.quantity <= 0}
                      aria-label="수량 감소"
                    >
                      -
                    </button>
                    <span className="w-2/3 text-center">{item.quantity}</span>
                    <button
                      onClick={() => handleQuantity(item.id, 1)}
                      className="w-1/6 h-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30"
                      disabled={item.quantity >= item.stock}
                      aria-label="수량 증가"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => handleReserve(item)}
                    disabled={item.stock === 0}
                    className={`btn btn-cta ${item.stock === 0 ? 'btn-disabled' : 'btn-primary'} w-full sm:w-28`}
                  >
                    {item.stock === 0 ? '품절' : '예약하기'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {productsOfDay.length === 0 && (
            <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
              해당 날짜에는 예약 가능한 상품이 없습니다.
            </div>
          )}
        </div>

        {/* 푸터 */}
        <footer className="mt-10 text-center text-gray-400 text-xs sm:text-sm space-y-1">
          <p className="font-semibold text-gray-500">과일맛집</p>
          <p>대표: 김지훈</p>
          <p>사업자등록번호: 131-47-00411</p>
          <p>문의: 02-2666-7412</p>
          <p className="mt-1">&copy; 2025 All rights reserved.</p>
        </footer>        
      </section>

      
      <FloatingActions
        orderPath="/orders"  
      />
    </main>
  );
}
