CREATE TABLE `photo_actors` (
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`owner` text NOT NULL,
	`account_id` text NOT NULL,
	PRIMARY KEY(`kind`, `id`)
);
--> statement-breakpoint
CREATE TABLE `site_members` (
	`email` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`role` text NOT NULL,
	`college` text,
	`cohort` text,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `student_cohorts` (
	`owner` text NOT NULL,
	`year_id` text NOT NULL,
	`sid` text NOT NULL,
	`cohort` text NOT NULL,
	PRIMARY KEY(`owner`, `year_id`, `sid`)
);
