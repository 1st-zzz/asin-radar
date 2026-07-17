"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AnalysisResult,
  HistoryPoint,
  HistoryQueryResponse,
  MetricChange,
  MonitorResponse,
  PlatformHistoryPoint,
  PromotionHistoryPoint,
} from "../lib/demo-data";

const MARKETPLACES = ["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA", "IN", "MX", "BR", "AU", "AE"];
type ViewMode = "monitor" | "history";
type SnapshotMetric = "effectivePrice" | "monthlyUnits" | "monthlyRevenue" | "dealPrice" | "rating" | "bsr" | "naturalKeywords" | "naturalTrafficShare" | "adTrafficShare" | "spTrafficShare" | "sbvTrafficShare" | "spKeywords" | "sbvKeywords";
type PlatformMetric = "marketPrice" | "promotionPrice" | "bsr" | "rating" | "reviews";

const SNAPSHOT_METRICS: Array<{ key: SnapshotMetric; label: string }> = [
  { key: "effectivePrice", label: "折后价" },
  { key: "monthlyUnits", label: "月销量" },
  { key: "monthlyRevenue", label: "月销售额" },
  { key: "dealPrice", label: "Deal 价格" },
  { key: "rating", label: "评分" },
  { key: "bsr", label: "BSR" },
  { key: "naturalKeywords", label: "自然词" },
  { key: "naturalTrafficShare", label: "自然流量占比" },
  { key: "adTrafficShare", label: "广告流量占比" },
  { key: "spTrafficShare", label: "SP 占比" },
  { key: "sbvTrafficShare", label: "SBV 占比" },
  { key: "spKeywords", label: "SP 词" },
  { key: "sbvKeywords", label: "SBV 词" },
];
const PLATFORM_METRICS: Array<{ key: PlatformMetric; label: string }> = [
  { key: "marketPrice", label: "平台售价" },
  { key: "promotionPrice", label: "促销价" },
  { key: "bsr", label: "BSR" },
  { key: "rating", label: "评分" },
  { key: "reviews", label: "评论数" },
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

function formatPercent(value: number | null, digits = 1) {
  return value === null ? "—" : `${formatNumber(value, digits)}%`;
}

function formatDate(value: string, withTime = false) {
  return new Date(value).toLocaleString("zh-CN", withTime
    ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { month: "2-digit", day: "2-digit" });
}

function parseTargets(input: string, defaultMarketplace: string) {
  const targets = input.split(/[\n,;]+/).map((line) => line.trim().toUpperCase()).filter(Boolean).map((line) => {
    const parts = line.split(/\s+/);
    return parts.length > 1 && MARKETPLACES.includes(parts[0])
      ? { marketplace: parts[0], asin: parts[1] }
      : { marketplace: defaultMarketplace, asin: parts[0] };
  });
  return [...new Map(targets.map((target) => [`${target.marketplace}:${target.asin}`, target])).values()];
}

function deltaText(change: MetricChange, mode: "percent" | "absolute" = "percent", suffix = "") {
  if (change.previous === null) return "新基线";
  const value = mode === "percent" ? change.percent : change.absolute;
  if (value === null || value === 0) return "持平";
  return `${value > 0 ? "↑" : "↓"} ${Math.abs(value).toFixed(mode === "percent" ? 1 : 2)}${mode === "percent" ? "%" : suffix}`;
}

function DeltaBadge({ change, mode = "percent", suffix = "" }: { change: MetricChange; mode?: "percent" | "absolute"; suffix?: string }) {
  const tone = change.previous === null || change.direction === "flat" ? "quiet" : change.favorable === true ? "good" : change.favorable === false ? "bad" : "changed";
  return <span className={`delta ${tone}`}>{deltaText(change, mode, suffix)}</span>;
}

function Bars({ points, values, labels, formatter }: { points: string[]; values: Array<number | null>; labels: string[]; formatter: (value: number | null) => string }) {
  const available = values.filter((value): value is number => value !== null);
  const min = available.length ? Math.min(...available) : 0;
  const max = available.length ? Math.max(...available) : 0;
  const range = max - min;
  if (!available.length) return <div className="chart-empty">该指标在所选时间范围内暂无数据。</div>;

  return (
    <div className="bar-chart" aria-label={labels.join(" ")}>
      {points.map((point, index) => {
        const value = values[index];
        const height = value === null ? 4 : range === 0 ? 52 : 20 + ((value - min) / range) * 66;
        return (
          <div className="bar-column" key={`${point}:${index}`}>
            <span className="bar-value">{formatter(value)}</span>
            <span className="bar-track"><span className={value === null ? "bar missing" : "bar"} style={{ height: `${height}px` }} /></span>
            <time>{labels[index]}</time>
          </div>
        );
      })}
    </div>
  );
}

function SnapshotChart({ result, metric }: { result: AnalysisResult; metric: SnapshotMetric }) {
  const history = result.history.slice(-30);
  const percentMetric = metric === "naturalTrafficShare" || metric === "adTrafficShare" || metric === "spTrafficShare" || metric === "sbvTrafficShare";
  const formatter = (value: number | null) => metric === "effectivePrice" || metric === "monthlyRevenue" || metric === "dealPrice" ? formatMoney(value, result.currency) : metric === "rating" ? formatNumber(value, 1) : percentMetric ? `${formatNumber(value, 1)}%` : formatNumber(value);
  return <Bars points={history.map((point) => point.capturedAt)} labels={history.map((point) => formatDate(point.capturedAt))} values={history.map((point: HistoryPoint) => point[metric])} formatter={formatter} />;
}

function PlatformChart({ response, metric }: { response: HistoryQueryResponse; metric: PlatformMetric }) {
  const source = response.platform.points.filter((point) => point[metric] !== null);
  const step = Math.max(1, Math.ceil(source.length / 24));
  const points = source.filter((_, index) => index % step === 0 || index === source.length - 1);
  const formatter = (value: number | null) => metric === "marketPrice" || metric === "promotionPrice" ? formatMoney(value, response.platform.currency) : metric === "rating" ? formatNumber(value, 1) : formatNumber(value);
  return <Bars points={points.map((point) => point.capturedAt)} labels={points.map((point) => formatDate(point.capturedAt))} values={points.map((point: PlatformHistoryPoint) => point[metric])} formatter={formatter} />;
}

function PromotionHistoryList({ points, currency }: { points: PromotionHistoryPoint[]; currency: string }) {
  return (
    <div className="promotion-history">
      <div className="promotion-history-heading"><div><strong>最近价格促销记录</strong><small>历史记录，不代表当前活动</small></div><span>{points.length} 条</span></div>
      {points.length ? (
        <div className="promotion-history-list">
          {points.slice(0, 8).map((point) => (
            <div className="promotion-history-row" key={`${point.kind}:${point.capturedAt}:${point.promotionPrice}`}>
              <time>{formatDate(point.capturedAt)}</time>
              <span className={`promotion-badge ${point.kind}`}>{point.label}</span>
              <strong>{formatMoney(point.promotionPrice, currency)}</strong>
              <small>{point.listPrice !== null ? `原价 ${formatMoney(point.listPrice, currency)}` : "原价未返回"}{point.discountAmount !== null ? ` · 优惠 ${formatMoney(point.discountAmount, currency)}` : ""}</small>
            </div>
          ))}
        </div>
      ) : <div className="promotion-history-empty">所选时间范围内暂无 Coupon 或 Deal 历史记录。</div>}
    </div>
  );
}

function promotionDisplay(result: AnalysisResult) {
  const active = [
    ...(result.promotion.pdActive ? ["PD"] : []),
    ...(result.promotion.couponActive ? ["Coupon"] : []),
    ...(result.promotion.dealActive ? ["Amazon Deal"] : []),
  ];
  const unknown = result.promotion.pdActive === null && result.promotion.couponActive === null && result.promotion.dealActive === null;
  const label = active.length
    ? active.join(" + ")
    : unknown
      ? "数据待补充"
      : result.promotionHistory.length
        ? "当前无活动 · 历史有促销"
        : "未检测到活动";
  const tone = active.length > 1 ? "mixed" : result.promotion.dealActive ? "deal" : result.promotion.pdActive ? "pd" : result.promotion.couponActive ? "coupon" : result.promotionHistory.length ? "history" : "quiet";
  const detail = [
    ...(result.promotion.pdPrice !== null ? [`PD ${formatMoney(result.promotion.pdPrice, result.currency)}`] : []),
    ...(result.promotion.couponFinalPrice !== null ? [`券后 ${formatMoney(result.promotion.couponFinalPrice, result.currency)}`] : []),
    ...(result.promotion.dealPrice !== null ? [`Deal ${formatMoney(result.promotion.dealPrice, result.currency)}`] : []),
  ].join(" · ") || "三种促销独立监控";
  return { label, tone, detail };
}

function RankDelta({ value, current, previous }: { value: number | null; current: number | null; previous: number | null }) {
  if (current === null && previous === null) return <span className="rank-delta quiet">无位置</span>;
  if (current === null) return <span className="rank-delta down">已流失</span>;
  if (previous === null) return <span className="rank-delta quiet">新基线</span>;
  if (value === null || value === 0) return <span className="rank-delta quiet">持平</span>;
  return <span className={`rank-delta ${value > 0 ? "up" : "down"}`}>{value > 0 ? "↑" : "↓"} {Math.abs(value)} 位</span>;
}

function TrafficPanel({ result }: { result: AnalysisResult }) {
  const keywordRows = result.keywordPlacementChanges.length
    ? result.keywordPlacementChanges
    : result.traffic.coreKeywords.map((item) => ({ ...item, previousNaturalRank: null, previousAdRank: null, naturalRankDelta: null, adRankDelta: null, status: "new" as const }));
  const naturalShare = result.traffic.naturalTrafficShare ?? 0;
  const adShare = result.traffic.adTrafficShare ?? 0;
  return (
    <section className="traffic-panel">
      <div className="traffic-heading"><div><span className="section-label">Traffic Watch</span><h3>广告与自然流量结构</h3></div><span>覆盖 {formatNumber(result.traffic.trafficCoverage, 1)}% 核心流量</span></div>
      <div className="traffic-share-bar" aria-label={`自然流量 ${naturalShare.toFixed(1)}%，广告流量 ${adShare.toFixed(1)}%`}>
        <span className="natural" style={{ width: `${Math.max(0, Math.min(100, naturalShare))}%` }} />
        <span className="paid" style={{ width: `${Math.max(0, Math.min(100, adShare))}%` }} />
      </div>
      <div className="traffic-metrics">
        <div><span>自然流量占比</span><strong>{formatPercent(result.traffic.naturalTrafficShare)}</strong><DeltaBadge change={result.changes.naturalTrafficShare} mode="absolute" suffix="pp" /><small>{formatNumber(result.traffic.naturalKeywords)} 个自然词</small></div>
        <div><span>广告流量占比</span><strong>{formatPercent(result.traffic.adTrafficShare)}</strong><DeltaBadge change={result.changes.adTrafficShare} mode="absolute" suffix="pp" /><small>{formatNumber(result.traffic.adKeywords)} 个广告词</small></div>
        <div><span>SP</span><strong>{formatPercent(result.traffic.spTrafficShare)}</strong><DeltaBadge change={result.changes.spTrafficShare} mode="absolute" suffix="pp" /><small>{formatNumber(result.traffic.spKeywords)} 个 SP 词</small></div>
        <div><span>SBV</span><strong>{formatPercent(result.traffic.sbvTrafficShare)}</strong><DeltaBadge change={result.changes.sbvTrafficShare} mode="absolute" suffix="pp" /><small>{formatNumber(result.traffic.sbvKeywords)} 个视频广告词</small></div>
        <div><span>SB</span><strong>{formatPercent(result.traffic.sbTrafficShare)}</strong><span className="delta quiet">结构监控</span><small>{formatNumber(result.traffic.sbKeywords)} 个品牌广告词</small></div>
      </div>
      <div className="keyword-placement">
        <div className="keyword-placement-heading"><strong>核心关键词广告位</strong><small>自然位、SP、SBV、SB 每日对比</small></div>
        <div className="table-scroll">
          <table className="keyword-table">
            <thead><tr><th>关键词</th><th>流量占比</th><th>搜索量</th><th>自然位</th><th>广告类型</th><th>广告位</th></tr></thead>
            <tbody>
              {keywordRows.slice(0, 10).map((item) => <tr key={item.keyword}>
                <td><strong>{item.keyword}</strong><small>{item.keywordCn ?? "—"}</small></td>
                <td>{item.trafficShare === null ? "—" : `${formatNumber(item.trafficShare, 2)}%`}</td>
                <td>{formatNumber(item.searches)}</td>
                <td><strong>{item.naturalRank ?? "—"}</strong><RankDelta value={item.naturalRankDelta} current={item.naturalRank} previous={item.previousNaturalRank} /></td>
                <td><span className={`ad-type ${item.adType ? item.adType.toLowerCase() : "organic"}`}>{item.adType ?? "自然"}</span></td>
                <td><strong>{item.adRank ?? "—"}</strong><RankDelta value={item.adRankDelta} current={item.adRank} previous={item.previousAdRank} /></td>
              </tr>)}
              {!keywordRows.length && <tr><td colSpan={6} className="empty-cell">本次未返回核心关键词明细。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="traffic-source-note">{result.traffic.sourceNote} 免费/付费关联占比为 {formatNumber(result.traffic.freeShare, 1)}% / {formatNumber(result.traffic.paidShare, 1)}%，单独作为关联结构参考。</p>
    </section>
  );
}

function SnapshotDetail({ result }: { result: AnalysisResult }) {
  const [metric, setMetric] = useState<SnapshotMetric>("effectivePrice");
  const listingStatus = result.listingChanges.baseline
    ? "已建基线"
    : result.listingChanges.changed
      ? `${result.listingChanges.summaries.length} 项变动`
      : "无变动";
  const promotionState = promotionDisplay(result);
  return (
    <article className="product-card detail-card">
      <div className="detail-heading">
        <div className="detail-title-block"><div className="product-code"><span>{result.marketplace}</span>{result.asin}</div><h2 title={result.title}>{result.title}</h2><p>{result.brand || "品牌待识别"} · 最近抓取 {formatDate(result.capturedAt, true)}</p></div>
        <a href={result.amazonUrl} target="_blank" rel="noreferrer" className="ghost-button">Amazon 商品页 ↗</a>
      </div>
      <div className="kpi-strip">
        <div><span>折后价</span><strong>{formatMoney(result.metrics.effectivePrice, result.currency)}</strong><DeltaBadge change={result.changes.effectivePrice} /><small>{result.metrics.priceNote}</small></div>
        <div><span>月销量估算</span><strong>{formatNumber(result.metrics.monthlyUnits)}</strong><DeltaBadge change={result.changes.monthlyUnits} /><small>增长率 {result.metrics.monthlyUnitsGrowthPercent === null ? "—" : `${result.metrics.monthlyUnitsGrowthPercent > 0 ? "+" : ""}${formatNumber(result.metrics.monthlyUnitsGrowthPercent, 1)}%`}</small></div>
        <div><span>PD / Coupon / Deal</span><strong className={`promotion-value ${promotionState.tone}`}>{promotionState.label}</strong>{result.promotion.dealPrice !== null ? <DeltaBadge change={result.changes.dealPrice} /> : <span className="delta quiet">状态监控</span>}<small>{promotionState.detail}</small></div>
        <div><span>评分</span><strong>{formatNumber(result.metrics.rating, 1)}</strong><DeltaBadge change={result.changes.rating} mode="absolute" /><small>{formatNumber(result.metrics.reviews)} 个评分</small></div>
        <div><span>主类 BSR</span><strong>{formatNumber(result.metrics.bsr)}</strong><DeltaBadge change={result.changes.bsr} /><small>数字越低越好</small></div>
        <div><span>核心流量</span><strong>自然 {formatPercent(result.traffic.naturalTrafficShare)}</strong><DeltaBadge change={result.changes.naturalTrafficShare} mode="absolute" suffix="pp" /><small>广告 {formatPercent(result.traffic.adTrafficShare)} · SP {formatNumber(result.traffic.spKeywords)} 词 · SBV {formatNumber(result.traffic.sbvKeywords)} 词</small></div>
      </div>
      <section className="promotion-panel">
        <div className="promotion-heading"><div><span className="section-label">Promotion Watch</span><h3>销量与促销状态</h3></div><span className={`promotion-badge ${promotionState.tone}`}>{promotionState.label}</span></div>
        <div className="promotion-grid">
          <div><span>月销售额估算</span><strong>{formatMoney(result.metrics.monthlyRevenue, result.currency)}</strong><DeltaBadge change={result.changes.monthlyRevenue} /><small>来源：SellerSprite · 估算值</small></div>
          <div><span>PD（Price Discount）</span><strong>{result.promotion.pdActive ? formatMoney(result.promotion.pdPrice, result.currency) : result.promotion.pdActive === false ? "未开启" : "暂无数据"}</strong><small>{result.promotion.pdActive ? result.promotion.pdAudience === "prime" ? "Prime 专享 · 来源 primePrice" : "全客户价格折扣" : "不从 Coupon 或 Deal 推断"}</small></div>
          <div><span>Coupon</span><strong>{result.promotion.couponActive ? result.promotion.couponValue ?? "已开启" : result.promotion.couponActive === false ? "未开启" : "暂无数据"}</strong><small>{result.promotion.couponFinalPrice !== null ? `券后 ${formatMoney(result.promotion.couponFinalPrice, result.currency)}` : "P/M 仅表示百分比/金额 Coupon"}</small></div>
          <div><span>Amazon Deal</span><strong>{result.promotion.dealActive ? formatMoney(result.promotion.dealPrice, result.currency) : result.promotion.dealActive === false ? "未检测到" : "暂无数据"}</strong><small>{result.promotion.dealStartAt ? `最近信号 ${formatDate(result.promotion.dealStartAt, true)}` : "与 Coupon 分开判断"}</small></div>
          <div className="promotion-change"><span>{result.promotionChanges.baseline ? "促销基线" : "相较上一自然日"}</span><strong>{result.promotionChanges.baseline ? "已开始留存" : result.promotionChanges.changed ? `${result.promotionChanges.summaries.length} 项变化` : "状态稳定"}</strong><small>{result.promotionChanges.summaries.join("；")}</small></div>
        </div>
        <PromotionHistoryList points={result.promotionHistory} currency={result.currency} />
      </section>
      <TrafficPanel result={result} />
      <section className="listing-panel">
        <div className="listing-panel-heading">
          <div><span className="section-label">Listing Watch</span><h3>图片与文案变动</h3></div>
          <span className={`listing-status ${result.listingChanges.changed ? "changed" : result.listingChanges.baseline ? "baseline" : "stable"}`}>{listingStatus}</span>
        </div>
        <div className="listing-grid">
          <div className="listing-current">
            <div className="listing-images">
              {result.listing.imageUrls.slice(0, 6).map((url, index) => <img src={url} alt={`Listing 图片 ${index + 1}`} loading="lazy" key={url} />)}
              {!result.listing.imageUrls.length && <span className="listing-image-empty">暂无图片</span>}
            </div>
            <div className="listing-copy">
              <span>当前版本 · {result.listing.imageUrls.length} 张图片 · {result.listing.bullets.length} 条五点</span>
              <strong title={result.listing.title}>{result.listing.title || "标题暂缺"}</strong>
              <small>{result.listing.attributesText ? "属性文案已留存" : "属性文案暂缺"}</small>
            </div>
          </div>
          <div className="listing-change-box">
            <strong>{result.listingChanges.baseline ? "从今天开始记录" : "相较上一自然日"}</strong>
            {result.listingChanges.baseline
              ? <p>已保存当前图片、标题、五点和属性文案；下一自然日同步后开始显示差异。</p>
              : result.listingChanges.changed
                ? <ul>{result.listingChanges.summaries.map((summary) => <li key={summary}>{summary}</li>)}</ul>
                : <p>图片、标题、五点和属性文案均未发现变化。</p>}
          </div>
        </div>
      </section>
      <div className="detail-body">
        <section className="chart-panel">
          <div className="panel-heading"><div><span className="section-label">留存快照</span><h3>每日变化趋势</h3></div><span>{result.history.length} 天记录</span></div>
          <div className="metric-tabs">{SNAPSHOT_METRICS.map((item) => <button type="button" key={item.key} className={metric === item.key ? "active" : ""} onClick={() => setMetric(item.key)}>{item.label}</button>)}</div>
          <SnapshotChart result={result} metric={metric} />
          {result.history.length === 1 && <p className="inline-note">这是首日基线。下一个自然日同步后会自动生成日环比。</p>}
        </section>
        <section className="insight-panel">
          <div className="panel-heading"><div><span className="section-label">监控判断</span><h3>今天需要关注</h3></div></div>
          <div className="insight-list">{result.conclusions.slice(0, 5).map((item, index) => <div className={`insight ${item.severity}`} key={`${item.title}:${index}`}><span>{item.severity === "high" ? "重点" : item.severity === "medium" ? "关注" : "信息"}</span><div><strong>{item.title}</strong><p>{item.body}</p></div></div>)}</div>
        </section>
      </div>
    </article>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewMode>("monitor");
  const [defaultMarketplace, setDefaultMarketplace] = useState("DE");
  const [input, setInput] = useState("DE B0DPDKLHYM");
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("正在读取监控记录…");
  const [historyMarketplace, setHistoryMarketplace] = useState("DE");
  const [historyAsin, setHistoryAsin] = useState("B0DPDKLHYM");
  const [historyDays, setHistoryDays] = useState("180");
  const [historyMetric, setHistoryMetric] = useState<PlatformMetric>("marketPrice");
  const [historyResult, setHistoryResult] = useState<HistoryQueryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("输入 ASIN 即可查询平台历史和已留存快照");

  useEffect(() => {
    let active = true;
    fetch("/api/analyze").then(async (response) => ({ ok: response.ok, payload: (await response.json()) as MonitorResponse & { error?: string } })).then(({ ok, payload }) => {
      if (!active) return;
      if (!ok) return setMessage(payload.error || "监控记录暂时无法读取");
      setResults(payload.results);
      if (payload.results[0]) setSelectedKey(`${payload.results[0].marketplace}:${payload.results[0].asin}`);
      setMessage(payload.results.length ? `已载入 ${payload.results.length} 个监控对象` : "暂无监控记录，先建立今日基线");
    }).catch(() => active && setMessage("历史记录暂时无法读取，可直接同步今日数据"));
    return () => { active = false; };
  }, []);

  const selected = useMemo(() => results.find((item) => `${item.marketplace}:${item.asin}` === selectedKey) ?? results[0], [results, selectedKey]);
  const changedCount = results.filter((item) => item.listingChanges.changed || item.promotionChanges.changed || Object.values(item.changes).some((change) => change.previous !== null && change.direction !== "flat")).length;
  const latestCapture = results.reduce<string | null>((latest, item) => !latest || Date.parse(item.capturedAt) > Date.parse(latest) ? item.capturedAt : latest, null);

  async function handleSync(event: FormEvent) {
    event.preventDefault();
    const targets = parseTargets(input, defaultMarketplace);
    const invalid = targets.find((target) => !MARKETPLACES.includes(target.marketplace) || !/^[A-Z0-9]{10}$/.test(target.asin));
    if (!targets.length || invalid) return setMessage("请按“站点 ASIN”输入，例如 DE B0DPDKLHYM");
    if (targets.length > 20) return setMessage("单次最多同步 20 个 ASIN");
    setIsLoading(true);
    setMessage(`正在同步 ${targets.length} 个 ASIN 的今日快照…`);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targets }) });
      const payload = (await response.json()) as MonitorResponse & { error?: string; failed?: number };
      if (!response.ok) throw new Error(payload.error || "同步服务暂时不可用");
      setResults((current) => {
        const updated = new Map(current.map((item) => [`${item.marketplace}:${item.asin}`, item]));
        for (const item of payload.results) updated.set(`${item.marketplace}:${item.asin}`, item);
        return [...updated.values()].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
      });
      if (payload.results[0]) setSelectedKey(`${payload.results[0].marketplace}:${payload.results[0].asin}`);
      setMessage(payload.persisted ? `今日快照已保存${payload.failed ? `，${payload.failed} 个失败` : ""}` : "同步完成，但历史库暂时不可写");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleHistoryQuery(event: FormEvent) {
    event.preventDefault();
    const asin = historyAsin.trim().toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin)) return setHistoryMessage("请输入有效的 10 位 ASIN");
    setHistoryAsin(asin);
    setHistoryLoading(true);
    setHistoryMessage(`正在查询 ${historyMarketplace} ${asin} 的历史轨迹…`);
    try {
      const query = new URLSearchParams({ marketplace: historyMarketplace, asin, days: historyDays });
      const response = await fetch(`/api/history?${query}`);
      const payload = (await response.json()) as HistoryQueryResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "历史查询暂时不可用");
      setHistoryResult(payload);
      setHistoryMessage(`已返回 ${payload.platform.points.length} 个平台历史数据点、${payload.platform.promotionHistory.length} 条促销记录${payload.retained ? `，以及 ${payload.retained.history.length} 天本产品快照` : ""}`);
    } catch (error) {
      setHistoryResult(null);
      setHistoryMessage(error instanceof Error ? error.message : "历史查询失败");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistory(item: AnalysisResult) {
    setHistoryMarketplace(item.marketplace);
    setHistoryAsin(item.asin);
    setHistoryResult(null);
    setView("history");
    setHistoryMessage("已带入 ASIN，点击查询历史数据");
  }

  const platformPoints = historyResult?.platform.points ?? [];
  const latestPlatformPoint = platformPoints[platformPoints.length - 1] ?? null;
  const firstPlatformPoint = historyResult?.platform.points[0] ?? null;
  const latestPlatformPrice = latestPlatformPoint?.marketPrice ?? null;
  const firstPlatformPrice = firstPlatformPoint?.marketPrice ?? null;
  const platformPriceChange = latestPlatformPrice !== null && firstPlatformPrice !== null && firstPlatformPrice !== 0
    ? ((latestPlatformPrice - firstPlatformPrice) / firstPlatformPrice) * 100
    : null;

  return (
    <div className="product-layout">
      <aside className="sidebar">
        <a className="product-brand" href="#top"><span className="brand-glyph">AR</span><span><strong>ASIN Radar</strong><small>竞品监控</small></span></a>
        <nav>
          <button type="button" className={view === "monitor" ? "active" : ""} onClick={() => setView("monitor")}><span className="nav-icon">监</span><span>监控列表<small>同步与变化</small></span></button>
          <button type="button" className={view === "history" ? "active" : ""} onClick={() => setView("history")}><span className="nav-icon">历</span><span>历史查询<small>过往趋势</small></span></button>
        </nav>
        <div className="sidebar-foot"><span className="live-dot" />数据服务正常<small>匿名空间隔离 · D1 历史库</small></div>
      </aside>

      <main className="main-canvas" id="top">
        <header className="product-topbar">
          <div><p>竞品监控 / {view === "monitor" ? "监控列表" : "历史数据"}</p><h1>{view === "monitor" ? "监控列表" : "ASIN 历史查询"}</h1></div>
          <div className="topbar-meta"><span>{latestCapture ? `数据更新 ${formatDate(latestCapture, true)}` : "等待首次同步"}</span><span className="account-badge">匿名</span></div>
        </header>

        {view === "monitor" ? (
          <div className="page-content">
            <section className="welcome-row">
              <div><h2>竞品每日监控</h2><p>无需登录，只显示当前浏览器添加的产品；清除 Cookie 或更换浏览器后无法恢复原匿名空间。</p></div>
              <form className="sync-card" onSubmit={handleSync}>
                <div className="sync-head"><strong>同步今日快照</strong><span>最多 20 个 ASIN</span></div>
                <div className="sync-fields"><select aria-label="默认站点" value={defaultMarketplace} onChange={(event) => setDefaultMarketplace(event.target.value)}>{MARKETPLACES.map((item) => <option key={item}>{item}</option>)}</select><textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} aria-label="ASIN 列表" /><button type="submit" disabled={isLoading}>{isLoading ? "同步中…" : "开始同步"}</button></div>
                <p role="status">{message}</p>
              </form>
            </section>

            <section className="overview-grid">
              <div className="overview-card accent"><span>监控对象</span><strong>{results.length}</strong><small>跨 {new Set(results.map((item) => item.marketplace)).size} 个站点</small></div>
              <div className="overview-card"><span>今日有变化</span><strong>{changedCount}</strong><small>相较上一自然日</small></div>
              <div className="overview-card"><span>需要重点关注</span><strong>{results.filter((item) => item.conclusions.some((entry) => entry.severity === "high")).length}</strong><small>销量、Deal、价格或排名异常</small></div>
              <div className="overview-card wide"><span>监控口径</span><strong>每日快照</strong><small>同一天取最后一次用于趋势</small></div>
            </section>

            <section className="product-card watchlist-card">
              <div className="card-heading"><div><span className="section-label">Watchlist</span><h2>监控列表</h2></div><span>{results.length} 个商品</span></div>
              <div className="table-scroll">
                <table className="watch-table">
                  <thead><tr><th>商品</th><th>折后价</th><th>月销量</th><th>PD / Coupon / Deal</th><th>评分</th><th>BSR</th><th>核心流量</th><th>Listing</th><th>最近同步</th><th /></tr></thead>
                  <tbody>
                    {results.map((item) => {
                      const key = `${item.marketplace}:${item.asin}`;
                      const promotionState = promotionDisplay(item);
                      return <tr key={key} className={selectedKey === key ? "selected" : ""} onClick={() => setSelectedKey(key)}>
                        <td><span className="market-pill">{item.marketplace}</span><span><strong>{item.asin}</strong><small>{item.brand || "品牌待识别"}</small></span></td>
                        <td><strong>{formatMoney(item.metrics.effectivePrice, item.currency)}</strong><DeltaBadge change={item.changes.effectivePrice} /></td>
                        <td><strong>{formatNumber(item.metrics.monthlyUnits)}</strong><DeltaBadge change={item.changes.monthlyUnits} /><small>{item.metrics.monthlyUnitsGrowthPercent === null ? "估算值" : `增长率 ${item.metrics.monthlyUnitsGrowthPercent > 0 ? "+" : ""}${formatNumber(item.metrics.monthlyUnitsGrowthPercent, 1)}%`}</small></td>
                        <td><span className={`promotion-badge ${promotionState.tone}`}>{promotionState.label}</span><small>{promotionState.detail}</small></td>
                        <td><strong>{formatNumber(item.metrics.rating, 1)}</strong><DeltaBadge change={item.changes.rating} mode="absolute" /></td>
                        <td><strong>{formatNumber(item.metrics.bsr)}</strong><DeltaBadge change={item.changes.bsr} /></td>
                        <td><strong>自然 {formatPercent(item.traffic.naturalTrafficShare)} · 广告 {formatPercent(item.traffic.adTrafficShare)}</strong><small>SP {formatNumber(item.traffic.spKeywords)} 词 · SBV {formatNumber(item.traffic.sbvKeywords)} 词</small></td>
                        <td><strong className={item.listingChanges.changed ? "listing-table-changed" : ""}>{item.listingChanges.baseline ? "已建基线" : item.listingChanges.changed ? `${item.listingChanges.summaries.length} 项变动` : "无变动"}</strong><small>{item.listing.imageUrls.length} 图 · {item.listing.bullets.length} 条五点</small></td>
                        <td><strong>{formatDate(item.capturedAt)}</strong><small>{item.history.length} 天记录</small></td>
                        <td><button type="button" className="history-link" onClick={(event) => { event.stopPropagation(); openHistory(item); }}>查历史</button></td>
                      </tr>;
                    })}
                    {!results.length && <tr><td className="empty-cell" colSpan={10}>还没有监控对象。上方输入 ASIN 并点击“开始同步”，即可获取价格、销量、广告/自然流量和核心关键词位基线。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            {selected && <SnapshotDetail result={selected} />}
          </div>
        ) : (
          <div className="page-content history-page">
            <section className="history-hero">
              <div className="history-copy"><h2>查询 ASIN 历史表现</h2><p>查询平台历史价格、Deal、BSR、评分与评论轨迹；已加入监控的 ASIN 还可查看销量、广告/自然流量占比及 SP、SBV 核心关键词位变化。</p></div>
              <form className="history-search" onSubmit={handleHistoryQuery}>
                <label>查询对象</label><div className="history-fields"><select aria-label="历史查询站点" value={historyMarketplace} onChange={(event) => setHistoryMarketplace(event.target.value)}>{MARKETPLACES.map((item) => <option key={item}>{item}</option>)}</select><input value={historyAsin} onChange={(event) => setHistoryAsin(event.target.value.toUpperCase())} placeholder="输入 10 位 ASIN" maxLength={10} /><select aria-label="历史范围" value={historyDays} onChange={(event) => setHistoryDays(event.target.value)}><option value="30">近 30 天</option><option value="90">近 90 天</option><option value="180">近 180 天</option><option value="365">近 365 天</option></select><button type="submit" disabled={historyLoading}>{historyLoading ? "查询中…" : "查询历史"}</button></div><p role="status">{historyMessage}</p>
              </form>
            </section>

            {!historyResult ? (
              <section className="history-empty-grid"><div className="history-empty-card"><span>01</span><strong>平台历史</strong><p>首次查询即可查看 SellerSprite 返回的过往售价、PD、Coupon、Amazon Deal、BSR、评分和评论数。</p></div><div className="history-empty-card"><span>02</span><strong>留存快照</strong><p>从加入监控开始，每日分别累积 PD、Coupon、Amazon Deal、折后价和核心流量。</p></div><div className="history-empty-card dark"><span>查询说明</span><strong>三种促销独立识别</strong><p>PD、Coupon 和 Amazon Deal 不互相推断；历史促销也不代表目前仍有效。</p></div></section>
            ) : (
              <>
                <section className="product-card history-product">
                  <div className="history-product-info">{historyResult.platform.imageUrl ? <img src={historyResult.platform.imageUrl} alt="" /> : <div className="image-placeholder">ASIN</div>}<div><div className="product-code"><span>{historyResult.platform.marketplace}</span>{historyResult.platform.asin}</div><h2>{historyResult.platform.title}</h2><p>{historyResult.platform.brand || "品牌待识别"} · 覆盖近 {historyResult.platform.rangeDays} 天 · {historyResult.platform.points.length} 个数据点</p></div></div>
                  <a href={historyResult.platform.amazonUrl} target="_blank" rel="noreferrer" className="ghost-button">Amazon 商品页 ↗</a>
                </section>
                <section className="history-overview">
                  <div><span>最新平台售价</span><strong>{formatMoney(latestPlatformPoint?.marketPrice ?? null, historyResult.platform.currency)}</strong><small>{platformPriceChange === null ? "缺少期初可比价" : `${platformPriceChange >= 0 ? "上涨" : "下降"} ${Math.abs(platformPriceChange).toFixed(1)}%`}</small></div>
                  <div><span>最新 BSR</span><strong>{formatNumber(latestPlatformPoint?.bsr ?? null)}</strong><small>数字越低越好</small></div>
                  <div><span>最新评分</span><strong>{formatNumber(latestPlatformPoint?.rating ?? null, 1)}</strong><small>{formatNumber(latestPlatformPoint?.reviews ?? null)} 条评论</small></div>
                  <div><span>本产品快照</span><strong>{historyResult.retained ? `${historyResult.retained.history.length} 天` : "未监控"}</strong><small>{historyResult.retained ? "可查看销量、促销与流量" : "同步今日数据后开始累积"}</small></div>
                </section>
                <section className="product-card platform-chart-card">
                  <div className="card-heading"><div><span className="section-label">SellerSprite Keepa</span><h2>平台历史轨迹</h2></div><span>{historyResult.platform.points[0] ? `${formatDate(historyResult.platform.points[0].capturedAt)} — ${formatDate(historyResult.platform.points[historyResult.platform.points.length - 1].capturedAt)}` : "暂无数据"}</span></div>
                  <div className="metric-tabs large">{PLATFORM_METRICS.map((item) => <button type="button" key={item.key} className={historyMetric === item.key ? "active" : ""} onClick={() => setHistoryMetric(item.key)}>{item.label}</button>)}</div>
                  <PlatformChart response={historyResult} metric={historyMetric} />
                  <PromotionHistoryList points={historyResult.platform.promotionHistory} currency={historyResult.platform.currency} />
                  <p className="source-note">{historyResult.platform.sourceNote}</p>
                </section>
                {historyResult.retained ? <SnapshotDetail result={historyResult.retained} /> : <section className="start-monitoring"><div><span className="section-label">Start monitoring</span><h2>这个 ASIN 还没有产品快照</h2><p>平台历史可以回看过去；要持续追踪销量、PD、Coupon、Amazon Deal、折后价和核心流量，需要从今天建立自己的监控基线。</p></div><button type="button" onClick={() => { setInput(`${historyMarketplace} ${historyAsin}`); setDefaultMarketplace(historyMarketplace); setView("monitor"); }}>去建立今日基线 →</button></section>}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
