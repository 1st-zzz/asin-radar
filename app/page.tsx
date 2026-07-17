"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AnalysisResult, HistoryPoint, MetricChange, MonitorResponse } from "../lib/demo-data";

const MARKETPLACES = ["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA", "IN", "MX", "BR", "AU", "AE"];
type TrendMetric = "effectivePrice" | "rating" | "bsr" | "naturalKeywords" | "freeShare";

const TREND_METRICS: Array<{ key: TrendMetric; label: string }> = [
  { key: "effectivePrice", label: "折后价" },
  { key: "rating", label: "评分" },
  { key: "bsr", label: "BSR" },
  { key: "naturalKeywords", label: "自然词" },
  { key: "freeShare", label: "免费流量" },
];

function formatNumber(value: number | null, digits = 0) {
  if (value === null) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(value: string, withTime = false) {
  return new Date(value).toLocaleString("zh-CN", withTime
    ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { month: "2-digit", day: "2-digit" });
}

function parseTargets(input: string, defaultMarketplace: string) {
  const targets = input
    .split(/[\n,;]+/)
    .map((line) => line.trim().toUpperCase())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return parts.length > 1 && MARKETPLACES.includes(parts[0])
        ? { marketplace: parts[0], asin: parts[1] }
        : { marketplace: defaultMarketplace, asin: parts[0] };
    });
  return [...new Map(targets.map((target) => [`${target.marketplace}:${target.asin}`, target])).values()];
}

function severityLabel(severity: string) {
  return severity === "high" ? "重点" : severity === "medium" ? "关注" : "信息";
}

function deltaText(change: MetricChange, mode: "percent" | "absolute" = "percent", suffix = "") {
  if (change.previous === null) return "基线";
  const value = mode === "percent" ? change.percent : change.absolute;
  if (value === null || value === 0) return "无变化";
  return `${value > 0 ? "↑" : "↓"} ${Math.abs(value).toFixed(mode === "percent" ? 1 : 2)}${mode === "percent" ? "%" : suffix}`;
}

function DeltaBadge({ change, mode = "percent", suffix = "" }: { change: MetricChange; mode?: "percent" | "absolute"; suffix?: string }) {
  const tone = change.previous === null || change.direction === "flat" ? "quiet" : change.favorable === true ? "good" : change.favorable === false ? "bad" : "changed";
  return <span className={`delta ${tone}`}>{deltaText(change, mode, suffix)}</span>;
}

function pointValue(point: HistoryPoint, metric: TrendMetric) {
  return point[metric];
}

function trendValue(value: number | null, metric: TrendMetric, currency: string) {
  if (metric === "effectivePrice") return formatMoney(value, currency);
  if (metric === "rating") return formatNumber(value, 1);
  if (metric === "freeShare") return `${formatNumber(value, 1)}%`;
  return formatNumber(value);
}

