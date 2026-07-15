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
  base_unit: string; // what one stock count means: pcs, tubes, bottles ...
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
  unit_name: string | null; // null = sold by the base unit
  unit_factor: number;
  base_unit?: string | null; // joined from products for display
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
  // Per-product breakdown of everything bought in the period, by total desc;
  // qty_desc lists the units as sold ("1000 Box of 12 + 5 pcs")
  products: { product_id: number | null; name: string; base_unit?: string | null; qty: number; qty_desc: string; total: number }[];
  // Partner bonus awards in the period; omitted for cashiers (manager-only data)
  bonuses?: Bonus[];
  period: { invoice_count: number; total_items: number; purchased: number; paid: number; outstanding: number };
  overall: { outstanding: number; credit_balance: number };
}

// ── Partner bonuses (record + downloadable paper; no ledger impact) ────────
export interface BonusItem {
  id: number;
  bonus_id: number;
  sale_id: number | null;
  invoice_number: string;
  product_id: number | null;
  product_name: string;
  pieces: number;
  qty_desc?: string | null; // human snapshot: "10 × Box of 8 + 5 tubes"
  line_total: number;
  bonus_type: "percent" | "fixed";
  pct: number | null; // set when bonus_type = percent
  amount: number;
}

export interface Bonus {
  id: number;
  client_id: number | null;
  client_name: string;
  period_from: string;
  period_to: string;
  invoice_count: number; // SELECTED fully paid invoices at award time
  invoice_total: number; // their grand total
  invoice_numbers: string[]; // snapshot of the selected invoice numbers
  level1_type: "percent" | "fixed" | null; // null = invoice-total level not awarded
  level1_pct: number | null; // set when level1_type = percent
  level1_amount: number;
  items_amount: number;
  total_amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  items?: BonusItem[];
}

// Card row on the bonus list page: partner client + period aggregates
export interface BonusClientSummary {
  id: number;
  display_number: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  paid_invoices: number;
  paid_total: number;
  qty: number; // units as sold, never converted to base units
  last_paid_at: string | null;
  last_bonus_at: string | null;
  bonus_total: number;
  bonus_count: number;
}

// One product aggregated inside one fully paid invoice (level-2 candidate)
export interface BonusEligibleItem {
  sale_id: number;
  invoice_number: string;
  created_at: string;
  product_id: number | null;
  product_name: string;
  base_unit: string;
  qty: number; // units as sold (quick-tick threshold uses this)
  pieces: number; // base units, kept for the award snapshot
  qty_desc: string; // units as sold: "10 Box of 8 + 5 tubes"
  line_total: number;
}

export interface BonusDetail {
  client: Client;
  invoices: { id: number; invoice_number: string; total: number; created_at: string; qty: number }[];
  items: BonusEligibleItem[];
  history: Bonus[];
  period: { invoice_count: number; paid_total: number; qty: number };
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
