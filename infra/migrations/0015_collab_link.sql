ALTER TABLE `documents` ADD `collab_link` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_documents_collab_link` ON `documents` (`collab_link`);