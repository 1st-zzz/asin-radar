CREATE TABLE `monitor_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`marketplace` text NOT NULL,
	`asin` text NOT NULL,
	`auto_sync` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_synced_at` integer,
	`last_status` text DEFAULT 'ready' NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_targets_user_target_uidx` ON `monitor_targets` (`user_id`,`marketplace`,`asin`);--> statement-breakpoint
CREATE INDEX `monitor_targets_auto_updated_idx` ON `monitor_targets` (`auto_sync`,`updated_at`);--> statement-breakpoint
INSERT OR IGNORE INTO `monitor_targets` (`id`,`user_id`,`marketplace`,`asin`,`auto_sync`,`created_at`,`updated_at`,`last_synced_at`,`last_status`,`last_error`)
SELECT lower(hex(randomblob(16))), `user_id`, `marketplace`, `asin`, true, min(`captured_at`), max(`captured_at`), max(`captured_at`), 'success', NULL
FROM `monitor_runs`
GROUP BY `user_id`, `marketplace`, `asin`;
