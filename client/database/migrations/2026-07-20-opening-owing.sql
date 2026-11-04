-- Old owing: debt a client already carried before this system was used, entered
-- as a plain amount (no items, no invoice). It lives on the client row as the
-- REMAINING balance and is tracked in the payments ledger with two new types:
--   owing_add = debt recorded (an amount, NOT money moving)
--   owing_pay = money received against that old debt
-- Client owing everywhere (clients list, statement, dashboard receivables) is
-- invoice outstanding + opening_owing.

ALTER TABLE `clients`
  ADD COLUMN `opening_owing` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `credit_balance`;

ALTER TABLE `payments`
  MODIFY `type` ENUM('sale','deposit','refund','owing_add','owing_pay') NOT NULL DEFAULT 'sale';
