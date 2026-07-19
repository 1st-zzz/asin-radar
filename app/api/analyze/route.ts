import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { monitorRuns } from "../../../db/schema";
import { analyzeAsin } from "../../../lib/sellersprite";
import type { AnalysisResult, MonitorFailure } from "../../../lib/demo-data";
import { decorateWithHistory, hydrateResult } from "../../../lib/history";
import { AUTO_SYNC_SCHEDULE, AUTO_SYNC_TIMEZONE, deleteMonitorTarget, failureFrom, listTargetStates, markFailedTargets, persistSuccessfulTargets, setTargetAutoSync } from "../../../lib/monitor-targets";
import { consumeDailyQuota, DAILY_ANALYZE_LIMIT } from "../../../lib/usage";
import { getVisitorSession, visitorJson } from "../../../lib/visitor-session";

const MARKETPLACES = new Set(["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA", "IN", "MX", "BR", "AU", "AE"]);

const automation = { schedule: AUTO_SYNC_SCHEDULE, timezone: AUTO_SYNC_TIMEZONE };

async function getTargetHistory(userId: string, marketplace: string, asin: string) {
  try {
    const rows = await getDb()
      .select()
      .from(monitorRuns)
      .where(and(eq(monitorRuns.userId, userId), eq(monitorRuns.marketplace, marketplace), eq(monitorRuns.asin, asin)))
      .orderBy(desc(monitorRuns.capturedAt))
      .limit(90);
    return rows.map((row) => hydrateResult(JSON.parse(row.resultJson)));
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const visitor = await getVisitorSession(request);
  try {
    const rows = await getDb()
      .select()
      .from(monitorRuns)
      .where(eq(monitorRuns.userId, visitor.userId))
      .orderBy(desc(monitorRuns.capturedAt))
      .limit(1000);
    const grouped = new Map<string, AnalysisResult[]>();
    for (const row of rows) {
      const result = hydrateResult(JSON.parse(row.resultJson));
      const key = `${result.marketplace}:${result.asin}`;
      grouped.set(key, [...(grouped.get(key) ?? []), result]);
    }
    const results = [...grouped.values()]
      .map((items) => decorateWithHistory(items[0], items.slice(1)))
      .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
    const targets = await listTargetStates(visitor.userId);
    return visitorJson(visitor, { results, targets, persisted: true, automation });
  } catch {
    return visitorJson(visitor, { results: [], targets: [], persisted: false, automation });
  }
}

export async function POST(request: Request) {
  const visitor = await getVisitorSession(request);
  try {
    const payload = (await request.json()) as { targets?: Array<{ marketplace?: string; asin?: string }> };
    const targets = (payload.targets ?? []).map((target) => ({ marketplace: target.marketplace?.trim().toUpperCase() ?? "", asin: target.asin?.trim().toUpperCase() ?? "" }));
    if (!targets.length || targets.length > 20) return visitorJson(visitor, { error: "单次请输入 1–20 个 ASIN" }, { status: 400 });
    const invalid = targets.find((target) => !MARKETPLACES.has(target.marketplace) || !/^[A-Z0-9]{10}$/.test(target.asin));
    if (invalid) return visitorJson(visitor, { error: `输入无效：${invalid.marketplace} ${invalid.asin}` }, { status: 400 });
    const withinQuota = await consumeDailyQuota(visitor.userId, "analyze", targets.length);
    if (!withinQuota) return visitorJson(visitor, { error: `当前匿名空间每天最多同步 ${DAILY_ANALYZE_LIMIT} 个 ASIN，请明天再试` }, { status: 429 });

    const settled = await Promise.allSettled(targets.map((target) => analyzeAsin(target.marketplace, target.asin)));
    const results = settled.filter((item): item is PromiseFulfilledResult<AnalysisResult> => item.status === "fulfilled").map((item) => item.value);
    const failures: MonitorFailure[] = settled.flatMap((item, index) => item.status === "rejected" ? [failureFrom(targets[index], item.reason)] : []);
    if (!results.length) {
      return visitorJson(visitor, { error: failures[0]?.error || "所有 ASIN 分析均失败", failures }, { status: 503 });
    }
    const histories = await Promise.all(results.map((result) => getTargetHistory(visitor.userId, result.marketplace, result.asin)));
    const decorated = results.map((result, index) => decorateWithHistory(result, histories[index]));
    let persisted = true;
    try {
      await persistSuccessfulTargets(visitor.userId, results);
      await markFailedTargets(visitor.userId, failures);
    } catch {
      persisted = false;
    }
    const targetStates = persisted ? await listTargetStates(visitor.userId) : [];
    return visitorJson(visitor, { results: decorated, targets: targetStates, persisted, failures, automation });
  } catch (error) {
    return visitorJson(visitor, { error: error instanceof Error ? error.message : "分析请求失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const visitor = await getVisitorSession(request);
  try {
    const payload = (await request.json()) as { marketplace?: string; asin?: string; autoSync?: boolean };
    const marketplace = payload.marketplace?.trim().toUpperCase() ?? "";
    const asin = payload.asin?.trim().toUpperCase() ?? "";
    if (!MARKETPLACES.has(marketplace) || !/^[A-Z0-9]{10}$/.test(asin) || typeof payload.autoSync !== "boolean") {
      return visitorJson(visitor, { error: "请输入有效的站点、ASIN 和自动同步状态" }, { status: 400 });
    }
    const target = await setTargetAutoSync(visitor.userId, marketplace, asin, payload.autoSync);
    if (!target) return visitorJson(visitor, { error: "监控对象不存在" }, { status: 404 });
    return visitorJson(visitor, { target, automation });
  } catch {
    return visitorJson(visitor, { error: "自动同步设置失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const visitor = await getVisitorSession(request);
  const url = new URL(request.url);
  const marketplace = (url.searchParams.get("marketplace") ?? "").trim().toUpperCase();
  const asin = (url.searchParams.get("asin") ?? "").trim().toUpperCase();
  if (!MARKETPLACES.has(marketplace) || !/^[A-Z0-9]{10}$/.test(asin)) {
    return visitorJson(visitor, { error: "请输入有效的站点和 ASIN" }, { status: 400 });
  }

  try {
    await deleteMonitorTarget(visitor.userId, marketplace, asin);
    return visitorJson(visitor, { deleted: true, marketplace, asin });
  } catch {
    return visitorJson(visitor, { error: "删除监控失败，请稍后重试" }, { status: 500 });
  }
}
