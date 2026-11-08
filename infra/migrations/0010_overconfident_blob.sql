CREATE TABLE `github_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`kind` text NOT NULL,
	`repo` text,
	`branch` text,
	`path` text,
	`gist_id` text,
	`file_sha` text,
	`commit_sha` text,
	`url` text NOT NULL,
	`content_hash` text NOT NULL,
	`published_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_publications_document_kind` ON `github_publications` (`document_id`,`kind`);