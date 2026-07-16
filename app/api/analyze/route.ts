import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { monitorRuns } from "../../../db/schema";
import { analyzeAsin } from "../../../lib/sellersprite";
import type { AnalysisResult } from "../../../lib/demo-data";

const MARKETPLACES = new Set(["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA", "IN", "MX", "BR", "AU", "AE"]);

async function persistResults(results: AnalysisResult[]) {
  try {
    const db = getDb();
    await db.insert(monitorRuns).values(results.map((result) => ({
      id: crypto.randomUUID(),
      marketplace: result.marketplace,
      asin: result.asin,
      capturedAt: Date.parse(result.capturedAt),
      resultJson: JSON.stringify(result),
    })));
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const rows = await getDb().select().from(monitorRuns).orderBy(desc(monitorRuns.capturedAt)).limit(30);
    return Response.json({ results: rows.map((row) => JSON.parse(row.resultJson)), persisted: true });
  } catch {
    return Response.json({ results: [], persisted: false });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { targets?: Array<{ marketplace?: string; asin?: string }> };
    const targets = (payload.targets ?? []).map((target) => ({ marketplace: target.marketplace?.trim().toUpperCase() ?? "", asin: target.asin?.trim().toUpperCase() ?? "" }));
    if (!targets.length || targets.length > 20) return Response.json({ error: "单次请输入 1–20 个 ASIN" }, { status: 400 });
    const invalid = targets.find((target) => !MARKETPLACES.has(target.marketplace) || !/^[A-Z0-9]{10}$/.test(target.asin));
    if (invalid) return Response.json({ error: `输入无效：${invalid.marketplace} ${invalid.asin}` }, { status: 400 });

    const settled = await Promise.allSettled(targets.map((target) => analyzeAsin(target.marketplace, target.asin)));
    const results = settled.filter((item): item is PromiseFulfilledResult<AnalysisResult> => item.status === "fulfilled").map((item) => item.value);
    const failures = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected");
    if (!results.length) {
      const reason = failures[0]?.reason;
      return Response.json({ error: reason instanceof Error ? reason.message : "所有 ASIN 分析均失败" }, { status: 503 });
    }
    const persisted = await persistResults(results);
    return Response.json({ results, persisted, failed: failures.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "分析请求失败" }, { status: 500 });
  }
}
