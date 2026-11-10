ALTER TABLE `users` ADD `limits` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `users` SET `limits` = COALESCE((SELECT json_group_object(`key`, json(`value`)) FROM `account_limits` WHERE `account_limits`.`user_id` = `users`.`id`), '{}');--> statement-breakpoint
DROP TABLE `account_limits`;
