-- Partner (wholesale) sales support:
--  * clients.client_type separates online/walk-in buyers from partner stock consumers
--  * product_units: per-product bulk units (Box of 12, Case of 48...) with their own
--    price and optional carton barcode; stock stays counted in base pieces
--  * sale_items snapshot the unit sold (name + factor) and whether the line was a
--    FREE bonus, so old invoices survive product/unit edits
--  * products.stock_qty becomes nullable: NULL = product does not track stock
--    (no oversell checks, no stock movements)
USE `chamnenh_pos`;

ALTER TABLE `clients`
  ADD COLUMN `client_type` ENUM('normal','partner') NOT NULL DEFAULT 'normal' AFTER `sex`;

ALTER TABLE `products`
  MODIFY COLUMN `stock_qty` INT(11) NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `product_units` (
  `id`          INT(11)       NOT NULL AUTO_INCREMENT,
  `business_id` INT(11)       NOT NULL DEFAULT 1,
  `product_id`  INT(11)       NOT NULL,
  `name`        VARCHAR(60)   NOT NULL,             -- "Box of 12", "Case of 48"
  `factor`      INT(11)       NOT NULL DEFAULT 1,   -- pieces per unit
  `sell_price`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,-- price for the whole unit
  `barcode`     VARCHAR(64)   DEFAULT NULL,         -- carton barcode, scannable at POS
  `created_at`  TIMESTAMP     NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_units_barcode` (`business_id`, `barcode`),
  KEY `idx_product_units_product` (`product_id`),
  CONSTRAINT `fk_product_units_product` FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_units_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `sale_items`
  ADD COLUMN `unit_name`   VARCHAR(60) DEFAULT NULL AFTER `name_snapshot`,  -- NULL = piece
  ADD COLUMN `unit_factor` INT(11)     NOT NULL DEFAULT 1 AFTER `unit_name`,
  ADD COLUMN `is_bonus`    TINYINT(1)  NOT NULL DEFAULT 0 AFTER `line_total`;
