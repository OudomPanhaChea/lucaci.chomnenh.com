import pool from "../config/db.js";
import { BUSINESS_ID } from "../config/business.js";

// Group key per requested granularity. `from`/`to` are YYYY-MM-DD; grouping
// can be day, month, or year, so a range can be "1 Jan 2025 → 9 Jul 2026 by month".
const GROUP_FORMAT = {
  hour: "%Y-%m-%d %H:00",
  day: "%Y-%m-%d",
  month: "%Y-%m",
  year: "%Y",
};

// Chart series come back with gaps (a day with no sales has no row), which
// makes the charts jumpy and lets them end before today. Zero-fill every
// period between from and to so the line always spans the full window.
function addDaysYmd(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fillSeries(series, group, from, to, zero) {
  if (!from || !to || from > to) return series;
  const keys = [];
  if (group === "day") {
    for (let d = from; d <= to; d = addDaysYmd(d, 1)) keys.push(d);
  } else if (group === "month") {
    let [y, m] = from.slice(0, 7).split("-").map(Number);
    const end = to.slice(0, 7);
    for (let k = from.slice(0, 7); k <= end; ) {
      keys.push(k);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      k = `${y}-${String(m).padStart(2, "0")}`;
    }
  } else if (group === "year") {
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) keys.push(String(y));
  } else {
    return series;
  }
  if (keys.length > 1100) return series; // absurd range, charts thin ticks anyway
  const map = new Map(series.map((r) => [r.period, r]));
  return keys.map((k) => map.get(k) || { period: k, ...zero });
}

// Revenue is accrual (every non-voided sale counts when it happens); the
// collected/outstanding split shows how much of it has actually been received.
function rangeWhere(from, to) {
  const where = ["s.business_id = ?", "s.status <> 'voided'"];
  const params = [BUSINESS_ID];
  if (from) { where.push("s.created_at >= ?"); params.push(`${from} 00:00:00`); }
  if (to)   { where.push("s.created_at <= ?"); params.push(`${to} 23:59:59`); }
  return { where: where.join(" AND "), params };
}

