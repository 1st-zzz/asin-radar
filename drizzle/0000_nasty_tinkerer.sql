CREATE TABLE `monitor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`marketplace` text NOT NULL,
	`asin` text NOT NULL,
	`captured_at` integer NOT NULL,
	`result_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monitor_runs_target_time_idx` ON `monitor_runs` (`marketplace`,`asin`,`captured_at`);