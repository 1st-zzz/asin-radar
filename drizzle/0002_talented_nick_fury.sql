CREATE TABLE `monitor_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`analyze_units` integer DEFAULT 0 NOT NULL,
	`history_queries` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monitor_usage_user_date_idx` ON `monitor_usage` (`user_id`,`usage_date`);