-- Picked-items bonus = $ per unit x quantity (2026-10-08)
--
-- The Items tab of the bonus page now has ONE reward: a dollar rate per unit
-- for each product line (one line per product + unit, "50 Box x $0.50"), the
-- bonus being quantity x rate. unit_rate keeps that rate so the paper can
-- print it; NULL on every older row (percent / fixed awards).
--
-- Additive and re-runnable (MariaDB IF NOT EXISTS), so old code is unaffected.
-- Select the app database in phpMyAdmin, then import.
-- Run on the prod DB BEFORE deploying the API.

ALTER TABLE `bonus_items`
  ADD COLUMN IF NOT EXISTS `unit_rate` DECIMAL(10,2) DEFAULT NULL AFTER `pct`;
