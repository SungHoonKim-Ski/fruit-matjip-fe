import React from 'react';

interface Product {
  id: string;
  name: string;
  image: string;
  quantity: number;
  pickupTime: string;
  soldOut: boolean;
}

const ProductCard = ({ product, onReserve }: { product: Product; onReserve: (id: string) => void }) => {
  const isPickupTimeOver = new Date() > new Date(product.pickupTime);

  return (
    <div className="border p-4 rounded-lg shadow-sm mb-3 bg-white">
      <img src={product.image} alt={product.name} className="w-full h-48 object-cover rounded" />
      <div className="mt-2">
        <h2 className="text-lg font-semibold">{product.name}</h2>
        <p className="text-sm text-gray-600">픽업 시간: {product.pickupTime}</p>
        <p className="text-sm text-gray-600">남은 수량: {product.quantity}</p>
        <button
          className={`mt-2 w-full py-2 rounded ${
            product.soldOut || isPickupTimeOver
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
          disabled={product.soldOut || isPickupTimeOver}
          onClick={() => onReserve(product.id)}
        >
          {product.soldOut ? '예약 마감' : isPickupTimeOver ? '예약 불가' : '예약하기'}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
