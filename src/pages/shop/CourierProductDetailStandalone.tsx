import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CourierProductDetailPage from './CourierProductDetailPage';

export default function CourierProductDetailStandalone() {
  const { id } = useParams();
  const nav = useNavigate();

  return (
    <CourierProductDetailPage
      isOpen={true}
      onClose={() => nav(-1)}
      productId={Number(id)}
    />
  );
}
