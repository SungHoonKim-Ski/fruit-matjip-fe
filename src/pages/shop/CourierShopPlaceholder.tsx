import { useNavigate } from 'react-router-dom';

export default function CourierShopPlaceholder() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-800">택배 쇼핑몰</h1>
        <p className="text-gray-500 mb-6">준비 중입니다.</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2 rounded-lg text-white font-semibold"
          style={{ backgroundColor: 'var(--color-primary-500)' }}
        >
          메인으로 돌아가기
        </button>
      </div>
    </main>
  );
}
