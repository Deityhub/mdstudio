CREATE TABLE `github_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`github_user_id` text NOT NULL,
	`login` text NOT NULL,
	`scope` text NOT NULL,
	`token_sealed` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
