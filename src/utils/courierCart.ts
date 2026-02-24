export type SelectedOption = {
  groupName: string;
  optionId: number;
  optionName: string;
  additionalPrice: number;
};

export type CartItem = {
  courierProductId: number;
  name: string;
  price: number; // base price (without options)
  quantity: number;
  imageUrl: string;
  selectedOptions?: SelectedOption[];
};

const CART_KEY = 'courier-cart';

export const getCart = (): CartItem[] => {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveCart = (items: CartItem[]) => {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('courier-cart-changed'));
};

const getCartKey = (item: Pick<CartItem, 'courierProductId' | 'selectedOptions'>): string => {
  const optionIds = (item.selectedOptions || [])
    .map(o => o.optionId)
    .sort((a, b) => a - b)
    .join(',');
  return `${item.courierProductId}:${optionIds}`;
};

export const addToCart = (item: CartItem) => {
  const cart = getCart();
  const key = getCartKey(item);
  const existing = cart.find(c => getCartKey(c) === key);
  if (existing) {
    existing.quantity = existing.quantity + item.quantity;
    existing.price = item.price;
    existing.name = item.name;
    existing.imageUrl = item.imageUrl;
    existing.selectedOptions = item.selectedOptions;
  } else {
    cart.push({ ...item });
  }
  saveCart(cart);
};

export const updateQuantity = (courierProductId: number, quantity: number, selectedOptions?: SelectedOption[]) => {
  const cart = getCart();
  const key = getCartKey({ courierProductId, selectedOptions });
  const item = cart.find(c => getCartKey(c) === key);
  if (item) {
    if (quantity <= 0) {
      saveCart(cart.filter(c => getCartKey(c) !== key));
    } else {
      item.quantity = quantity;
      saveCart(cart);
    }
  }
};

export const removeFromCart = (courierProductId: number, selectedOptions?: SelectedOption[]) => {
  const key = getCartKey({ courierProductId, selectedOptions });
  const cart = getCart().filter(c => getCartKey(c) !== key);
  saveCart(cart);
};

export const clearCart = () => {
  localStorage.removeItem(CART_KEY);
  window.dispatchEvent(new Event('courier-cart-changed'));
};

export const getCartTotalQuantity = (): number => {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
};

const BUY_NOW_KEY = 'courier-buy-now';

export const setBuyNowItem = (item: CartItem) => {
  localStorage.setItem(BUY_NOW_KEY, JSON.stringify(item));
};

export const getBuyNowItem = (): CartItem | null => {
  try {
    const raw = localStorage.getItem(BUY_NOW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearBuyNow = () => {
  localStorage.removeItem(BUY_NOW_KEY);
};

export const getCartTotalPrice = (): number => {
  return getCart().reduce((sum, item) => {
    const optionExtra = (item.selectedOptions || []).reduce((s, o) => s + o.additionalPrice, 0);
    return sum + (item.price + optionExtra) * item.quantity;
  }, 0);
};
