ALTER TABLE `document_revisions` ADD `encoding` text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_revisions` ADD `size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `document_revisions` ADD `hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_revisions` ADD `reason` text DEFAULT 'auto' NOT NULL;