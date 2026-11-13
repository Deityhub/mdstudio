CREATE TABLE `collab_snapshots` (
	`document_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collab_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_collab_updates_doc` ON `collab_updates` (`document_id`);--> statement-breakpoint
CREATE TABLE `document_editors` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`email` text NOT NULL,
	`email_key` text NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_editors_doc_email` ON `document_editors` (`document_id`,`email_key`);--> statement-breakpoint
CREATE INDEX `idx_document_editors_email` ON `document_editors` (`email_key`);--> statement-breakpoint
ALTER TABLE `documents` ADD `collab` integer DEFAULT 0 NOT NULL;