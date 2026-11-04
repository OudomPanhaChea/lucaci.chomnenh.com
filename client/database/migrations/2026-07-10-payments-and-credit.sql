-- Payments, credit sales, and prepaid client balances.
-- A sale can now be fully paid, partially paid, or unpaid (on account);
-- every payment/deposit/refund is a row in the new `payments` ledger, and
-- clients carry a prepaid `credit_balance` that checkout can spend.
-- Apply once:  mysql -u root chamnenh_pos < database/migrations/2026-07-10-payments-and-credit.sql

-- Sales: payment state lives in the existing status enum, amount_paid tracks
-- how much of `total` has been received so far.
ALTER TABLE `sales`
  MODIFY `status` ENUM('paid','partial','unpaid','voided') NOT NULL DEFAULT 'paid',
  ADD COLUMN `amount_paid` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `change_due`;

-- Existing 'paid' sales were paid in full at the register.
UPDATE `sales` SET `amount_paid` = `total` WHERE `status` = 'paid';

-- Clients: prepaid balance (deposits in, spent at checkout or on old bills).
ALTER TABLE `clients`
  ADD COLUMN `credit_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `note`;

-- Payments ledger. amount is signed: positive = money in, negative = money
-- out (refund mirror rows written when a sale is voided). method 'credit'
-- means paid from the client's prepaid balance (not new money in).
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

-- Backfill the ledger for sales that were already paid in full.
INSERT INTO `payments` (`business_id`, `client_id`, `sale_id`, `type`, `method`, `amount`, `user_id`, `received_by`, `created_at`)
SELECT s.`business_id`, s.`client_id`, s.`id`, 'sale', s.`payment_method`, s.`total`, s.`user_id`, s.`cashier_name`, s.`created_at`
FROM `sales` s
WHERE s.`status` = 'paid'
  AND NOT EXISTS (SELECT 1 FROM `payments` p WHERE p.`sale_id` = s.`id`);
