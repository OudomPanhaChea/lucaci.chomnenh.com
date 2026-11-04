-- Store uploaded images (products, avatars, logo, banners) in the database
-- instead of the server disk: managed hosting (Hostinger shared plan) wipes
-- the app folder on every redeploy. Rows are served by GET /uploads/img/:id;
-- *_url columns point at that route. Pre-existing /uploads/<kind>/<file> URLs
-- keep working from disk where the files still exist (dev machines).
USE `chamnenh_pos`;

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
