export type CartItem = {
  courierProductId: number;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  stock: number;
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
};

export const addToCart = (item: CartItem) => {
  const cart = getCart();
  const existing = cart.find(c => c.courierProductId === item.courierProductId);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + item.quantity, item.stock);
    existing.price = item.price;
    existing.name = item.name;
    existing.imageUrl = item.imageUrl;
    existing.stock = item.stock;
  } else {
    cart.push({ ...item });
  }
  saveCart(cart);
};

export const updateQuantity = (courierProductId: number, quantity: number) => {
  const cart = getCart();
  const item = cart.find(c => c.courierProductId === courierProductId);
  if (item) {
    if (quantity <= 0) {
      saveCart(cart.filter(c => c.courierProductId !== courierProductId));
    } else {
      item.quantity = Math.min(quantity, item.stock);
      saveCart(cart);
    }
  }
};

export const removeFromCart = (courierProductId: number) => {
  const cart = getCart().filter(c => c.courierProductId !== courierProductId);
  saveCart(cart);
};

export const clearCart = () => {
  localStorage.removeItem(CART_KEY);
};

export const getCartTotalQuantity = (): number => {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
};

export const getCartTotalPrice = (): number => {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
};
