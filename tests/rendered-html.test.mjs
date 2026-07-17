import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the daily monitoring dashboard", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
  assert.match(layout, /ASIN Radar｜多站点竞品监控/);
  assert.match(page, /每日变化，一页看清/);
  assert.match(page, /抓取今日数据/);
  assert.match(page, /折后价/);
  assert.match(page, /变化趋势/);
  assert.match(page, /fetch\("\/api\/analyze"\)/);
  assert.doesNotMatch(page, /codex-preview|Your site is taking shape|Codex is working/i);
});
