import React, { useEffect, useState } from 'react';
import Header from '@/components/header';
import ProductList from '@/components/ProductList';
import BottomNav from '@/components/BottomNav';
import { Link, useNavigate } from 'react-router-dom'; 

const MainPage = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const storeName = "오늘장보기"

  useEffect(() => {
    if (!storeName) return;
    fetch(`/api/products?store=${storeName}`)
      .then(res => res.json())
      .then(data => setProducts(data));
  }, [storeName]);

  const handleReserve = (productId: string) => {
    // 예시: POST /api/reserve
    fetch('/api/reserve', {
      method: 'POST',
      body: JSON.stringify({ store: storeName, productId }),
      headers: { 'Content-Type': 'application/json' },
    }).then(() => alert('예약 완료!'));
  };

  return (
    <div className="pb-16">
      <Header storeName={storeName as string} />
      <ProductList products={products} onReserve={handleReserve} />
      <BottomNav />
    </div>
  );
};

export default MainPage;
