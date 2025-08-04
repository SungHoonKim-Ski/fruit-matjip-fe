import React from 'react';
import ProductCard from './ProductCard';

const ProductList = ({ products, onReserve }: { products: any[]; onReserve: (id: string) => void }) => {
  return (
    <div className="p-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onReserve={onReserve} />
      ))}
    </div>
  );
};

export default ProductList;
