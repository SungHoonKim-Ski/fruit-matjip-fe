import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminHeader() {
  const navigate = useNavigate();
  const location = window.location.pathname;

  const goProducts = () => {
    if (location !== '/admin/products') {
      navigate('/admin/products');
    }
  };
  const goNewProduct = () => {
    if (location !== '/admin/products/new') {
      navigate('/admin/products/new');
    }
  };
  const goReservations = () => {
    if (location !== '/admin/reservations') {
      navigate('/admin/reservations');
    }
  };
  const goSales = () => {
    if (location !== '/admin/sales') {
      navigate('/admin/sales');
    }
  };
  const goBulkSellDate = () => {
    if (location !== '/admin/products/bulk-sell-date') {
      navigate('/admin/products/bulk-sell-date');
    }
  };
  const goProductOrder = () => {
    if (location !== '/admin/products/order') {
      navigate('/admin/products/order');
    }
  };

  const openAdminMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    
    const menu = document.createElement('div');
    menu.className = 'fixed w-48 rounded-lg border bg-white shadow-lg overflow-hidden z-50';
    menu.style.left = `${rect.right - 192}px`; // 192px = w-48 (48 * 4)
    menu.style.top = `${rect.bottom + 8}px`; // 버튼 아래쪽에 8px 간격으로 배치
    
    // 상품 관리 버튼
    const productsBtn = document.createElement('button');
    productsBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    productsBtn.innerHTML = '📦 상품 관리';
    productsBtn.onclick = () => {
      goProducts();
      menu.remove();
    };
    
    // 상품 등록 버튼
    const newProductBtn = document.createElement('button');
    newProductBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    newProductBtn.innerHTML = '➕ 상품 등록';
    newProductBtn.onclick = () => {
      goNewProduct();
      menu.remove();
    };
    
    // 판매일 변경 버튼
    const bulkSellDateBtn = document.createElement('button');
    bulkSellDateBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    bulkSellDateBtn.innerHTML = '📅 판매일 변경';
    bulkSellDateBtn.onclick = () => {
      goBulkSellDate();
      menu.remove();
    };
    
    // 노출순서 변경 버튼
    const productOrderBtn = document.createElement('button');
    productOrderBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    productOrderBtn.innerHTML = '📋 노출순서 변경';
    productOrderBtn.onclick = () => {
      goProductOrder();
      menu.remove();
    };
    
    // 예약 확인 버튼
    const reservationsBtn = document.createElement('button');
    reservationsBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    reservationsBtn.innerHTML = '🧾 예약 확인';
    reservationsBtn.onclick = () => {
      goReservations();
      menu.remove();
    };
    
    // 판매량 확인 버튼
    const salesBtn = document.createElement('button');
    salesBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    salesBtn.innerHTML = '📈 판매량 확인';
    salesBtn.onclick = () => {
      goSales();
      menu.remove();
    };
    
    // 버튼들을 메뉴에 추가
    menu.appendChild(productsBtn);
    menu.appendChild(newProductBtn);
    menu.appendChild(bulkSellDateBtn);
    menu.appendChild(productOrderBtn);
    menu.appendChild(reservationsBtn);
    menu.appendChild(salesBtn);
    
    // 기존 메뉴가 있으면 제거
    const existingMenu = document.querySelector('.admin-header-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    
    menu.classList.add('admin-header-menu');
    document.body.appendChild(menu);
    
    // 메뉴 외부 클릭시 닫기
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-800">메뉴</span>
        {/* 햄버거 버튼 */}
        <button
          type="button"
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-gray-50 border border-gray-200 shadow-sm hover:bg-gray-100 hover:shadow-md active:scale-[0.98] transition-all duration-200"
          aria-haspopup="menu"
          aria-expanded={false}
          aria-label="관리 메뉴"
          onClick={openAdminMenu}
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
