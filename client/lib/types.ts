export type Role = "owner" | "admin" | "cashier";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  avatar_url?: string | null;
  is_active?: 0 | 1;
  last_login_at?: string | null;
  created_at?: string;
}

export interface Category {
  id: number;
  name: string;
  display_number: number;
  product_count?: number;
}

export interface Product {
  id: number;
  display_number: number;
  name: string;
  barcode: string | null;
  sku: string | null;
  category_id: number | null;
  category_name?: string | null;
  cost_price: number;
  sell_price: number;
  discount_pct: number;
  stock_qty: number;
  low_stock_alert: number;
  image_url: string | null;
  description: string | null;
  show_in_menu: 0 | 1;
  is_active: 0 | 1;
}

export interface Client {
  id: number;
  display_number: number;
  name: string;
  phone: string | null;
  email: string | null;
  sex: "male" | "female" | "other" | null;
  id_card: string | null;
  address: string | null;
  note: string | null;
  purchase_count?: number;
  total_spent?: number;
  last_purchase_at?: string | null;
  created_at?: string;
}

export type PaymentMethod = "cash" | "khqr" | "card" | "bank" | "other";

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  name_snapshot: string;
  price: number;
  full_price: number;
  discount_pct: number;
  quantity: number;
  line_total: number;
}

export interface Sale {
  id: number;
  invoice_number: string;
  client_id: number | null;
  client_name: string | null;
  cashier_name: string | null;
  subtotal: number;
  discount_pct: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_method: PaymentMethod;
  amount_received: number | null;
  change_due: number | null;
  exchange_rate: number;
  status: "paid" | "voided";
  voided_at?: string | null;
  voided_by?: string | null;
  note: string | null;
  created_at: string;
  item_count?: number;
  items?: SaleItem[];
}

export interface Settings {
  id: number;
  business_id?: number;
  business_name: string;
  logo_url: string | null;
  banners: string[]; // public menu carousel, max 4 (server-enforced)
  phone: string | null;
  address: string | null;
  currency: string;
  exchange_rate: number;
  tax_rate: number;
  receipt_footer: string | null;
  menu_public: 0 | 1;
}

export interface CartLine {
  product: Product;
  quantity: number;
}
