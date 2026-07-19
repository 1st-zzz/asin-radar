import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the daily monitoring dashboard", async () => {
  const [page, layout, analyzeRoute, history, monitoring, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/history.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/monitoring.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
  assert.match(layout, /ASIN Radar｜竞品监控与历史查询/);
  assert.match(page, /竞品每日监控/);
  assert.match(page, /ASIN 历史查询/);
  assert.match(page, /查询历史/);
  assert.match(page, /折后价/);
  assert.match(page, /月销量/);
  assert.match(page, /PD \/ Coupon \/ Deal/);
  assert.match(page, /PD（Price Discount）/);
  assert.match(page, /P\/M 仅表示百分比\/金额 Coupon/);
  assert.match(page, /销量与促销状态/);
  assert.match(page, /最近价格促销记录/);
  assert.match(page, /历史记录，不代表当前活动/);
  assert.match(page, /当前无活动 · 历史有促销/);
  assert.match(page, /平台历史轨迹/);
  assert.match(page, /关联来源结构与关键词广告贡献/);
  assert.match(page, /核心关键词广告位/);
  assert.match(page, /付费关联来源占比/);
  assert.match(page, /关键词广告贡献/);
  assert.match(page, /SBV/);
  assert.match(page, /product-thumb/);
  assert.match(page, /商品主图/);
  assert.match(page, /删除监控/);
  assert.match(page, /每日 09:00/);
  assert.match(page, /波动最大竞品/);
  assert.match(page, /评论数/);
  assert.match(page, /全部留存快照和历史趋势/);
  assert.match(page, /fetch\("\/api\/analyze"\)/);
  assert.match(page, /fetch\(`\/api\/history\?\$\{query\}`\)/);
  assert.doesNotMatch(page, /codex-preview|Your site is taking shape|Codex is working/i);
  assert.match(analyzeRoute, /export async function DELETE/);
  assert.match(analyzeRoute, /export async function PATCH/);
  assert.match(analyzeRoute, /eq\(monitorRuns\.userId, visitor\.userId\)/);
  assert.match(history, /Math\.abs\(reviews\.percent\) >= 15/);
  assert.match(monitoring, /MATERIAL_CHANGE_PERCENT = 15/);
  assert.match(worker, /runScheduledSync/);
});
