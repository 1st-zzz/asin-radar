import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { monitorRuns } from "../../../db/schema";
import type { AnalysisResult } from "../../../lib/demo-data";
import { decorateWithHistory, hydrateResult } from "../../../lib/history";
import { queryAsinHistory } from "../../../lib/sellersprite";
import { consumeDailyQuota, DAILY_HISTORY_LIMIT } from "../../../lib/usage";
import { getVisitorSession, visitorJson } from "../../../lib/visitor-session";

const MARKETPLACES = new Set(["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA", "IN", "MX", "BR", "AU", "AE"]);
const ALLOWED_RANGES = new Set([30, 90, 180, 365]);

async function retainedHistory(userId: string, marketplace: string, asin: string) {
  try {
    const rows = await getDb()
      .select()
      .from(monitorRuns)
      .where(and(eq(monitorRuns.userId, userId), eq(monitorRuns.marketplace, marketplace), eq(monitorRuns.asin, asin)))
      .orderBy(desc(monitorRuns.capturedAt))
      .limit(365);
    const results = rows.map((row) => hydrateResult(JSON.parse(row.resultJson) as AnalysisResult));
    return results.length ? decorateWithHistory(results[0], results.slice(1)) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const visitor = await getVisitorSession(request);
  try {
    const url = new URL(request.url);
    const marketplace = (url.searchParams.get("marketplace") ?? "").trim().toUpperCase();
    const asin = (url.searchParams.get("asin") ?? "").trim().toUpperCase();
    const requestedRange = Number(url.searchParams.get("days") ?? "90");
    const rangeDays = ALLOWED_RANGES.has(requestedRange) ? requestedRange : 90;

    if (!MARKETPLACES.has(marketplace) || !/^[A-Z0-9]{10}$/.test(asin)) {
      return visitorJson(visitor, { error: "请输入有效的站点和 10 位 ASIN" }, { status: 400 });
    }
    const withinQuota = await consumeDailyQuota(visitor.userId, "history");
    if (!withinQuota) return visitorJson(visitor, { error: `当前匿名空间每天最多查询 ${DAILY_HISTORY_LIMIT} 次平台历史，请明天再试` }, { status: 429 });

    const [platform, retained] = await Promise.all([
      queryAsinHistory(marketplace, asin, rangeDays),
      retainedHistory(visitor.userId, marketplace, asin),
    ]);
    return visitorJson(visitor, { platform, retained });
  } catch (error) {
    return visitorJson(visitor, { error: error instanceof Error ? error.message : "历史数据查询失败" }, { status: 503 });
  }
}
