import { env } from "cloudflare:workers";
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { monitorRuns, monitorTargets } from "../db/schema";
import { analyzeAsin } from "./sellersprite";

const DEFAULT_TARGET_LIMIT = 40;
const CONCURRENCY = 3;

function targetLimit() {
  const runtime = env as unknown as Record<string, unknown>;
  const parsed = Number(runtime.AUTO_SYNC_MAX_TARGETS ?? DEFAULT_TARGET_LIMIT);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(200, Math.floor(parsed))) : DEFAULT_TARGET_LIMIT;
}

async function syncTarget(target: typeof monitorTargets.$inferSelect) {
  const db = getDb();
  const startedAt = Date.now();
  await db.update(monitorTargets).set({ updatedAt: startedAt, lastStatus: "running", lastError: null }).where(eq(monitorTargets.id, target.id));
  try {
    const result = await analyzeAsin(target.marketplace, target.asin);
    const capturedAt = Date.parse(result.capturedAt);
    await db.insert(monitorRuns).values({
      id: crypto.randomUUID(),
      userId: target.userId,
      marketplace: result.marketplace,
      asin: result.asin,
      capturedAt,
      resultJson: JSON.stringify(result),
    });
    await db.update(monitorTargets).set({
      updatedAt: Date.now(),
      lastSyncedAt: capturedAt,
      lastStatus: "success",
      lastError: null,
    }).where(eq(monitorTargets.id, target.id));
    return true;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error || "自动同步失败")).slice(0, 300);
    await db.update(monitorTargets).set({
      updatedAt: Date.now(),
      lastStatus: "failed",
      lastError: message,
    }).where(eq(monitorTargets.id, target.id));
    return false;
  }
}

export async function runScheduledSync() {
  const targets = await getDb()
    .select()
    .from(monitorTargets)
    .where(eq(monitorTargets.autoSync, true))
    .orderBy(asc(monitorTargets.updatedAt))
    .limit(targetLimit());

  let succeeded = 0;
  let failed = 0;
  for (let index = 0; index < targets.length; index += CONCURRENCY) {
    const batch = await Promise.all(targets.slice(index, index + CONCURRENCY).map(syncTarget));
    succeeded += batch.filter(Boolean).length;
    failed += batch.filter((item) => !item).length;
  }
  return { processed: targets.length, succeeded, failed };
}
