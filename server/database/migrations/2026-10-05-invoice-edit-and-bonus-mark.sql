-- Edit an invoice in place + mark invoices for bonus (2026-10-05)
--
-- 1. A wrong invoice is corrected rather than voided: PUT /sales/:id rewrites
--    its items, totals, stock and ledger while it keeps its number. edited_at /
--    edited_by record who did it; stock moved by a correction is logged with
--    its own reason 'edit'.
-- 2. The invoice modal can flag a partner's invoice for their next bonus.
--    bonus_marked_at / bonus_marked_by hold the flag; saving a bonus that
--    awards the invoice clears it.
--
-- Additive and re-runnable (MariaDB IF NOT EXISTS; re-applying the same ENUM is
-- a no-op), so old code is unaffected by the new columns.
-- Plain statements on purpose, like the other migrations: an earlier version
-- checked information_schema via DATABASE() + PREPARE, and Hostinger's
-- phpMyAdmin import ran it with information_schema as the current database
-- (#1044 access denied). Select the app database in phpMyAdmin, then import.
-- Run on the prod DB BEFORE deploying the API.

ALTER TABLE `sales`
  ADD COLUMN IF NOT EXISTS `edited_at`       DATETIME     DEFAULT NULL AFTER `voided_by`,
  ADD COLUMN IF NOT EXISTS `edited_by`       VARCHAR(120) DEFAULT NULL AFTER `edited_at`,
  ADD COLUMN IF NOT EXISTS `bonus_marked_at` DATETIME     DEFAULT NULL AFTER `edited_by`,
  ADD COLUMN IF NOT EXISTS `bonus_marked_by` VARCHAR(120) DEFAULT NULL AFTER `bonus_marked_at`;

ALTER TABLE `stock_movements`
  MODIFY COLUMN `reason` ENUM('sale','void','edit','restock','adjustment','initial') NOT NULL;
