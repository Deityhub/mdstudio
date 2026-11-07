ALTER TABLE `share_links` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `share_links` ADD `content` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `share_links` ADD `published_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `share_links` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_document_unique` ON `share_links` (`document_id`);