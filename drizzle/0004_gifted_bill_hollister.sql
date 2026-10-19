CREATE TABLE `local_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`iterations` integer NOT NULL,
	`role` text NOT NULL,
	`college` text,
	`cohort` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_accounts_username_unique` ON `local_accounts` (`username`);--> statement-breakpoint
CREATE TABLE `local_login_attempts` (
	`attempt_key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `local_sessions_account` ON `local_sessions` (`account_id`);
