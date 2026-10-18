CREATE TABLE `intake` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`batch_id` text NOT NULL,
	`hash` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`group_id` text,
	`event_id` text,
	`matched` integer DEFAULT 0 NOT NULL,
	`unresolved` integer DEFAULT 0 NOT NULL,
	`lines` text DEFAULT '[]' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intake_owner_hash` ON `intake` (`owner`,`hash`);--> statement-breakpoint
ALTER TABLE `events` ADD `batch_id` text;