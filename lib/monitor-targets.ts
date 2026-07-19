import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { monitorRuns, monitorTargets } from "../db/schema";
import type { AnalysisResult, MonitorFailure, MonitorTargetState } from "./demo-data";

export const AUTO_SYNC_SCHEDULE = "每天 09:00";
export const AUTO_SYNC_TIMEZONE = "Asia/Shanghai";

function normalizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "同步失败")).slice(0, 300);
}

function toTargetState(row: typeof monitorTargets.$inferSelect): MonitorTargetState {
  return {
    marketplace: row.marketplace,
    asin: row.asin,
    autoSync: row.autoSync,
    lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt).toISOString() : null,
    lastStatus: ["ready", "running", "success", "failed"].includes(row.lastStatus)
      ? row.lastStatus as MonitorTargetState["lastStatus"]
      : "ready",
    lastError: row.lastError,
  };
}

export async function listTargetStates(userId: string) {
  const rows = await getDb()
    .select()
    .from(monitorTargets)
    .where(eq(monitorTargets.userId, userId))
    .orderBy(desc(monitorTargets.updatedAt));
  return rows.map(toTargetState);
}

export async function persistSuccessfulTargets(userId: string, results: AnalysisResult[]) {
  const db = getDb();
  const now = Date.now();
  if (results.length) {
    await db.insert(monitorRuns).values(results.map((result) => ({
      id: crypto.randomUUID(),
      userId,
      marketplace: result.marketplace,
      asin: result.asin,
      capturedAt: Date.parse(result.capturedAt),
      resultJson: JSON.stringify(result),
    })));
  }
  for (const result of results) {
    const capturedAt = Date.parse(result.capturedAt);
    await db.insert(monitorTargets).values({
      id: crypto.randomUUID(),
      userId,
      marketplace: result.marketplace,
      asin: result.asin,
      autoSync: true,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: capturedAt,
      lastStatus: "success",
      lastError: null,
    }).onConflictDoUpdate({
      target: [monitorTargets.userId, monitorTargets.marketplace, monitorTargets.asin],
      set: { updatedAt: now, lastSyncedAt: capturedAt, lastStatus: "success", lastError: null },
    });
  }
}

export async function markFailedTargets(userId: string, failures: MonitorFailure[]) {
  const db = getDb();
  const now = Date.now();
  for (const failure of failures) {
    await db.update(monitorTargets).set({
      updatedAt: now,
      lastStatus: "failed",
      lastError: normalizeError(failure.error),
    }).where(and(
      eq(monitorTargets.userId, userId),
      eq(monitorTargets.marketplace, failure.marketplace),
      eq(monitorTargets.asin, failure.asin),
    ));
  }
}

export async function setTargetAutoSync(userId: string, marketplace: string, asin: string, autoSync: boolean) {
  const rows = await getDb().update(monitorTargets).set({ autoSync, updatedAt: Date.now() }).where(and(
    eq(monitorTargets.userId, userId),
    eq(monitorTargets.marketplace, marketplace),
    eq(monitorTargets.asin, asin),
  )).returning();
  return rows[0] ? toTargetState(rows[0]) : null;
}

export async function deleteMonitorTarget(userId: string, marketplace: string, asin: string) {
  const db = getDb();
  await db.delete(monitorTargets).where(and(
    eq(monitorTargets.userId, userId),
    eq(monitorTargets.marketplace, marketplace),
    eq(monitorTargets.asin, asin),
  ));
  await db.delete(monitorRuns).where(and(
    eq(monitorRuns.userId, userId),
    eq(monitorRuns.marketplace, marketplace),
    eq(monitorRuns.asin, asin),
  ));
}

export function failureFrom(target: { marketplace: string; asin: string }, error: unknown): MonitorFailure {
  return { ...target, error: normalizeError(error) };
}
