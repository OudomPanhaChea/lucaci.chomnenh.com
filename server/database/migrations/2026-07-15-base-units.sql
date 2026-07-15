-- Named base units (2026-07-15)
-- Every product names the unit its stock is counted in (pcs, tubes, bottles,
-- ampules ...). Stock math is unchanged: product_units.factor is still "base
-- units per bulk unit" and sale_items.unit_factor still converts to base
-- units; this only makes displays say "24 tubes" instead of hardcoded "pcs".
-- bonus_items.qty_desc snapshots the human quantity of an awarded line
-- ("10 × Box of 8" or "2 × Box of 8 + 5 tubes") so the bonus paper keeps
-- showing real units even after products or units change.

ALTER TABLE `products`
  ADD COLUMN `base_unit` VARCHAR(30) NOT NULL DEFAULT 'pcs' AFTER `low_stock_alert`;

ALTER TABLE `bonus_items`
  ADD COLUMN `qty_desc` VARCHAR(190) DEFAULT NULL AFTER `pieces`;
