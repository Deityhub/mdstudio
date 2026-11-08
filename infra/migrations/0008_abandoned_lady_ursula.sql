CREATE TABLE `share_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`version` integer NOT NULL,
	`line` integer NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`share_id`) REFERENCES `share_links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_share_comments_share` ON `share_comments` (`share_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `share_people` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`email` text NOT NULL,
	`email_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `share_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_people_inbox_unique` ON `share_people` (`share_id`,`email_key`);--> statement-breakpoint
ALTER TABLE `share_links` ADD `access` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `share_links` ADD `comments` integer DEFAULT 0 NOT NULL;