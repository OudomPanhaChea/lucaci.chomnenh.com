-- Bonus templates editable in Settings (2026-10-08)
--
-- invoice_templates now holds two kinds of layout: 'invoice' (every existing
-- row) and 'bonus' (the bonus award paper). Each kind has its own default.
-- Until a bonus template exists, the bonus paper keeps printing through the
-- invoice templates re-worded for a bonus, so nothing changes on deploy.
--
-- Additive and re-runnable (MariaDB IF NOT EXISTS), so old code is unaffected.
-- Select the app database in phpMyAdmin, then import.
-- Run on the prod DB BEFORE deploying the API.

ALTER TABLE `invoice_templates`
  ADD COLUMN IF NOT EXISTS `kind` ENUM('invoice','bonus') NOT NULL DEFAULT 'invoice' AFTER `business_id`;
