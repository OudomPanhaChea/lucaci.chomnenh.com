-- Partner bonus awards (2026-07-14)
-- Manual rewards computed from a partner client's fully paid invoices in a
-- period. The user picks WHICH paid invoices count (all by default); both
-- reward levels are optional: the item level = per-invoice item lines that
-- reached a piece threshold, the invoice level ("level1" columns) = a
-- percentage of the selected invoices' grand total or a fixed amount.
-- The award is a record + downloadable paper only: it never touches the
-- payments ledger or the client's credit_balance.

CREATE TABLE IF NOT EXISTS `bonuses` (
  `id`            INT(11)       NOT NULL AUTO_INCREMENT,
  `business_id`   INT(11)       NOT NULL DEFAULT 1,
  `client_id`     INT(11)       DEFAULT NULL,
  `client_name`   VARCHAR(190)  NOT NULL,             -- snapshot
  `period_from`   DATE          NOT NULL,
  `period_to`     DATE          NOT NULL,
  `invoice_count` INT(11)       NOT NULL DEFAULT 0,   -- SELECTED fully paid invoices
  `invoice_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,-- their grand total at award time
  `invoice_numbers` TEXT        DEFAULT NULL,         -- JSON array snapshot of selected invoice numbers
  `level1_type`   ENUM('percent','fixed') DEFAULT NULL, -- NULL = invoice-total level not awarded
  `level1_pct`    DECIMAL(5,2)  DEFAULT NULL,         -- set when level1_type = percent
  `level1_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `items_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `note`          VARCHAR(500)  DEFAULT NULL,
  `user_id`       INT(11)       DEFAULT NULL,
  `created_by`    VARCHAR(120)  DEFAULT NULL,         -- snapshot
  `created_at`    TIMESTAMP     NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_bonuses_client` (`client_id`),
  KEY `idx_bonuses_business` (`business_id`),
  CONSTRAINT `fk_bonuses_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`),
  CONSTRAINT `fk_bonuses_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bonuses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bonus_items` (
  `id`             INT(11)       NOT NULL AUTO_INCREMENT,
  `business_id`    INT(11)       NOT NULL DEFAULT 1,
  `bonus_id`       INT(11)       NOT NULL,
  `sale_id`        INT(11)       DEFAULT NULL,
  `invoice_number` VARCHAR(32)   NOT NULL,            -- snapshot
  `product_id`     INT(11)       DEFAULT NULL,
  `product_name`   VARCHAR(190)  NOT NULL,            -- snapshot
  `pieces`         INT(11)       NOT NULL DEFAULT 0,  -- qty x unit_factor in that invoice
  `line_total`     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `bonus_type`     ENUM('percent','fixed') NOT NULL DEFAULT 'percent',
  `pct`            DECIMAL(5,2)  DEFAULT NULL,        -- set when bonus_type = percent
  `amount`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `idx_bonus_items_bonus` (`bonus_id`),
  KEY `idx_bonus_items_business` (`business_id`),
  CONSTRAINT `fk_bonus_items_bonus` FOREIGN KEY (`bonus_id`) REFERENCES `bonuses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bonus_items_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bonus_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_bonus_items_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
