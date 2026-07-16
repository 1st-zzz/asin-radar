"use client";

import { FormEvent, useMemo, useState } from "react";
import { demoResult, type AnalysisResult, type MonitorResponse } from "../lib/demo-data";

const MARKETPLACES = ["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA", "IN", "MX", "BR", "AU", "AE"];

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

function severityLabel(severity: string) {
  return severity === "high" ? "重点" : severity === "medium" ? "关注" : "信息";
}

function parseTargets(input: string, defaultMarketplace: string) {
  return input
    .split(/[\n,;]+/)
    .map((line) => line.trim().toUpperCase())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length > 1 && MARKETPLACES.includes(parts[0])) {
        return { marketplace: parts[0], asin: parts[1] };
      }
      return { marketplace: defaultMarketplace, asin: parts[0] };
    });
}

export default function Home() {
  const [defaultMarketplace, setDefaultMarketplace] = useState("DE");
  const [input, setInput] = useState("DE B0DPDKLHYM");
  const [results, setResults] = useState<AnalysisResult[]>([demoResult]);
  const [selectedKey, setSelectedKey] = useState("DE:B0DPDKLHYM");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("已载入德国站真实基线示例");

  const selected = useMemo(
    () => results.find((item) => `${item.marketplace}:${item.asin}` === selectedKey) ?? results[0],
    [results, selectedKey]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const targets = parseTargets(input, defaultMarketplace);
    const invalid = targets.find((target) => !MARKETPLACES.includes(target.marketplace) || !/^[A-Z0-9]{10}$/.test(target.asin));
    if (!targets.length || invalid) {
      setMessage("请按“站点 ASIN”输入，例如：DE B0DPDKLHYM");
      return;
    }
    if (targets.length > 20) {
      setMessage("单次最多分析 20 个 ASIN，请拆成多批提交");
      return;
    }

    setIsLoading(true);
    setMessage(`正在分析 ${targets.length} 个 ASIN…`);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targets }),
      });
      const payload = (await response.json()) as MonitorResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "分析服务暂时不可用");
      setResults(payload.results);
      setSelectedKey(`${payload.results[0].marketplace}:${payload.results[0].asin}`);
      setMessage(payload.persisted ? "分析完成，结果已保存" : "分析完成；当前环境未启用历史保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分析失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ASIN Radar 首页">
          <span className="brand-mark">AR</span>
          <span>ASIN Radar</span>
        </a>
        <div className="topbar-meta">
          <span className="status-dot" />
          卖家精灵数据层
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">多站点竞品监控</p>
          <h1>输入各国 ASIN，<br />把数据变成下一步动作。</h1>
          <p className="hero-description">
            自动发现竞品、建立基线，聚合价格、BSR、销量、评分与流量结构，输出可执行结论。
          </p>
        </div>

        <form className="input-panel" onSubmit={handleSubmit}>
          <div className="input-heading">
            <div>
              <span className="step-number">01</span>
              <h2>添加监控对象</h2>
            </div>
            <span className="limit">最多 20 个</span>
          </div>
          <label htmlFor="targets">每行输入一个 ASIN，可在前面加站点</label>
          <textarea
            id="targets"
            data-testid="target-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={"DE B0DPDKLHYM\nUS B0XXXXXXXX"}
            rows={5}
          />
          <div className="form-row">
            <div className="select-wrap">
              <span>默认站点</span>
              <select
                aria-label="默认站点"
                value={defaultMarketplace}
                onChange={(event) => setDefaultMarketplace(event.target.value)}
              >
                {MARKETPLACES.map((marketplace) => <option key={marketplace}>{marketplace}</option>)}
              </select>
            </div>
            <button className="primary-button" type="submit" disabled={isLoading} data-testid="analyze-button">
              {isLoading ? "正在分析" : "开始分析"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <p className="form-message" role="status">{message}</p>
        </form>
      </section>

      <section className="workspace" aria-label="监控结果">
        <div className="section-heading">
          <div>
            <p className="eyebrow">监控列表</p>
            <h2>{results.length} 个商品 · {new Set(results.map((item) => item.marketplace)).size} 个站点</h2>
          </div>
          <span className="baseline-badge">首次基线</span>
        </div>

        <div className="result-grid">
          <aside className="result-list" aria-label="ASIN 列表">
            {results.map((item) => {
              const key = `${item.marketplace}:${item.asin}`;
              return (
                <button
                  type="button"
                  key={key}
                  className={`result-item ${selectedKey === key ? "active" : ""}`}
                  onClick={() => setSelectedKey(key)}
                >
                  <span className="market-tag">{item.marketplace}</span>
                  <span className="result-item-copy">
                    <strong>{item.asin}</strong>
                    <small>{item.brand || "品牌待识别"}</small>
                  </span>
                  <span className="health-score">{item.healthScore}</span>
                </button>
              );
            })}
            <div className="score-note"><span>健康分</span><strong>综合价格、评分、流量与数据完整度</strong></div>
          </aside>

          {selected && (
            <article className="analysis-card">
              <div className="analysis-header">
                <div>
                  <div className="analysis-kicker"><span>{selected.marketplace}</span>{selected.asin}</div>
                  <h2>{selected.title}</h2>
                  <p>{selected.brand} · 抓取于 {new Date(selected.capturedAt).toLocaleString("zh-CN")}</p>
                </div>
                <a href={selected.amazonUrl} target="_blank" rel="noreferrer" className="amazon-link">查看商品 ↗</a>
              </div>

              <div className="metric-strip">
                <div><span>当前价格</span><strong>{formatMoney(selected.metrics.price, selected.currency)}</strong><small>{selected.metrics.priceNote}</small></div>
                <div><span>主类 BSR</span><strong>{formatNumber(selected.metrics.bsr)}</strong><small>数字越低越好</small></div>
                <div><span>评分</span><strong>{formatNumber(selected.metrics.rating, 1)}</strong><small>{formatNumber(selected.metrics.reviews)} 个评分</small></div>
                <div><span>月销量估算</span><strong>{formatNumber(selected.metrics.monthlyUnits)}</strong><small>{formatMoney(selected.metrics.monthlyRevenue, selected.currency)}</small></div>
              </div>

              <div className="insight-layout">
                <section>
                  <div className="subheading"><span className="step-number">02</span><h3>核心结论</h3></div>
                  <div className="insight-list">
                    {selected.conclusions.map((conclusion) => (
                      <div className={`insight ${conclusion.severity}`} key={conclusion.title}>
                        <span className="severity">{severityLabel(conclusion.severity)}</span>
                        <div><strong>{conclusion.title}</strong><p>{conclusion.body}</p></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="traffic-card">
                  <div className="subheading"><span className="step-number">03</span><h3>流量结构</h3></div>
                  <div className="traffic-number"><strong>{formatNumber(selected.traffic.freeShare, 1)}%</strong><span>免费关联</span></div>
                  <div className="traffic-bar" aria-label={`免费流量 ${selected.traffic.freeShare}%`}>
                    <span style={{ width: `${selected.traffic.freeShare ?? 0}%` }} />
                  </div>
                  <div className="traffic-legend"><span>自然词 {formatNumber(selected.traffic.naturalKeywords)}</span><span>广告词 {formatNumber(selected.traffic.adKeywords)}</span></div>
                  <p>{selected.traffic.interpretation}</p>
                </section>
              </div>

              <section className="competitor-section">
                <div className="subheading"><span className="step-number">04</span><h3>优先竞品</h3></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>ASIN / 品牌</th><th>价格</th><th>评分</th><th>月销量</th><th>关注点</th></tr></thead>
                    <tbody>
                      {selected.competitors.map((competitor) => (
                        <tr key={competitor.asin}>
                          <td><strong>{competitor.asin}</strong><small>{competitor.brand}</small></td>
                          <td>{formatMoney(competitor.price, selected.currency)}</td>
                          <td>{formatNumber(competitor.rating, 1)}</td>
                          <td>{formatNumber(competitor.monthlyUnits)}</td>
                          <td><span className="watch-reason">{competitor.reason}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="action-section">
                <div className="subheading"><span className="step-number">05</span><h3>下一步动作</h3></div>
                <ol>{selected.actions.map((action) => <li key={action}>{action}</li>)}</ol>
                {selected.dataNotes.length > 0 && <details><summary>数据口径与证据缺口</summary><ul>{selected.dataNotes.map((note) => <li key={note}>{note}</li>)}</ul></details>}
              </section>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