// GET /reports/summary?from=&to=&group=day|month|year
export async function summary(req, res) {
  const { from, to } = req.query;
  const group = GROUP_FORMAT[req.query.group] ? req.query.group : "day";
  const { where, params } = rangeWhere(from, to);

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS invoice_count,
            COALESCE(SUM(s.total), 0)                  AS revenue,
            COALESCE(SUM(s.amount_paid), 0)            AS collected,
            COALESCE(SUM(s.total - s.amount_paid), 0)  AS outstanding,
            COALESCE(SUM(s.tax_amount), 0)             AS tax,
            COALESCE(SUM(s.discount_amount), 0)        AS discount,
            COALESCE(SUM(s.total - s.tax_amount - s.total_cost), 0) AS profit,
            COALESCE(AVG(s.total), 0)                  AS avg_sale
     FROM sales s WHERE ${where}`, params
  );

  const [[{ items_sold }]] = await pool.query(
    `SELECT COALESCE(SUM(si.quantity * si.unit_factor), 0) AS items_sold
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${where}`, params
  );

  const [series] = await pool.query(
    `SELECT DATE_FORMAT(s.created_at, '${GROUP_FORMAT[group]}') AS period,
            COUNT(*)                                   AS invoice_count,
            COALESCE(SUM(s.total), 0)                  AS revenue,
            COALESCE(SUM(s.total - s.tax_amount - s.total_cost), 0) AS profit
     FROM sales s WHERE ${where}
     GROUP BY period ORDER BY period`, params
  );

  const [payment_methods] = await pool.query(
    `SELECT s.payment_method, COUNT(*) AS invoice_count, COALESCE(SUM(s.total), 0) AS revenue
     FROM sales s WHERE ${where} GROUP BY s.payment_method ORDER BY revenue DESC`, params
  );

  const [top_products] = await pool.query(
    `SELECT si.name_snapshot AS name, si.product_id,
            SUM(si.quantity * si.unit_factor) AS quantity, SUM(si.line_total) AS revenue
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE ${where}
     GROUP BY si.product_id, si.name_snapshot
     ORDER BY revenue DESC LIMIT 10`, params
  );

  const [top_clients] = await pool.query(
    `SELECT s.client_id, COALESCE(c.name, s.client_name) AS name,
            COUNT(*) AS invoice_count, SUM(s.total) AS revenue
     FROM sales s LEFT JOIN clients c ON c.id = s.client_id
     WHERE ${where} AND (s.client_id IS NOT NULL OR s.client_name IS NOT NULL)
     GROUP BY s.client_id, name ORDER BY revenue DESC LIMIT 10`, params
  );

  res.json({
    totals: { ...totals, items_sold },
    series: fillSeries(series, group, from, to, { invoice_count: 0, revenue: 0, profit: 0 }),
    payment_methods, top_products, top_clients, group,
  });
}

// Dashboard: today's live stats + hourly series + recent sales + low stock
export async function dashboard(req, res) {
  // Revenue chart window (days ending today), picked in the dashboard UI
  const days = [7, 14, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 14;
  const [[today]] = await pool.query(
    `SELECT COUNT(*) AS invoice_count, COALESCE(SUM(total), 0) AS revenue,
            COALESCE(AVG(total), 0) AS avg_sale,
            COALESCE(SUM(total - tax_amount - total_cost), 0) AS profit
     FROM sales WHERE business_id = ? AND status <> 'voided' AND DATE(created_at) = CURDATE()`,
    [BUSINESS_ID]
  );
  const [[{ items_sold }]] = await pool.query(
    `SELECT COALESCE(SUM(si.quantity * si.unit_factor), 0) AS items_sold
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.business_id = ? AND s.status <> 'voided' AND DATE(s.created_at) = CURDATE()`,
    [BUSINESS_ID]
  );
  const [[yesterday]] = await pool.query(
    `SELECT COALESCE(SUM(total), 0) AS revenue FROM sales
     WHERE business_id = ? AND status <> 'voided' AND DATE(created_at) = CURDATE() - INTERVAL 1 DAY`,
    [BUSINESS_ID]
  );
  const [week_series] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS period, COALESCE(SUM(total), 0) AS revenue,
            COUNT(*) AS invoice_count
     FROM sales
     WHERE business_id = ? AND status <> 'voided' AND created_at >= CURDATE() - INTERVAL ? DAY
     GROUP BY period ORDER BY period`,
    [BUSINESS_ID, days - 1]
  );
  // CURDATE() from the DB (session pinned +07:00) so "today" never drifts
  // from the server process timezone when zero-filling.
  const [[{ today_ymd }]] = await pool.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today_ymd"
  );
  const [[receivables]] = await pool.query(
    `SELECT COALESCE(SUM(total - amount_paid), 0) AS total, COUNT(*) AS invoices
     FROM sales WHERE business_id = ? AND status IN ('unpaid','partial')`,
    [BUSINESS_ID]
  );
  const [recent_sales] = await pool.query(
    `SELECT id, invoice_number, client_name, cashier_name, total, payment_method, status, created_at
     FROM sales WHERE business_id = ? ORDER BY id DESC LIMIT 8`,
    [BUSINESS_ID]
  );
  const [low_stock] = await pool.query(
    `SELECT id, name, stock_qty, low_stock_alert, image_url FROM products
     WHERE business_id = ? AND is_deleted = 0 AND is_active = 1
       AND stock_qty IS NOT NULL AND stock_qty <= low_stock_alert
     ORDER BY stock_qty ASC LIMIT 8`,
    [BUSINESS_ID]
  );
  const [[counts]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM products WHERE business_id = ? AND is_deleted = 0) AS products,
            (SELECT COUNT(*) FROM clients WHERE business_id = ?) AS clients`,
    [BUSINESS_ID, BUSINESS_ID]
  );

  res.json({
    today: { ...today, items_sold },
    yesterday_revenue: yesterday.revenue,
    receivables,
    week_series: fillSeries(week_series, "day", addDaysYmd(today_ymd, -(days - 1)), today_ymd, {
      revenue: 0,
      invoice_count: 0,
    }),
    chart_days: days,
    recent_sales,
    low_stock,
    counts,
  });
}
