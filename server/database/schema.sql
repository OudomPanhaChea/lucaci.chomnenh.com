-- Chomnenh POS — shared multi-business database schema
-- (MariaDB / MySQL, utf8mb4)
--
-- Tenancy model: many businesses share this database; every table carries a
-- business_id. Each backend deployment serves exactly one business, selected
-- by the BUSINESS_ID env var (default 1), and scopes every query with it.

-- This file targets whatever database is currently selected, so it works on
-- shared hosting (phpMyAdmin: select the database, then Import). For local
-- dev, create and select the database first:
--   mysql -u root -e "CREATE DATABASE IF NOT EXISTS chomnenh DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci"
--   mysql -u root chomnenh < database/schema.sql

-- ── Businesses (tenants) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `businesses` (
  `id`         INT(11)      NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(190) NOT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Users (staff) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT(11)      NOT NULL AUTO_INCREMENT,
  `business_id`   INT(11)      NOT NULL DEFAULT 1,
  `name`          VARCHAR(120) NOT NULL,
  `email`         VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          ENUM('owner','admin','cashier') NOT NULL DEFAULT 'cashier',
  `phone`         VARCHAR(40)  DEFAULT NULL,
  `avatar_url`    VARCHAR(255) DEFAULT NULL,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `last_login_at` DATETIME     DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT current_timestamp(),
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`business_id`, `email`),
  CONSTRAINT `fk_users_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Categories ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`             INT(11)      NOT NULL AUTO_INCREMENT,
  `business_id`    INT(11)      NOT NULL DEFAULT 1,
  `name`           VARCHAR(120) NOT NULL,
  `display_number` INT(11)      NOT NULL DEFAULT 0,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT current_timestamp(),
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_name` (`business_id`, `name`),
  CONSTRAINT `fk_categories_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Products (inventory) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `products` (
  `id`             INT(11)       NOT NULL AUTO_INCREMENT,
  `business_id`    INT(11)       NOT NULL DEFAULT 1,
  `display_number` INT(11)       NOT NULL DEFAULT 0,
  `name`           VARCHAR(190)  NOT NULL,
  `barcode`        VARCHAR(64)   DEFAULT NULL,
  `sku`            VARCHAR(64)   DEFAULT NULL,
  `category_id`    INT(11)       DEFAULT NULL,
  `cost_price`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `sell_price`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_pct`   DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `stock_qty`      INT(11)       NULL DEFAULT 0,       -- NULL = stock not tracked
  `low_stock_alert` INT(11)      NOT NULL DEFAULT 5,
  `image_url`      VARCHAR(500)  DEFAULT NULL,
  `description`    TEXT          DEFAULT NULL,
  `show_in_menu`   TINYINT(1)    NOT NULL DEFAULT 1,
  `is_active`      TINYINT(1)    NOT NULL DEFAULT 1,
  `is_deleted`     TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at`     TIMESTAMP     NOT NULL DEFAULT current_timestamp(),
  `updated_at`     TIMESTAMP     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_barcode` (`business_id`, `barcode`),
  KEY `idx_products_category` (`category_id`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_products_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Product units (bulk/wholesale units per product) ───────────────────────
-- Stock stays counted in base pieces; a unit is "Box of 12" with its own price
-- (usually below 12x the piece price) and optional carton barcode. sale_items
-- snapshot the unit name/factor, so deleting a unit never breaks history.
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

-- ── Clients (customers) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `clients` (
  `id`             INT(11)      NOT NULL AUTO_INCREMENT,
  `business_id`    INT(11)      NOT NULL DEFAULT 1,
  `display_number` INT(11)      NOT NULL DEFAULT 0,
  `name`           VARCHAR(190) NOT NULL,
  `phone`          VARCHAR(40)  DEFAULT NULL,
  `email`          VARCHAR(190) DEFAULT NULL,
  `sex`            ENUM('male','female','other') DEFAULT NULL,
  `client_type`    ENUM('normal','partner') NOT NULL DEFAULT 'normal', -- partner = wholesale stock consumer
  `id_card`        VARCHAR(64)  DEFAULT NULL,
  `address`        VARCHAR(255) DEFAULT NULL,
  `note`           TEXT         DEFAULT NULL,
  `credit_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00,   -- prepaid money on account
  `created_at`     TIMESTAMP    NOT NULL DEFAULT current_timestamp(),
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_clients_phone` (`phone`),
  KEY `idx_clients_business` (`business_id`),
  CONSTRAINT `fk_clients_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Sales (invoices) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `sales` (
  `id`               INT(11)       NOT NULL AUTO_INCREMENT,
  `business_id`      INT(11)       NOT NULL DEFAULT 1,
  `invoice_number`   VARCHAR(32)   NOT NULL,               -- INV-YYYYMMDD-NNNN, per-day counter
  `client_id`        INT(11)       DEFAULT NULL,
  `client_name`      VARCHAR(190)  DEFAULT NULL,           -- snapshot so history survives client edits
  `user_id`          INT(11)       DEFAULT NULL,
  `cashier_name`     VARCHAR(120)  DEFAULT NULL,           -- snapshot
  `subtotal`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_pct`     DECIMAL(5,2)  NOT NULL DEFAULT 0.00,  -- whole-sale discount
  `discount_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `tax_rate`         DECIMAL(5,2)  NOT NULL DEFAULT 0.00,  -- snapshot of settings.tax_rate
  `tax_amount`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total`            DECIMAL(10,2) NOT NULL DEFAULT 0.00,  -- grand total customer pays
  `total_cost`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,  -- cost snapshot for profit reports
  `payment_method`   ENUM('cash','khqr','card','bank','other') NOT NULL DEFAULT 'cash',
  `amount_received`  DECIMAL(10,2) DEFAULT NULL,
  `change_due`       DECIMAL(10,2) DEFAULT NULL,
  `amount_paid`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,  -- received so far (credit sales)
  `exchange_rate`    DECIMAL(10,2) NOT NULL DEFAULT 4100.00, -- USD→KHR snapshot
  `status`           ENUM('paid','partial','unpaid','voided') NOT NULL DEFAULT 'paid',
  `voided_at`        DATETIME      DEFAULT NULL,
  `voided_by`        VARCHAR(120)  DEFAULT NULL,
  `note`             VARCHAR(500)  DEFAULT NULL,
  `created_at`       TIMESTAMP     NOT NULL DEFAULT current_timestamp(),
  `updated_at`       TIMESTAMP     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_invoice` (`business_id`, `invoice_number`),
  KEY `idx_sales_created` (`created_at`),
  KEY `idx_sales_client` (`client_id`),
  CONSTRAINT `sales_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL,
  CONSTRAINT `sales_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Sale items (price/cost/discount snapshotted at sale time) ──────────────
CREATE TABLE IF NOT EXISTS `sale_items` (
  `id`            INT(11)       NOT NULL AUTO_INCREMENT,
  `business_id`   INT(11)       NOT NULL DEFAULT 1,
  `sale_id`       INT(11)       NOT NULL,
  `product_id`    INT(11)       DEFAULT NULL,
  `name_snapshot` VARCHAR(190)  NOT NULL,
  `unit_name`     VARCHAR(60)   DEFAULT NULL,           -- snapshot of the unit sold, NULL = piece
  `unit_factor`   INT(11)       NOT NULL DEFAULT 1,     -- pieces per unit at sale time
  `price`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,  -- unit price after item discount
  `full_price`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `cost_price`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_pct`  DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `quantity`      INT(11)       NOT NULL DEFAULT 1,
  `line_total`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `is_bonus`      TINYINT(1)    NOT NULL DEFAULT 0,     -- FREE line given with a bulk deal
  PRIMARY KEY (`id`),
  KEY `idx_sale_items_sale` (`sale_id`),
  KEY `idx_sale_items_product` (`product_id`),
  KEY `idx_sale_items_business` (`business_id`),
  CONSTRAINT `sale_items_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sale_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sale_items_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Stock movements (audit of every stock change) ──────────────────────────
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id`          INT(11)     NOT NULL AUTO_INCREMENT,
  `business_id` INT(11)     NOT NULL DEFAULT 1,
  `product_id`  INT(11)     NOT NULL,
  `change_qty`  INT(11)     NOT NULL,            -- negative = out (sale), positive = in (restock)
  `reason`      ENUM('sale','void','restock','adjustment','initial') NOT NULL,
  `sale_id`     INT(11)     DEFAULT NULL,
  `user_id`     INT(11)     DEFAULT NULL,
  `note`        VARCHAR(255) DEFAULT NULL,
  `created_at`  TIMESTAMP   NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_stock_product` (`product_id`),
  KEY `idx_stock_business` (`business_id`),
  CONSTRAINT `stock_movements_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stock_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Payments ledger (sale payments, client deposits, void refunds) ─────────
-- amount is signed: positive = money in, negative = money out (refund mirror
-- rows written on void). method 'credit' = paid from the client's prepaid
-- balance, which is not new money in.
CREATE TABLE IF NOT EXISTS `payments` (
  `id`          INT(11)       NOT NULL AUTO_INCREMENT,
  `business_id` INT(11)       NOT NULL DEFAULT 1,
  `client_id`   INT(11)       DEFAULT NULL,
  `sale_id`     INT(11)       DEFAULT NULL,               -- NULL = client deposit
  `type`        ENUM('sale','deposit','refund') NOT NULL DEFAULT 'sale',
  `method`      ENUM('cash','khqr','card','bank','credit','other') NOT NULL DEFAULT 'cash',
  `amount`      DECIMAL(10,2) NOT NULL,
  `user_id`     INT(11)       DEFAULT NULL,
  `received_by` VARCHAR(120)  DEFAULT NULL,               -- snapshot
  `note`        VARCHAR(255)  DEFAULT NULL,
  `created_at`  TIMESTAMP     NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_payments_sale` (`sale_id`),
  KEY `idx_payments_client` (`client_id`),
  KEY `idx_payments_business` (`business_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL,
  CONSTRAINT `payments_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Uploaded images (stored in the DB, no persistent disk on managed hosts) ─
-- Rows are what /uploads/img/:id serves; *_url columns point at that route.
-- Ids are never reused, so responses are cacheable as immutable. Replacing an
-- image inserts a new row and deletes the old one (middleware/upload.js).
CREATE TABLE IF NOT EXISTS `images` (
  `id`          INT(11)     NOT NULL AUTO_INCREMENT,
  `business_id` INT(11)     NOT NULL DEFAULT 1,
  `mime`        VARCHAR(50) NOT NULL,
  `bytes`       MEDIUMBLOB  NOT NULL,   -- max 16MB, uploads capped at 5MB
  `created_at`  TIMESTAMP   NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_images_business` (`business_id`),
  CONSTRAINT `fk_images_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Settings (one row per business) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `settings` (
  `id`             INT(11)       NOT NULL AUTO_INCREMENT,
  `business_id`    INT(11)       NOT NULL DEFAULT 1,
  `business_name`  VARCHAR(190)  NOT NULL DEFAULT 'Chomnenh',
  `logo_url`       VARCHAR(500)  DEFAULT NULL,
  `banner_urls`    TEXT          DEFAULT NULL,   -- JSON array of up to 4 public-menu banners
  `phone`          VARCHAR(40)   DEFAULT NULL,
  `address`        VARCHAR(255)  DEFAULT NULL,
  `currency`       VARCHAR(8)    NOT NULL DEFAULT 'USD',
  `exchange_rate`  DECIMAL(10,2) NOT NULL DEFAULT 4100.00,
  `tax_rate`       DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `receipt_footer` VARCHAR(500)  DEFAULT 'Thank you, see you again!',
  `menu_public`    TINYINT(1)    NOT NULL DEFAULT 1,
  `updated_at`     TIMESTAMP     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_settings_business` (`business_id`),
  CONSTRAINT `fk_settings_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `businesses` (`id`, `name`) VALUES (1, 'Chomnenh');
INSERT IGNORE INTO `settings` (`id`, `business_id`, `business_name`) VALUES (1, 1, 'Chomnenh');
