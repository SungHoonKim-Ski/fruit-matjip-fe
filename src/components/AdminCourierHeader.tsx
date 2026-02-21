import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminCourierHeader() {
  const navigate = useNavigate();
  const location = window.location.pathname;

  const goProducts = () => {
    if (location !== '/admin/courier/products') {
      navigate('/admin/courier/products');
    }
  };
  const goNewProduct = () => {
    if (location !== '/admin/courier/products/new') {
      navigate('/admin/courier/products/new');
    }
  };
  const goProductOrder = () => {
    if (location !== '/admin/courier/products/order') {
      navigate('/admin/courier/products/order');
    }
  };
  const goOrders = () => {
    if (location !== '/admin/courier/orders') {
      navigate('/admin/courier/orders');
    }
  };
  const goClaims = () => {
    if (location !== '/admin/courier/claims') {
      navigate('/admin/courier/claims');
    }
  };
  const goConfig = () => {
    if (location !== '/admin/courier/config') {
      navigate('/admin/courier/config');
    }
  };

  const openAdminMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    // 기존 메뉴가 있으면 제거하고 함수 종료 (토글 기능)
    const existingMenu = document.querySelector('.admin-courier-header-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'fixed w-48 rounded-lg border bg-white shadow-lg overflow-hidden z-50';
    menu.style.left = `${rect.right - 192}px`; // 192px = w-48 (48 * 4)
    menu.style.top = `${rect.bottom + 8}px`; // 버튼 아래쪽에 8px 간격으로 배치

    // 상품 관리 버튼
    const productsBtn = document.createElement('button');
    productsBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    productsBtn.innerHTML = '📦 택배 상품 관리';
    productsBtn.onclick = () => {
      goProducts();
      menu.remove();
    };

    // 상품 등록 버튼
    const newProductBtn = document.createElement('button');
    newProductBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    newProductBtn.innerHTML = '➕ 택배 상품 등록';
    newProductBtn.onclick = () => {
      goNewProduct();
      menu.remove();
    };

    // 노출순서 변경 버튼
    const productOrderBtn = document.createElement('button');
    productOrderBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    productOrderBtn.innerHTML = '📋 택배 노출순서 변경';
    productOrderBtn.onclick = () => {
      goProductOrder();
      menu.remove();
    };

    // 주문 관리 버튼
    const ordersBtn = document.createElement('button');
    ordersBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    ordersBtn.innerHTML = '🧾 주문 관리';
    ordersBtn.onclick = () => {
      goOrders();
      menu.remove();
    };

    // CS/클레임 버튼
    const claimsBtn = document.createElement('button');
    claimsBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    claimsBtn.innerHTML = '💬 CS/클레임';
    claimsBtn.onclick = () => {
      goClaims();
      menu.remove();
    };

    // 카테고리 관리 버튼
    const categoriesBtn = document.createElement('button');
    categoriesBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    categoriesBtn.innerHTML = '📁 택배 카테고리 관리';
    categoriesBtn.onclick = () => {
      if (location !== '/admin/courier/categories') {
        navigate('/admin/courier/categories');
      }
      menu.remove();
    };

    // 설정 버튼
    const configBtn = document.createElement('button');
    configBtn.className = 'w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2';
    configBtn.innerHTML = '⚙️ 설정';
    configBtn.onclick = () => {
      goConfig();
      menu.remove();
    };

    // 버튼들을 메뉴에 추가
    menu.appendChild(productsBtn);
    menu.appendChild(newProductBtn);
    menu.appendChild(productOrderBtn);
    menu.appendChild(ordersBtn);
    menu.appendChild(claimsBtn);
    menu.appendChild(categoriesBtn);
    menu.appendChild(configBtn);

    menu.classList.add('admin-courier-header-menu');
    document.body.appendChild(menu);

    // 메뉴 외부 클릭시 닫기
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
  };

  return (
    <div className="flex items-center gap-2">
      {/* 매장/택배 토글 */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
        <button
          type="button"
          onClick={() => navigate('/admin/shop/products')}
          className="px-2.5 py-1.5 bg-white text-gray-500 hover:bg-gray-50 transition"
        >
          매장
        </button>
        <button
          type="button"
          className="px-2.5 py-1.5 bg-orange-500 text-white cursor-default"
        >
          택배
        </button>
      </div>

      {/* 햄버거 */}
      <button
        type="button"
        className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-gray-50 border border-gray-200 shadow-sm hover:bg-gray-100 hover:shadow-md active:scale-[0.98] transition-all duration-200"
        aria-haspopup="menu"
        aria-expanded={false}
        aria-label="택배 관리 메뉴"
        onClick={openAdminMenu}
      >
        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>
  );
}
