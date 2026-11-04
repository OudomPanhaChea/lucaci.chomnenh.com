-- Multi-tenant prep + branding fields.
-- One shared database, many businesses; each backend deployment is pinned to
-- one business via the BUSINESS_ID env var. Existing data becomes business 1.
-- Apply once:  mysql -u root chamnenh_pos < database/migrations/2026-07-10-tenancy-and-branding.sql

CREATE TABLE IF NOT EXISTS `businesses` (
  `id`         INT(11)      NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(190) NOT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `businesses` (`id`, `name`) VALUES (1, 'Chomnenh');

ALTER TABLE `users`
  ADD COLUMN `business_id` INT(11) NOT NULL DEFAULT 1 AFTER `id`,
  DROP INDEX `uq_users_email`,
  ADD UNIQUE KEY `uq_users_email` (`business_id`, `email`),
  ADD CONSTRAINT `fk_users_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`);

ALTER TABLE `categories`
  ADD COLUMN `business_id` INT(11) NOT NULL DEFAULT 1 AFTER `id`,
  DROP INDEX `uq_categories_name`,
  ADD UNIQUE KEY `uq_categories_name` (`business_id`, `name`),
  ADD CONSTRAINT `fk_categories_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`);

ALTER TABLE `products`
  ADD COLUMN `business_id` INT(11) NOT NULL DEFAULT 1 AFTER `id`,
  DROP INDEX `uq_products_barcode`,
  ADD UNIQUE KEY `uq_products_barcode` (`business_id`, `barcode`),
  ADD CONSTRAINT `fk_products_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`);

ALTER TABLE `clients`
  ADD COLUMN `business_id` INT(11) NOT NULL DEFAULT 1 AFTER `id`,
  ADD KEY `idx_clients_business` (`business_id`),
  ADD CONSTRAINT `fk_clients_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`);

ALTER TABLE `sales`
  ADD COLUMN `business_id` INT(11) NOT NULL DEFAULT 1 AFTER `id`,
  DROP INDEX `uq_sales_invoice`,
  ADD UNIQUE KEY `uq_sales_invoice` (`business_id`, `invoice_number`),
  ADD CONSTRAINT `fk_sales_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`);

ALTER TABLE `sale_items`
  ADD COLUMN `business_id` INT(11) NOT NULL DEFAULT 1 AFTER `id`,
  ADD KEY `idx_sale_items_business` (`business_id`),
  ADD CONSTRAINT `fk_sale_items_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`);

ALTER TABLE `stock_movements`
  ADD COLUMN `business_id` INT(11) NOT NULL DEFAULT 1 AFTER `id`,
  ADD KEY `idx_stock_business` (`business_id`),
  ADD CONSTRAINT `fk_stock_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`);

-- settings becomes one row per business (existing row id=1 stays business 1);
-- banner_urls holds a JSON array of up to 4 public-menu banner image URLs
ALTER TABLE `settings`
  ADD COLUMN `business_id` INT(11) NOT NULL DEFAULT 1 AFTER `id`,
  ADD COLUMN `banner_urls` TEXT DEFAULT NULL AFTER `logo_url`,
  ADD UNIQUE KEY `uq_settings_business` (`business_id`),
  ADD CONSTRAINT `fk_settings_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`);
