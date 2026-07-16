import { env } from "cloudflare:workers";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AnalysisResult, Severity } from "./demo-data";

const CURRENCIES: Record<string, string> = { US: "USD", JP: "JPY", UK: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", CA: "CAD", IN: "INR", MX: "MXN", BR: "BRL", AU: "AUD", AE: "AED" };
const AMAZON_DOMAINS: Record<string, string> = { US: "amazon.com", JP: "amazon.co.jp", UK: "amazon.co.uk", DE: "amazon.de", FR: "amazon.fr", IT: "amazon.it", ES: "amazon.es", CA: "amazon.ca", IN: "amazon.in", MX: "amazon.com.mx", BR: "amazon.com.br", AU: "amazon.com.au", AE: "amazon.ae" };

type ToolResult = { content?: Array<{ type: string; text?: string }> };
type AnyRecord = Record<string, any>;

function runtimeConfig() {
  const runtime = env as unknown as Record<string, unknown>;
  const processEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const url = typeof runtime.SELLERSPRITE_MCP_URL === "string" ? runtime.SELLERSPRITE_MCP_URL : processEnv?.SELLERSPRITE_MCP_URL ?? "";
  const rawHeaders = typeof runtime.SELLERSPRITE_MCP_HEADERS_JSON === "string" ? runtime.SELLERSPRITE_MCP_HEADERS_JSON : processEnv?.SELLERSPRITE_MCP_HEADERS_JSON ?? "{}";
  if (!url) throw new Error("卖家精灵数据服务尚未连接，请先配置服务端 MCP 环境变量");
  let headers: Record<string, string>;
  try {
    headers = JSON.parse(rawHeaders) as Record<string, string>;
  } catch {
    throw new Error("SELLERSPRITE_MCP_HEADERS_JSON 格式无效");
  }
  return { url, headers };
}

function toolData(result: unknown) {
  const content = (result as ToolResult)?.content ?? [];
  const text = content.find((item) => item.type === "text")?.text;
  if (!text) return null;
  const parsed = JSON.parse(text) as { code?: string; message?: string; data?: unknown };
  if (parsed.code && parsed.code !== "OK") throw new Error(parsed.message || "卖家精灵接口返回错误");
  return parsed.data as AnyRecord | AnyRecord[] | null;
}

function median(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 10000) / 100 : null;
}

function competitorReason(item: AnyRecord, medianPrice: number | null) {
  if (medianPrice !== null && typeof item.price === "number" && item.price < medianPrice * 0.85) return "低价压力";
  if (typeof item.unitsGr === "number" && item.unitsGr >= 30) return "增长较快";
  if (typeof item.rating === "number" && item.rating >= 4.4) return "高评分";
  return "同类对标";
}

function healthScore(rating: number | null, freeShare: number | null, dataConflict: boolean) {
  let score = 60;
  if (rating !== null) score += Math.round((rating - 3.5) * 16);
  if (freeShare !== null) score += Math.round((freeShare - 50) / 5);
  if (dataConflict) score -= 8;
  return Math.max(0, Math.min(99, score));
}

