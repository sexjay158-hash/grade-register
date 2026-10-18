CREATE TABLE `intake_event_links` (
	`intake_id` text NOT NULL,
	`event_id` text NOT NULL,
	`owner` text NOT NULL,
	`matched` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`intake_id`, `event_id`),
	FOREIGN KEY (`intake_id`) REFERENCES `intake`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