function TrendChart({ result, metric }: { result: AnalysisResult; metric: TrendMetric }) {
  const points = result.history.filter((point) => pointValue(point, metric) !== null);
  const values = points.map((point) => pointValue(point, metric) as number);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = max - min;

  if (!points.length) return <div className="trend-empty">该指标暂时没有可用快照。</div>;

  return (
    <div className="trend-chart" aria-label={`${TREND_METRICS.find((item) => item.key === metric)?.label}趋势`}>
      {points.map((point) => {
        const value = pointValue(point, metric) as number;
        const height = range === 0 ? 54 : 22 + ((value - min) / range) * 62;
        return (
          <div className="trend-column" key={`${point.capturedAt}:${metric}`}>
            <span className="trend-value">{trendValue(value, metric, result.currency)}</span>
            <span className="trend-bar-wrap"><span className="trend-bar" style={{ height: `${height}px` }} /></span>
            <time>{formatDate(point.capturedAt)}</time>
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [defaultMarketplace, setDefaultMarketplace] = useState("DE");
  const [input, setInput] = useState("DE B0DPDKLHYM");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("effectivePrice");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("正在读取历史记录…");

  useEffect(() => {
    let active = true;
    fetch("/api/analyze")
      .then(async (response) => ({ ok: response.ok, payload: (await response.json()) as MonitorResponse }))
      .then(({ ok, payload }) => {
        if (!active || !ok) return;
        setResults(payload.results);
        if (payload.results[0]) setSelectedKey(`${payload.results[0].marketplace}:${payload.results[0].asin}`);
        setMessage(payload.results.length ? `已读取 ${payload.results.length} 个监控对象` : "暂无历史记录，添加 ASIN 建立今日基线");
      })
      .catch(() => active && setMessage("历史记录暂时无法读取，可直接重新抓取"));
    return () => { active = false; };
  }, []);

  const selected = useMemo(
    () => results.find((item) => `${item.marketplace}:${item.asin}` === selectedKey) ?? results[0],
    [results, selectedKey]
  );
  const changedCount = results.filter((item) => Object.values(item.changes).some((change) => change.previous !== null && change.direction !== "flat")).length;
  const latestCapture = results.reduce<string | null>((latest, item) => !latest || Date.parse(item.capturedAt) > Date.parse(latest) ? item.capturedAt : latest, null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const targets = parseTargets(input, defaultMarketplace);
    const invalid = targets.find((target) => !MARKETPLACES.includes(target.marketplace) || !/^[A-Z0-9]{10}$/.test(target.asin));
    if (!targets.length || invalid) {
      setMessage("请按“站点 ASIN”输入，例如：DE B0DPDKLHYM");
      return;
    }
    if (targets.length > 20) {
      setMessage("单次最多抓取 20 个 ASIN，请拆成多批");
      return;
    }

    setIsLoading(true);
    setMessage(`正在抓取 ${targets.length} 个 ASIN 的今日快照…`);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targets }),
      });
      const payload = (await response.json()) as MonitorResponse & { error?: string; failed?: number };
      if (!response.ok) throw new Error(payload.error || "抓取服务暂时不可用");
      setResults((current) => {
        const updated = new Map(current.map((item) => [`${item.marketplace}:${item.asin}`, item]));
        for (const item of payload.results) updated.set(`${item.marketplace}:${item.asin}`, item);
        return [...updated.values()].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
      });
      if (payload.results[0]) setSelectedKey(`${payload.results[0].marketplace}:${payload.results[0].asin}`);
      setMessage(payload.persisted
        ? `今日快照已保存${payload.failed ? `，${payload.failed} 个 ASIN 抓取失败` : ""}`
        : "抓取完成，但历史库暂时不可写");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "抓取失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="ASIN Radar 首页"><span className="brand-mark">AR</span><span>ASIN Radar</span></a>
        <div className="header-state"><span className="status-dot" />每日快照已启用</div>
      </header>

      <section className="control-panel" id="top">
        <div className="control-copy">
          <p className="eyebrow">Amazon 竞品监控</p>
          <h1>每日变化，一页看清</h1>
          <p>抓取折后价、评分、BSR 与核心流量；第二天起自动生成趋势和环比。</p>
        </div>
        <form className="monitor-form" onSubmit={handleSubmit}>
          <label htmlFor="targets">添加或更新监控对象 <span>每行一个，最多 20 个</span></label>
          <div className="form-main">
            <select aria-label="默认站点" value={defaultMarketplace} onChange={(event) => setDefaultMarketplace(event.target.value)}>
              {MARKETPLACES.map((marketplace) => <option key={marketplace}>{marketplace}</option>)}
            </select>
            <textarea id="targets" data-testid="target-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder={"DE B0DPDKLHYM\nUS B0XXXXXXXX"} rows={2} />
            <button type="submit" disabled={isLoading} data-testid="analyze-button">{isLoading ? "抓取中…" : "抓取今日数据"}</button>
          </div>
          <p className="form-message" role="status">{message}</p>
        </form>
      </section>

      <section className="monitor-section" aria-label="监控列表">
        <div className="summary-row">
          <div><span>监控对象</span><strong>{results.length}</strong></div>
          <div><span>今日有变化</span><strong>{changedCount}</strong></div>
          <div><span>覆盖站点</span><strong>{new Set(results.map((item) => item.marketplace)).size}</strong></div>
          <div className="latest-summary"><span>最近抓取</span><strong>{latestCapture ? formatDate(latestCapture, true) : "—"}</strong></div>
        </div>

        <div className="monitor-table-wrap">
          <table className="monitor-table">
            <thead><tr><th>商品</th><th>折后价</th><th>评分</th><th>BSR</th><th>核心流量</th><th>最近抓取</th><th /></tr></thead>
            <tbody>
              {results.map((item) => {
                const key = `${item.marketplace}:${item.asin}`;
                return (
                  <tr key={key} className={selectedKey === key ? "selected" : ""} onClick={() => setSelectedKey(key)}>
                    <td><span className="market-tag">{item.marketplace}</span><span className="product-id"><strong>{item.asin}</strong><small>{item.brand || "品牌待识别"}</small></span></td>
                    <td><strong>{formatMoney(item.metrics.effectivePrice, item.currency)}</strong><DeltaBadge change={item.changes.effectivePrice} /></td>
                    <td><strong>{formatNumber(item.metrics.rating, 1)}</strong><DeltaBadge change={item.changes.rating} mode="absolute" /></td>
                    <td><strong>{formatNumber(item.metrics.bsr)}</strong><DeltaBadge change={item.changes.bsr} /></td>
                    <td><strong>{formatNumber(item.traffic.naturalKeywords)} 自然词</strong><small>免费 {formatNumber(item.traffic.freeShare, 1)}%</small></td>
                    <td><strong>{formatDate(item.capturedAt, true)}</strong><small>{item.history.length} 天记录</small></td>
                    <td><button type="button" className="row-button" aria-label={`查看 ${item.asin}`}>→</button></td>
                  </tr>
                );
              })}
              {!results.length && <tr><td className="empty-row" colSpan={7}>还没有监控记录。上方输入 ASIN，建立第一天基线。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="detail-card" aria-label={`${selected.asin} 趋势详情`}>
          <div className="detail-header">
            <div><div className="analysis-kicker"><span>{selected.marketplace}</span>{selected.asin}</div><h2>{selected.title}</h2><p>{selected.brand} · {selected.comparisonCapturedAt ? `对比 ${formatDate(selected.comparisonCapturedAt)}` : "今日为同口径首日基线"}</p></div>
            <a href={selected.amazonUrl} target="_blank" rel="noreferrer" className="amazon-link">查看 Amazon ↗</a>
          </div>

          <div className="metric-grid">
            <div><span>折后价</span><strong>{formatMoney(selected.metrics.effectivePrice, selected.currency)}</strong><DeltaBadge change={selected.changes.effectivePrice} /><small>{selected.metrics.priceNote}{selected.metrics.listPrice !== selected.metrics.effectivePrice ? ` · 原价 ${formatMoney(selected.metrics.listPrice, selected.currency)}` : ""}</small></div>
            <div><span>评分</span><strong>{formatNumber(selected.metrics.rating, 1)}</strong><DeltaBadge change={selected.changes.rating} mode="absolute" /><small>{formatNumber(selected.metrics.reviews)} 个评分</small></div>
            <div><span>主类 BSR</span><strong>{formatNumber(selected.metrics.bsr)}</strong><DeltaBadge change={selected.changes.bsr} /><small>数字越低越好</small></div>
            <div><span>自然关键词</span><strong>{formatNumber(selected.traffic.naturalKeywords)}</strong><DeltaBadge change={selected.changes.naturalKeywords} /><small>广告词 {formatNumber(selected.traffic.adKeywords)}</small></div>
            <div><span>免费流量</span><strong>{formatNumber(selected.traffic.freeShare, 1)}%</strong><DeltaBadge change={selected.changes.freeShare} mode="absolute" suffix="pp" /><small>付费 {formatNumber(selected.traffic.paidShare, 1)}%</small></div>
          </div>

          <div className="trend-section">
            <div className="section-title"><div><p className="eyebrow">每日历史</p><h3>变化趋势</h3></div><span>{selected.history.length} 天快照</span></div>
            <div className="trend-tabs" role="tablist">
              {TREND_METRICS.map((item) => <button type="button" role="tab" aria-selected={trendMetric === item.key} className={trendMetric === item.key ? "active" : ""} key={item.key} onClick={() => setTrendMetric(item.key)}>{item.label}</button>)}
            </div>
            <TrendChart result={selected} metric={trendMetric} />
            {selected.history.length === 1 && <p className="baseline-note">今天是同口径基线；明天再次抓取后，这里会出现第二个数据点和日环比。</p>}
          </div>

          <div className="detail-columns">
            <section className="insight-section">
              <div className="section-title"><div><p className="eyebrow">变化判断</p><h3>核心结论</h3></div></div>
              <div className="insight-list">{selected.conclusions.slice(0, 6).map((conclusion, index) => <div className={`insight ${conclusion.severity}`} key={`${conclusion.title}:${index}`}><span>{severityLabel(conclusion.severity)}</span><div><strong>{conclusion.title}</strong><p>{conclusion.body}</p></div></div>)}</div>
            </section>
            <section className="history-section">
              <div className="section-title"><div><p className="eyebrow">精确数值</p><h3>历史明细</h3></div></div>
              <div className="history-table-wrap"><table className="history-table"><thead><tr><th>日期</th><th>折后价</th><th>评分</th><th>BSR</th><th>自然词</th><th>免费</th></tr></thead><tbody>{[...selected.history].reverse().map((point) => <tr key={point.capturedAt}><td>{formatDate(point.capturedAt)}</td><td>{formatMoney(point.effectivePrice, selected.currency)}</td><td>{formatNumber(point.rating, 1)}</td><td>{formatNumber(point.bsr)}</td><td>{formatNumber(point.naturalKeywords)}</td><td>{formatNumber(point.freeShare, 1)}%</td></tr>)}</tbody></table></div>
            </section>
          </div>

          <details className="secondary-details"><summary>竞品对标、下一步动作与数据口径</summary><div className="secondary-grid"><section><h3>优先竞品</h3><div className="history-table-wrap"><table className="history-table"><thead><tr><th>ASIN</th><th>价格</th><th>评分</th><th>月销量</th><th>关注点</th></tr></thead><tbody>{selected.competitors.map((item) => <tr key={item.asin}><td>{item.asin}</td><td>{formatMoney(item.price, selected.currency)}</td><td>{formatNumber(item.rating, 1)}</td><td>{formatNumber(item.monthlyUnits)}</td><td>{item.reason}</td></tr>)}</tbody></table></div></section><section><h3>下一步动作</h3><ol>{selected.actions.map((action) => <li key={action}>{action}</li>)}</ol><h3>数据说明</h3><ul>{selected.dataNotes.map((note) => <li key={note}>{note}</li>)}</ul></section></div></details>
        </section>
      )}
    </main>
  );
}