export async function analyzeAsin(marketplace: string, asin: string): Promise<AnalysisResult> {
  const { url, headers } = runtimeConfig();
  const client = new Client({ name: "asin-radar", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  await client.connect(transport);

  try {
    const call = (name: string, args: AnyRecord) => client.callTool({ name, arguments: args });
    const [detailResult, competitorResult, keywordResult, relationResult, salesResult] = await Promise.all([
      call("asin_detail_with_coupon_trend", { asin, marketplace }),
      call("asin_competitor", { asin, marketplace, size: 8 }),
      call("traffic_keyword_stat", { asin, marketplace }),
      call("traffic_listing_stat", { asin, marketplace }),
      call("asin_sales_trend", { asin, marketplace }),
    ]);

    const detail = toolData(detailResult) as AnyRecord;
    const detailAsin = detail?.asin ?? {};
    const candidates = (toolData(competitorResult) as AnyRecord[]) ?? [];
    const keywordStat = (toolData(keywordResult) as AnyRecord) ?? {};
    const relationStat = (toolData(relationResult) as AnyRecord) ?? {};
    const sales = (toolData(salesResult) as AnyRecord) ?? {};
    const candidateAsins = candidates.slice(0, 6).map((item) => item.asin).filter(Boolean);
    const lookupResult = await call("competitor_lookup", { request: { asins: [asin, ...candidateAsins], marketplace, variation: "Y", page: 1, size: 10 } });
    const lookup = (toolData(lookupResult) as AnyRecord)?.items ?? [];
    const seed = lookup.find((item: AnyRecord) => item.asin === asin) ?? detailAsin;
    const competitors = lookup.filter((item: AnyRecord) => item.asin !== asin).slice(0, 5);
    const medianPrice = median(competitors.map((item: AnyRecord) => item.price));
    const medianRating = median(competitors.map((item: AnyRecord) => item.rating));
    const detailPrice = typeof detailAsin.price === "number" ? detailAsin.price : null;
    const lookupPrice = typeof seed.price === "number" ? seed.price : null;
    const priceConflict = detailPrice !== null && lookupPrice !== null && Math.abs(detailPrice - lookupPrice) >= 0.5;
    const relations = Number(relationStat.relations ?? 0);
    const freeRelations = Number(relationStat.freeRelations ?? 0);
    const paidRelations = Number(relationStat.paidRelations ?? 0);
    const freeShare = percent(freeRelations, relations);
    const paidShare = percent(paidRelations, relations);
    const naturalKeywords = keywordStat?.badgeCount?.ns ?? null;
    const adKeywords = keywordStat?.badgeCount?.ad ?? null;
    const conclusions: Array<{ severity: Severity; title: string; body: string }> = [];

    if (freeShare !== null && freeShare >= 75) conclusions.push({ severity: "info", title: "自然流量结构较健康", body: `免费关联占 ${freeShare.toFixed(1)}%，当前不是明显的广告堆量型。` });
    if (freeShare !== null && freeShare < 40) conclusions.push({ severity: "medium", title: "付费流量依赖偏高", body: `付费关联占 ${(paidShare ?? 0).toFixed(1)}%，需要关注广告成本和自然排名稳定性。` });
    if (medianRating !== null && typeof seed.rating === "number" && seed.rating < medianRating) conclusions.push({ severity: "medium", title: "评分低于直接竞品中位数", body: `当前评分 ${seed.rating.toFixed(1)}，竞品中位数 ${medianRating.toFixed(1)}，建议优先分析近期差评。` });
    if (medianPrice !== null && lookupPrice !== null) {
      const gap = ((lookupPrice - medianPrice) / medianPrice) * 100;
      conclusions.push({ severity: Math.abs(gap) >= 15 ? "medium" : "info", title: gap < 0 ? "价格低于竞品中位数" : "价格高于竞品中位数", body: `当前可比价比直接竞品中位数${gap < 0 ? "低" : "高"} ${Math.abs(gap).toFixed(1)}%。` });
    }
    const trend = (sales?.salesTrendPoints ?? []).filter((point: AnyRecord) => point.month !== new Date().toISOString().slice(0, 7));
    if (trend.length >= 2) {
      const previous = trend[trend.length - 2]?.parentUnitSales;
      const latest = trend[trend.length - 1]?.parentUnitSales;
      if (typeof previous === "number" && previous > 0 && typeof latest === "number") {
        const change = ((latest - previous) / previous) * 100;
        conclusions.push({ severity: Math.abs(change) >= 25 ? "medium" : "info", title: change >= 0 ? "最近完整月销量回升" : "最近完整月销量回落", body: `SellerSprite 月度估算较前月${change >= 0 ? "增加" : "下降"} ${Math.abs(change).toFixed(1)}%。` });
      }
    }
    if (priceConflict) conclusions.push({ severity: "high", title: "不同接口价格口径冲突", body: `详情价与批量可比价分别为 ${detailPrice} 和 ${lookupPrice}，后续变化必须按同一接口判断。` });
    if (!conclusions.length) conclusions.push({ severity: "info", title: "已建立首份基线", body: "本次没有历史快照，需等下一次同口径采集后才能生成变化告警。" });

    const dataNotes = ["月销量和销售额为 SellerSprite 估算值，不是 Amazon 后台实际订单。"];
    if (priceConflict) dataNotes.unshift("详情接口与批量对比接口的当前价格存在差异，页面保留两种口径。 ");

    return {
      marketplace,
      asin,
      capturedAt: new Date().toISOString(),
      title: detailAsin.title ?? seed.title ?? asin,
      brand: detailAsin.brand ?? seed.brand ?? "",
      amazonUrl: `https://www.${AMAZON_DOMAINS[marketplace]}/dp/${asin}`,
      currency: CURRENCIES[marketplace] ?? "USD",
      healthScore: healthScore(seed.rating ?? null, freeShare, priceConflict),
      metrics: {
        price: detailPrice ?? lookupPrice,
        priceNote: priceConflict ? `可比接口 ${lookupPrice}` : "当前抓取价",
        bsr: seed.bsr ?? detailAsin.bsrRank ?? null,
        rating: seed.rating ?? detailAsin.rating ?? null,
        reviews: seed.ratings ?? detailAsin.ratings ?? null,
        monthlyUnits: seed.units ?? null,
        monthlyRevenue: seed.revenue ?? null,
      },
      traffic: {
        naturalKeywords,
        adKeywords,
        freeShare,
        paidShare,
        interpretation: freeShare === null ? "流量结构暂缺。" : freeShare >= 75 ? "自然与免费关联占主导，优先守住核心词和评价。" : freeShare < 40 ? "付费关联占比较高，重点监控广告效率和自然词流失。" : "自然与付费结构相对均衡。",
      },
      conclusions,
      competitors: competitors.map((item: AnyRecord) => ({ asin: item.asin, brand: item.brand ?? "", price: item.price ?? null, rating: item.rating ?? null, monthlyUnits: item.units ?? null, reason: competitorReason(item, medianPrice) })),
      actions: [
        medianRating !== null && typeof seed.rating === "number" && seed.rating < medianRating ? "优先分析近期 1–3 星评论，找出评分差距。" : "保持当前评分优势并监控新增差评主题。",
        freeShare !== null && freeShare >= 75 ? "守住自然关键词，不因竞品加广告就盲目跟投。" : "检查高流量词的自然排名与广告投入效率。",
        "7 天后按同一接口复查价格、BSR、销量、评分和重点竞品。",
      ],
      dataNotes,
    };
  } finally {
    await client.close();
  }
}
