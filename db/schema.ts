import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const monitorRuns = sqliteTable("monitor_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("legacy-unassigned"),
  marketplace: text("marketplace").notNull(),
  asin: text("asin").notNull(),
  capturedAt: integer("captured_at").notNull(),
  resultJson: text("result_json").notNull(),
}, (table) => [
  index("monitor_runs_target_time_idx").on(table.marketplace, table.asin, table.capturedAt),
  index("monitor_runs_user_target_time_idx").on(table.userId, table.marketplace, table.asin, table.capturedAt),
]);

export const monitorUsage = sqliteTable("monitor_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  usageDate: text("usage_date").notNull(),
  analyzeUnits: integer("analyze_units").notNull().default(0),
  historyQueries: integer("history_queries").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("monitor_usage_user_date_idx").on(table.userId, table.usageDate),
]);

export const monitorTargets = sqliteTable("monitor_targets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  marketplace: text("marketplace").notNull(),
  asin: text("asin").notNull(),
  autoSync: integer("auto_sync", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastSyncedAt: integer("last_synced_at"),
  lastStatus: text("last_status").notNull().default("ready"),
  lastError: text("last_error"),
}, (table) => [
  uniqueIndex("monitor_targets_user_target_uidx").on(table.userId, table.marketplace, table.asin),
  index("monitor_targets_auto_updated_idx").on(table.autoSync, table.updatedAt),
]);
