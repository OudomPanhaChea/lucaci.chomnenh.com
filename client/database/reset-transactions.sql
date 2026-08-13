-- ===========================================================================
-- Reset transactional data (go-live reset)
-- ===========================================================================
-- Wipes everything about buying and selling, keeps everything about setup.
--
--   DELETED : sales, sale_items, payments (incl. deposits), bonuses,
--             bonus_items, and the 'sale'/'void' stock_movements
--   ZEROED  : clients.credit_balance (prepaid money must not outlive its ledger)
--   RESTORED: products.stock_qty (test sales are given back, see step 1)
--   KEPT    : products, product_units, categories, clients, users, settings,
--             businesses, images, and the 'initial'/'restock'/'adjustment'
--             stock_movements (they are the audit trail of the kept stock)
--
-- This is NOT a migration. It is meant to be run by hand, once, before the
-- business starts trading for real, to clear deploy/testing residue. There is
-- no undo: sales cannot be deleted through the app, only voided, which is why
-- this exists as a script instead of a button in the admin UI.
--
-- HOW TO RUN
--   Prod  : hPanel -> phpMyAdmin -> select the database -> SQL tab -> paste.
--   Local : C:\xampp\mysql\bin\mysql.exe -u root chamnenh_pos < reset-transactions.sql
--
-- BEFORE YOU RUN IT
--   1. Take a database backup (hPanel backups, or an export from phpMyAdmin).
--      Images live in the `images` table, so the dump covers them too.
--   2. Confirm nobody has entered real sales yet. Step 0 below tells you.
--   3. Check @business_id matches the deployment (prod is 1, = BUSINESS_ID).
-- ===========================================================================

SET @business_id = 1;

-- ── Step 0: look before you leap ───────────────────────────────────────────
-- Run this on its own first. If these counts are not what you expect to lose,
-- stop. `oldest` and `newest` tell you whether this is your testing or the
-- owner's real trading.
SELECT
  COUNT(*)                                        AS sales_to_delete,
  COALESCE(SUM(status <> 'voided'), 0)            AS of_which_not_voided,
  COALESCE(SUM(CASE WHEN status <> 'voided' THEN total ELSE 0 END), 0) AS revenue_to_delete,
  MIN(created_at)                                 AS oldest,
  MAX(created_at)                                 AS newest
FROM sales
WHERE business_id = @business_id;

-- ── The reset ──────────────────────────────────────────────────────────────
START TRANSACTION;

-- Step 1: give the stock back BEFORE deleting the history that proves it.
-- change_qty is negative on 'sale' and positive on the 'void' mirror, so the
-- per-product SUM is what the sales still hold (0 for a sale that was voided,
-- since its mirror cancels it). Subtracting that negative sum adds it back.
-- Untracked products (stock_qty IS NULL) never wrote movements, so they are
-- skipped and stay untracked.
UPDATE products p
JOIN (
  SELECT product_id, SUM(change_qty) AS net_taken
  FROM stock_movements
  WHERE business_id = @business_id
    AND reason IN ('sale', 'void')
  GROUP BY product_id
) m ON m.product_id = p.id
SET p.stock_qty = p.stock_qty - m.net_taken
WHERE p.business_id = @business_id
  AND p.stock_qty IS NOT NULL;

-- Step 2: drop the sale/void movement history. 'initial', 'restock' and
-- 'adjustment' rows are inventory work, not selling, so they stay and keep
-- explaining the stock_qty left behind.
DELETE FROM stock_movements
WHERE business_id = @business_id
  AND reason IN ('sale', 'void');

-- Step 3: bonus awards (bonus_items cascades from bonuses).
DELETE FROM bonuses WHERE business_id = @business_id;

-- Step 4: sales. sale_items cascades, and so do the payments carrying a
-- sale_id (payments_ibfk_1 ON DELETE CASCADE).
DELETE FROM sales WHERE business_id = @business_id;

-- Step 5: the rest of the ledger. Deposits have sale_id NULL, so step 4 did
-- NOT cascade them away. Without this they would survive as orphans.
DELETE FROM payments WHERE business_id = @business_id;

-- Step 6: prepaid balances. This money only exists as a sum of the ledger
-- rows just deleted; leaving it would show clients holding credit that
-- nothing explains.
UPDATE clients
SET credit_balance = 0.00
WHERE business_id = @business_id
  AND credit_balance <> 0.00;

COMMIT;

-- ── Tidy the counters ──────────────────────────────────────────────────────
-- Cosmetic: ids are never shown to users (invoice_number is a per-day MAX+1
-- counter and resets by itself once sales is empty). Safe only because these
-- tables are now empty. DDL cannot live inside the transaction above, which is
-- why it runs after COMMIT. Note `images` is deliberately absent: its ids are
-- served as immutable URLs and must never be reused. Skip this block entirely
-- if the database holds a second business.
ALTER TABLE sale_items  AUTO_INCREMENT = 1;
ALTER TABLE payments    AUTO_INCREMENT = 1;
ALTER TABLE bonus_items AUTO_INCREMENT = 1;
ALTER TABLE bonuses     AUTO_INCREMENT = 1;
ALTER TABLE sales       AUTO_INCREMENT = 1;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- Every count must be 0.
SELECT 'sales' AS table_name, COUNT(*) AS remaining FROM sales WHERE business_id = @business_id
UNION ALL SELECT 'sale_items',  COUNT(*) FROM sale_items  WHERE business_id = @business_id
UNION ALL SELECT 'payments',    COUNT(*) FROM payments    WHERE business_id = @business_id
UNION ALL SELECT 'bonuses',     COUNT(*) FROM bonuses     WHERE business_id = @business_id
UNION ALL SELECT 'bonus_items', COUNT(*) FROM bonus_items WHERE business_id = @business_id
UNION ALL SELECT 'sale/void movements', COUNT(*) FROM stock_movements
  WHERE business_id = @business_id AND reason IN ('sale', 'void')
UNION ALL SELECT 'clients with credit', COUNT(*) FROM clients
  WHERE business_id = @business_id AND credit_balance <> 0.00;

-- These must be intact (and stock_qty should match the shelf again).
SELECT 'products' AS table_name, COUNT(*) AS kept FROM products WHERE business_id = @business_id AND is_deleted = 0
UNION ALL SELECT 'clients',    COUNT(*) FROM clients    WHERE business_id = @business_id
UNION ALL SELECT 'users',      COUNT(*) FROM users      WHERE business_id = @business_id
UNION ALL SELECT 'categories', COUNT(*) FROM categories WHERE business_id = @business_id
UNION ALL SELECT 'images',     COUNT(*) FROM images     WHERE business_id = @business_id
UNION ALL SELECT 'kept movements', COUNT(*) FROM stock_movements
  WHERE business_id = @business_id AND reason IN ('initial', 'restock', 'adjustment');
