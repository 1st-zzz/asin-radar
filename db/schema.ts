import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
