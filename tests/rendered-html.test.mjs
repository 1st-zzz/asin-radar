import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the daily monitoring dashboard", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
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
  assert.match(page, /免费与付费流量来源/);
  assert.match(page, /核心关键词广告位/);
  assert.match(page, /付费来源占比/);
  assert.match(page, /关键词广告贡献/);
  assert.match(page, /SBV/);
  assert.match(page, /fetch\("\/api\/analyze"\)/);
  assert.match(page, /fetch\(`\/api\/history\?\$\{query\}`\)/);
  assert.doesNotMatch(page, /codex-preview|Your site is taking shape|Codex is working/i);
});
