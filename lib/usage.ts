import { and, eq, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { monitorUsage } from "../db/schema";

export const DAILY_ANALYZE_LIMIT = 20;
export const DAILY_HISTORY_LIMIT = 30;

export async function consumeDailyQuota(
  userId: string,
  kind: "analyze" | "history",
  amount = 1,
) {
  const usageDate = new Date().toISOString().slice(0, 10);
  const id = `${userId}:${usageDate}`;
  const db = getDb();
  await db.insert(monitorUsage).values({
    id,
    userId,
    usageDate,
    analyzeUnits: 0,
    historyQueries: 0,
    updatedAt: Date.now(),
  }).onConflictDoNothing();

  if (kind === "analyze") {
    const rows = await db.update(monitorUsage)
      .set({
        analyzeUnits: sql`${monitorUsage.analyzeUnits} + ${amount}`,
        updatedAt: Date.now(),
      })
      .where(and(eq(monitorUsage.id, id), lte(monitorUsage.analyzeUnits, DAILY_ANALYZE_LIMIT - amount)))
      .returning({ value: monitorUsage.analyzeUnits });
    return rows.length > 0;
  }

  const rows = await db.update(monitorUsage)
    .set({
      historyQueries: sql`${monitorUsage.historyQueries} + ${amount}`,
      updatedAt: Date.now(),
    })
    .where(and(eq(monitorUsage.id, id), lte(monitorUsage.historyQueries, DAILY_HISTORY_LIMIT - amount)))
    .returning({ value: monitorUsage.historyQueries });
  return rows.length > 0;
}
