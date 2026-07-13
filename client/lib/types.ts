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

// Bulk/wholesale unit of a product ("Box of 12"): its own price and optional
// carton barcode; stock is always counted in base pieces (factor = pieces per unit)
export interface ProductUnit {
  id: number;
  product_id: number;
  name: string;
  factor: number;
  sell_price: number;
  barcode: string | null;
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
  stock_qty: number | null; // null = stock not tracked
  low_stock_alert: number;
  image_url: string | null;
  description: string | null;
  show_in_menu: 0 | 1;
  is_active: 0 | 1;
  units?: ProductUnit[];
  matched_unit_id?: number | null; // set by the barcode endpoint on a carton-barcode hit
}

export interface Client {
  id: number;
  display_number: number;
  name: string;
  phone: string | null;
  email: string | null;
  sex: "male" | "female" | "other" | null;
  client_type: "normal" | "partner"; // partner = wholesale stock consumer
  id_card: string | null;
  address: string | null;
  note: string | null;
  credit_balance: number;
  purchase_count?: number;
  total_spent?: number; // money actually received (excludes owing)
  total_items?: number; // pieces bought across non-voided sales
  outstanding?: number;
  last_purchase_at?: string | null;
  created_at?: string;
}

export type PaymentMethod = "cash" | "khqr" | "card" | "bank" | "other";
// 'credit' = paid from the client's prepaid balance
export type LedgerMethod = PaymentMethod | "credit";

export interface Payment {
  id: number;
  sale_id?: number | null;
  invoice_number?: string | null;
  type: "sale" | "deposit" | "refund";
  method: LedgerMethod;
  amount: number;
  received_by: string | null;
  note: string | null;
  created_at: string;
  is_paydown?: 0 | 1; // sale payment received after the sale = paying owing
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  name_snapshot: string;
  unit_name: string | null; // null = piece
  unit_factor: number;
  price: number;
  full_price: number;
  discount_pct: number;
  quantity: number;
  line_total: number;
  is_bonus: 0 | 1;
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
  amount_paid: number;
  exchange_rate: number;
  status: "paid" | "partial" | "unpaid" | "voided";
  voided_at?: string | null;
  voided_by?: string | null;
  note: string | null;
  created_at: string;
  item_count?: number;
  items?: SaleItem[];
  payments?: Payment[];
}

export interface ClientStatement {
  client: Client;
  sales: Sale[];
  payments: Payment[];
  // Per-product breakdown of everything bought in the period, by total desc
  products: { product_id: number | null; name: string; quantity: number; total: number }[];
  period: { invoice_count: number; total_items: number; purchased: number; paid: number; outstanding: number };
  overall: { outstanding: number; credit_balance: number };
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
  unit: ProductUnit | null; // null = sell by piece
  quantity: number;
  price: number | null; // negotiated override for this line, null = list price
  is_bonus: boolean; // FREE goods with a bulk deal: price 0, stock still moves
}
