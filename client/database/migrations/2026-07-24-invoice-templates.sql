-- Invoice templates: freeform canvas-based invoice builder + per-invoice
-- customization + KHQR payment image. Idempotent (MariaDB IF NOT EXISTS on
-- columns). Ported from nc.chomnenh.com on 2026-07-24.

CREATE TABLE IF NOT EXISTS `invoice_templates` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `business_id` INT(11) NOT NULL DEFAULT 1,
  `name` VARCHAR(120) NOT NULL DEFAULT 'Template',
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `elements` LONGTEXT DEFAULT NULL,
  `created_by` INT(11) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT current_timestamp(),
  `updated_at` TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_tpl_business` (`business_id`),
  CONSTRAINT `fk_tpl_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `settings`
  ADD COLUMN IF NOT EXISTS `khqr_url` VARCHAR(500) DEFAULT NULL AFTER `logo_url`;

ALTER TABLE `sales`
  ADD COLUMN IF NOT EXISTS `invoice_template_id` INT(11) DEFAULT NULL AFTER `note`,
  ADD COLUMN IF NOT EXISTS `invoice_layout` LONGTEXT DEFAULT NULL AFTER `invoice_template_id`;
