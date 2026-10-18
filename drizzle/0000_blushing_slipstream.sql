CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`event_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`group_id` text NOT NULL,
	`number` integer NOT NULL,
	`date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`token` text,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_group_number` ON `events` (`owner`,`group_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_one_draft` ON `events` (`owner`,`group_id`) WHERE "events"."status" = 'draft';--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_owner_name` ON `groups` (`owner`,`name`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`event_id` text NOT NULL,
	`hash` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photos_owner_hash` ON `photos` (`owner`,`hash`);--> statement-breakpoint
CREATE TABLE `scores` (
	`event_id` text NOT NULL,
	`sid` text NOT NULL,
	`score` real,
	`state` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`event_id`, `sid`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `students` (
	`owner` text NOT NULL,
	`sid` text NOT NULL,
	`name` text NOT NULL,
	`college` text NOT NULL,
	`group_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`owner`, `sid`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
