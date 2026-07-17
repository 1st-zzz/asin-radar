import { env } from "cloudflare:workers";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AnalysisResult, PlatformHistoryPoint, PlatformHistoryResult, PromotionHistoryPoint, Severity } from "./demo-data";

const CURRENCIES: Record<string, string> = { US: "USD", JP: "JPY", UK: "GBP", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", CA: "CAD", IN: "INR", MX: "MXN", BR: "BRL", AU: "AUD", AE: "AED" };
const AMAZON_DOMAINS: Record<string, string> = { US: "amazon.com", JP: "amazon.co.jp", UK: "amazon.co.uk", DE: "amazon.de", FR: "amazon.fr", IT: "amazon.it", ES: "amazon.es", CA: "amazon.ca", IN: "amazon.in", MX: "amazon.com.mx", BR: "amazon.com.br", AU: "amazon.com.au", AE: "amazon.ae" };

type ToolResult = { content?: Array<{ type: string; text?: string }> };
// SellerSprite tools expose heterogeneous payloads that are validated at each read site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function optionalToolData(result: unknown) {
  try {
    return toolData(result);
  } catch {
    return null;
  }
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function effectivePrice(price: number | null, couponValue: unknown) {
  const coupon = typeof couponValue === "string" ? couponValue.trim() : "";
  if (price === null) return { coupon: coupon || null, couponActive: coupon ? true : false, couponType: coupon ? "text" as const : null, couponValue: coupon || null, couponFinalPrice: null, value: null, note: "当前价格缺失" };
  if (!coupon) return { coupon: null, couponActive: false, couponType: null, couponValue: null, couponFinalPrice: null, value: price, note: "当前无优惠券" };

  const percentMatch = coupon.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const discount = Number(percentMatch[1]);
    const value = roundMoney(price * (1 - discount / 100));
    return { coupon, couponActive: true, couponType: "percent" as const, couponValue: discount, couponFinalPrice: value, value, note: `已扣除 ${coupon} 优惠券` };
  }

  const amountMatch = coupon.match(/(\d+(?:[.,]\d+)?)/);
  if (amountMatch && !/%/.test(coupon)) {
    const discount = Number(amountMatch[1].replace(",", "."));
    if (Number.isFinite(discount) && discount > 0 && discount < price) {
      const value = roundMoney(price - discount);
      return { coupon, couponActive: true, couponType: "amount" as const, couponValue: discount, couponFinalPrice: value, value, note: `已扣除 ${coupon} 优惠券` };
    }
  }

  return { coupon, couponActive: true, couponType: "text" as const, couponValue: coupon, couponFinalPrice: null, value: null, note: `优惠券“${coupon}”无法可靠换算` };
}

function emptyChange(current: number | null) {
  return { current, previous: null, absolute: null, percent: null, direction: "new" as const, favorable: null };
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function keywordAdType(badges: unknown): "SP" | "SBV" | "SB" | null {
  if (!Array.isArray(badges)) return null;
  if (badges.includes("sponsorVideo")) return "SBV";
  if (badges.includes("sponsorBrand")) return "SB";
  if (badges.includes("ads")) return "SP";
  return null;
}

function trafficBreakdown(itemsValue: unknown) {
  const items = Array.isArray(itemsValue) ? itemsValue as AnyRecord[] : [];
  let coverage = 0;
  let natural = 0;
  let ad = 0;
  let sp = 0;
  let sbv = 0;
  let sb = 0;
  for (const item of items) {
    const weight = finiteNumber(item.trafficPercentage) ?? 0;
    const adRatio = finiteNumber(item.adRatio) ?? 0;
    const naturalRatio = finiteNumber(item.naturalRatio) ?? Math.max(0, 1 - adRatio);
    const adWeight = weight * adRatio;
    coverage += weight;
    natural += weight * naturalRatio;
    ad += adWeight;
    const type = keywordAdType(item.badges);
    if (type === "SP") sp += adWeight;
    else if (type === "SBV") sbv += adWeight;
    else if (type === "SB") sb += adWeight;
  }
  const share = (value: number) => coverage > 0 ? Math.round((value / coverage) * 10000) / 100 : null;
  const naturalTrafficShare = share(natural);
  const adTrafficShare = share(ad);
  const spTrafficShare = share(sp);
  const sbvTrafficShare = share(sbv);
  const sbTrafficShare = share(sb);
  const knownAd = (spTrafficShare ?? 0) + (sbvTrafficShare ?? 0) + (sbTrafficShare ?? 0);
  return {
    naturalTrafficShare,
    adTrafficShare,
    spTrafficShare,
    sbvTrafficShare,
    sbTrafficShare,
    otherAdTrafficShare: adTrafficShare === null ? null : Math.max(0, Math.round((adTrafficShare - knownAd) * 100) / 100),
    trafficCoverage: coverage > 0 ? Math.round(coverage * 10000) / 100 : null,
    coreKeywords: items.slice(0, 12).map((item) => ({
      keyword: typeof item.keyword === "string" ? item.keyword : "",
      keywordCn: typeof item.keywordCn === "string" && item.keywordCn ? item.keywordCn : null,
      trafficShare: finiteNumber(item.trafficPercentage) === null ? null : Math.round((item.trafficPercentage as number) * 10000) / 100,
      searches: finiteNumber(item.searches),
      naturalRank: finiteNumber(item.rankPosition?.position),
      adRank: finiteNumber(item.adPosition?.position),
      adType: keywordAdType(item.badges),
    })).filter((item) => item.keyword),
  };
}

type TrendValue = { timePoint?: number; value?: number };
type CouponTrend = { date?: string; type?: string; asinPrice?: number; couponPrice?: number; finalPrice?: number };

function recentDealObservation(value: unknown, capturedAt: number) {
  if (!Array.isArray(value)) return null;
  return (value as TrendValue[])
    .filter((item) => typeof item.timePoint === "number" && typeof item.value === "number" && item.value > 0 && capturedAt - item.timePoint >= 0 && capturedAt - item.timePoint <= 36 * 3600000)
    .sort((a, b) => (b.timePoint ?? 0) - (a.timePoint ?? 0))[0] ?? null;
}

function couponHistory(value: unknown): PromotionHistoryPoint[] {
  if (!Array.isArray(value)) return [];
  return (value as CouponTrend[])
    .filter((item) => typeof item.date === "string" && !Number.isNaN(Date.parse(`${item.date}T12:00:00Z`)))
    .map((item) => {
      const listPrice = typeof item.asinPrice === "number" && item.asinPrice > 0 ? item.asinPrice : null;
      const promotionPrice = typeof item.finalPrice === "number" && item.finalPrice > 0 ? item.finalPrice : null;
      const discountAmount = typeof item.couponPrice === "number" && item.couponPrice > 0 ? item.couponPrice : null;
      return {
        capturedAt: new Date(`${item.date}T12:00:00Z`).toISOString(),
        kind: "coupon" as const,
        label: item.type === "P" ? "Coupon · 百分比" : item.type === "M" ? "Coupon · 金额" : "Coupon",
        listPrice,
        promotionPrice,
        discountAmount,
        discountPercent: listPrice !== null && discountAmount !== null ? Math.round((discountAmount / listPrice) * 10000) / 100 : null,
      };
    })
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
}

function dealHistory(value: unknown): PromotionHistoryPoint[] {
  if (!Array.isArray(value)) return [];
  return (value as TrendValue[])
    .filter((item) => typeof item.timePoint === "number" && typeof item.value === "number" && item.value > 0)
    .map((item) => ({
      capturedAt: new Date(item.timePoint as number).toISOString(),
      kind: "deal" as const,
      label: "Amazon Deal",
      listPrice: null,
      promotionPrice: item.value as number,
      discountAmount: null,
      discountPercent: null,
    }))
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
}

function pdHistory(primePrice: unknown, capturedAt: number): PromotionHistoryPoint[] {
  if (typeof primePrice !== "number" || !Number.isFinite(primePrice) || primePrice <= 0) return [];
  return [{
    capturedAt: new Date(capturedAt).toISOString(),
    kind: "pd",
    label: "PD · Prime 专享",
    listPrice: null,
    promotionPrice: primePrice,
    discountAmount: null,
    discountPercent: null,
  }];
}

function mergePromotionHistory(couponTrends: unknown, dealPrices: unknown, primePrice: unknown = null, capturedAt = Date.now()) {
  const seen = new Set<string>();
  return [...couponHistory(couponTrends), ...pdHistory(primePrice, capturedAt), ...dealHistory(dealPrices)]
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
    .filter((item) => {
      const key = `${item.kind}:${item.capturedAt.slice(0, 10)}:${item.promotionPrice}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 120);
}

function mergeHistorySeries(data: AnyRecord, couponTrends: unknown = []) {
  const byDay = new Map<string, PlatformHistoryPoint & { timestamp: number; price?: number | null }>();
  const apply = (series: TrendValue[] | undefined, field: "price" | "dealPrice" | "listPrice" | "buyBoxPrice" | "bsr" | "rating" | "reviews") => {
    for (const item of series ?? []) {
      if (typeof item.timePoint !== "number" || typeof item.value !== "number" || !Number.isFinite(item.value)) continue;
      const day = new Date(item.timePoint).toISOString().slice(0, 10);
      const current = byDay.get(day) ?? {
        timestamp: item.timePoint,
        capturedAt: new Date(item.timePoint).toISOString(),
        marketPrice: null,
        listPrice: null,
        buyBoxPrice: null,
        dealPrice: null,
        couponPrice: null,
        promotionPrice: null,
        bsr: null,
        rating: null,
        reviews: null,
      };
      if (item.timePoint >= current.timestamp) {
        current.timestamp = item.timePoint;
        current.capturedAt = new Date(item.timePoint).toISOString();
      }
      current[field] = item.value;
      byDay.set(day, current);
    }
  };

  apply(data.price, "price");
  apply(data.dealPrice, "dealPrice");
  apply(data.priceList, "listPrice");
  apply(data.buyBox, "buyBoxPrice");
  apply(data.bsr, "bsr");
  apply(data.rating, "rating");
  apply(data.reviews, "reviews");

  for (const item of couponHistory(couponTrends)) {
    if (item.promotionPrice === null) continue;
    const timestamp = Date.parse(item.capturedAt);
    const day = item.capturedAt.slice(0, 10);
    const current = byDay.get(day) ?? {
      timestamp,
      capturedAt: item.capturedAt,
      marketPrice: null,
      listPrice: null,
      buyBoxPrice: null,
      dealPrice: null,
      couponPrice: null,
      promotionPrice: null,
      bsr: null,
      rating: null,
      reviews: null,
    };
    current.couponPrice = item.promotionPrice;
    current.listPrice = current.listPrice ?? item.listPrice;
    byDay.set(day, current);
  }

  return [...byDay.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((point) => ({
      capturedAt: point.capturedAt,
      marketPrice: point.dealPrice ?? point.buyBoxPrice ?? point.price ?? null,
      listPrice: point.listPrice,
      buyBoxPrice: point.buyBoxPrice,
      dealPrice: point.dealPrice ?? null,
      couponPrice: point.couponPrice ?? null,
      promotionPrice: point.dealPrice ?? point.couponPrice ?? null,
      bsr: point.bsr,
      rating: point.rating,
      reviews: point.reviews,
    }));
}

export async function queryAsinHistory(marketplace: string, asin: string, rangeDays: number): Promise<PlatformHistoryResult> {
  const { url, headers } = runtimeConfig();
  const client = new Client({ name: "asin-radar-history", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  await client.connect(transport);
  const endTimestamp = Date.now();
  const startTimestamp = endTimestamp - rangeDays * 86400000;

  try {
    const [keepaResult, detailResult] = await Promise.all([
      client.callTool({ name: "keepa_info", arguments: { asin, marketplace, dailyLatest: true, startTimestamp, endTimestamp } }),
      client.callTool({ name: "asin_detail_with_coupon_trend", arguments: { asin, marketplace } }),
    ]);
    const data = (toolData(keepaResult) as AnyRecord) ?? {};
    const detail = (toolData(detailResult) as AnyRecord) ?? {};
    const detailAsin = detail.asin ?? {};
    const inRange = (capturedAt: string) => {
      const timestamp = Date.parse(capturedAt);
      return timestamp >= startTimestamp && timestamp <= endTimestamp;
    };
    const promotionHistory = mergePromotionHistory(detail.couponTrends, data.dealPrice, detailAsin.primePrice, endTimestamp).filter((item) => inRange(item.capturedAt));
    return {
      marketplace,
      asin,
      title: detailAsin.title ?? data.title ?? asin,
      brand: detailAsin.brand ?? data.brand ?? "",
      imageUrl: data.imageUrl ?? detailAsin.imageUrl ?? null,
      amazonUrl: data.asinUrl ?? `https://www.${AMAZON_DOMAINS[marketplace]}/dp/${asin}`,
      currency: CURRENCIES[marketplace] ?? "USD",
      rangeDays,
      points: mergeHistorySeries(data, detail.couponTrends).filter((item) => inRange(item.capturedAt)),
      promotionHistory,
      source: "SellerSprite Keepa",
      sourceNote: "平台历史合并 SellerSprite Coupon 记录与 Keepa 售价、Buy Box、Deal 轨迹；历史促销不代表当前仍在活动。销量估算和流量仅在加入监控后由每日快照累积。",
    };
  } finally {
    await client.close();
  }
}

export async function analyzeAsin(marketplace: string, asin: string): Promise<AnalysisResult> {
  const { url, headers } = runtimeConfig();
  const client = new Client({ name: "asin-radar", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  await client.connect(transport);

  try {
    const call = (name: string, args: AnyRecord) => client.callTool({ name, arguments: args });
    const capturedAt = new Date();
    const mediaEnd = capturedAt.getTime();
    const [detailResult, competitorResult, keywordResult, keywordDetailResult, relationResult, salesResult, mediaResult] = await Promise.all([
      call("asin_detail_with_coupon_trend", { asin, marketplace }),
      call("asin_competitor", { asin, marketplace, size: 8 }),
      call("traffic_keyword_stat", { asin, marketplace }),
      call("traffic_keyword", { request: { asin, marketplace, page: 1, size: 50, order: { field: "trafficPercentage", desc: true } } }).catch(() => null),
      call("traffic_listing_stat", { asin, marketplace }),
      call("asin_sales_trend", { asin, marketplace }),
      call("keepa_info", {
        asin,
        marketplace,
        dailyLatest: true,
        startTimestamp: mediaEnd - 2 * 86400000,
        endTimestamp: mediaEnd,
        returnFields: "asin,title,brand,imageUrl,zoomImageUrl,imageUrls,dealPrice",
      }).catch(() => null),
    ]);

    const detail = toolData(detailResult) as AnyRecord;
    const detailAsin = detail?.asin ?? {};
    const candidates = (toolData(competitorResult) as AnyRecord[]) ?? [];
    const keywordStat = (toolData(keywordResult) as AnyRecord) ?? {};
    const keywordDetail = (optionalToolData(keywordDetailResult) as AnyRecord) ?? {};
    const trafficMix = trafficBreakdown(keywordDetail.items);
    const relationStat = (toolData(relationResult) as AnyRecord) ?? {};
    const sales = (toolData(salesResult) as AnyRecord) ?? {};
    const media = (optionalToolData(mediaResult) as AnyRecord) ?? {};
    const promotionHistory = mergePromotionHistory(detail?.couponTrends, media.dealPrice, detailAsin.primePrice, mediaEnd);
    const candidateAsins = candidates.slice(0, 6).map((item) => item.asin).filter(Boolean);
    const lookupResult = await call("competitor_lookup", { request: { asins: [asin, ...candidateAsins], marketplace, variation: "Y", page: 1, size: 10 } });
    const lookup = (toolData(lookupResult) as AnyRecord)?.items ?? [];
    const seed = lookup.find((item: AnyRecord) => item.asin === asin) ?? detailAsin;
    const competitors = lookup.filter((item: AnyRecord) => item.asin !== asin).slice(0, 5);
    const medianPrice = median(competitors.map((item: AnyRecord) => item.price));
    const medianRating = median(competitors.map((item: AnyRecord) => item.rating));
    const detailPrice = typeof detailAsin.price === "number" ? detailAsin.price : null;
    const lookupPrice = typeof seed.price === "number" ? seed.price : null;
    const pricing = effectivePrice(detailPrice ?? lookupPrice, detailAsin.coupon);
    const pdPrice = typeof detailAsin.primePrice === "number" && detailAsin.primePrice > 0 ? detailAsin.primePrice : null;
    const pdActive = typeof detailAsin.primePrice === "number" ? pdPrice !== null : null;
    const dealObservation = recentDealObservation(media.dealPrice, mediaEnd);
    const dealPrice = dealObservation?.value ?? null;
    const dealActive = Array.isArray(media.dealPrice) ? dealPrice !== null : null;
    const currentEffectivePrice = dealActive && dealPrice !== null ? dealPrice : pricing.value;
    const priceNote = dealActive && dealPrice !== null ? "当前检测到 Amazon Deal 价格；未叠加 Coupon" : pricing.note;
    const priceConflict = detailPrice !== null && lookupPrice !== null && Math.abs(detailPrice - lookupPrice) >= 0.5;
    const relations = Number(relationStat.relations ?? 0);
    const freeRelations = Number(relationStat.freeRelations ?? 0);
    const paidRelations = Number(relationStat.paidRelations ?? 0);
    const freeShare = percent(freeRelations, relations);
    const paidShare = percent(paidRelations, relations);
    const naturalKeywords = keywordStat?.badgeCount?.ns ?? null;
    const adKeywords = keywordStat?.badgeCount?.ad ?? null;
    const spKeywords = keywordStat?.badgeCount?.ad ?? null;
    const sbvKeywords = keywordStat?.badgeCount?.sv ?? null;
    const sbKeywords = keywordStat?.badgeCount?.sb ?? null;
    const listingTitle = detailAsin.title ?? media.title ?? seed.title ?? asin;
    const listingBullets = stringArray(detailAsin.features);
    const listingAttributes = typeof detailAsin.overviews === "string"
      ? detailAsin.overviews
      : detailAsin.overviews
        ? JSON.stringify(detailAsin.overviews)
        : null;
    const galleryImages = stringArray(media.imageUrls);
    const fallbackImages = [media.zoomImageUrl, media.imageUrl, detailAsin.zoomImageUrl, detailAsin.imageUrl]
      .filter((url): url is string => typeof url === "string" && url.length > 0);
    const listingImages = uniqueStrings(galleryImages.length ? galleryImages : fallbackImages);
    const conclusions: Array<{ severity: Severity; title: string; body: string }> = [];

    if (trafficMix.naturalTrafficShare !== null && trafficMix.naturalTrafficShare >= 75) conclusions.push({ severity: "info", title: "自然流量结构较健康", body: `核心流量词加权后，自然流量占 ${trafficMix.naturalTrafficShare.toFixed(1)}%，广告流量占 ${(trafficMix.adTrafficShare ?? 0).toFixed(1)}%。` });
    if (trafficMix.adTrafficShare !== null && trafficMix.adTrafficShare >= 40) conclusions.push({ severity: "medium", title: "广告流量依赖偏高", body: `广告流量占 ${trafficMix.adTrafficShare.toFixed(1)}%，其中 SP ${(trafficMix.spTrafficShare ?? 0).toFixed(1)}%、SBV ${(trafficMix.sbvTrafficShare ?? 0).toFixed(1)}%。` });
    if (medianRating !== null && typeof seed.rating === "number" && seed.rating < medianRating) conclusions.push({ severity: "medium", title: "评分低于直接竞品中位数", body: `当前评分 ${seed.rating.toFixed(1)}，竞品中位数 ${medianRating.toFixed(1)}，建议优先分析近期差评。` });
    if (medianPrice !== null && lookupPrice !== null) {
      const gap = ((lookupPrice - medianPrice) / medianPrice) * 100;
      conclusions.push({ severity: Math.abs(gap) >= 15 ? "medium" : "info", title: gap < 0 ? "价格低于竞品中位数" : "价格高于竞品中位数", body: `当前可比价比直接竞品中位数${gap < 0 ? "低" : "高"} ${Math.abs(gap).toFixed(1)}%。` });
    }
    if (dealActive && dealPrice !== null) conclusions.unshift({ severity: "high", title: "当前检测到 Amazon Deal", body: `Deal 价格为 ${dealPrice} ${CURRENCIES[marketplace] ?? "USD"}；需结合结束后的销量、BSR 与流量判断促销增量。` });
    else if (pdActive && pdPrice !== null) conclusions.unshift({ severity: "info", title: "当前存在 PD", body: `Prime 专享价为 ${pdPrice}；已与 Coupon、Amazon Deal 分开记录。` });
    else if (pricing.couponActive) conclusions.unshift({ severity: "info", title: "当前存在 Coupon", body: pricing.couponFinalPrice !== null ? `Coupon 后价格为 ${pricing.couponFinalPrice}。` : "Coupon 无法可靠换算，已保留原始优惠说明。" });
    const trend = (sales?.salesTrendPoints ?? []).filter((point: AnyRecord) => point.month !== new Date().toISOString().slice(0, 7));
    if (trend.length >= 2) {
      const previous = trend[trend.length - 2]?.parentUnitSales;
      const latest = trend[trend.length - 1]?.parentUnitSales;
      if (typeof previous === "number" && previous > 0 && typeof latest === "number") {
        const change = ((latest - previous) / previous) * 100;
        conclusions.push({ severity: Math.abs(change) >= 25 ? "medium" : "info", title: change >= 0 ? "最近完整月销量回升" : "最近完整月销量回落", body: `SellerSprite 月度估算较前月${change >= 0 ? "增加" : "下降"} ${Math.abs(change).toFixed(1)}%。` });
      }
    }
    if (!conclusions.length) conclusions.push({ severity: "info", title: "已建立首份基线", body: "本次没有历史快照，需等下一次同口径采集后才能生成变化告警。" });

    const dataNotes = ["月销量、销量增长率和销售额为 SellerSprite 估算值，不是 Amazon 后台实际订单。", `Coupon 来自 coupon/couponTrends；PD 仅在 primePrice 明确大于 0 时标记；Amazon Deal 来自近 36 小时 Keepa dealPrice。三种促销独立记录，历史活动不视为当前活动。当前共返回 ${promotionHistory.length} 条促销记录。`, "自然/广告流量占比按 trafficPercentage × naturalRatio/adRatio 加权；SP、SBV、SB 按关键词 badges 区分。流量占比与免费/付费关联占比不是同一口径。"];
    dataNotes.push(Object.keys(media).length
      ? "Listing 标题、五点和属性来自详情接口，图片组来自 Keepa；按每日快照和上一自然日比较。"
      : "Listing 标题、五点和属性已留存；本次 Keepa 图片组不可用，仅保存详情主图。");
    if (priceConflict) dataNotes.unshift(`详情接口与批量对比接口价格分别为 ${detailPrice} 和 ${lookupPrice}；每日折后价固定使用详情接口，批量价仅用于竞品横向对比。`);

    return {
      sourceVersion: 2,
      salesVersion: 1,
      promotionVersion: 2,
      listingVersion: 1,
      trafficVersion: 1,
      marketplace,
      asin,
      capturedAt: capturedAt.toISOString(),
      title: listingTitle,
      brand: detailAsin.brand ?? seed.brand ?? "",
      amazonUrl: `https://www.${AMAZON_DOMAINS[marketplace]}/dp/${asin}`,
      currency: CURRENCIES[marketplace] ?? "USD",
      healthScore: healthScore(seed.rating ?? null, trafficMix.naturalTrafficShare ?? freeShare, priceConflict),
      metrics: {
        price: currentEffectivePrice ?? detailPrice ?? lookupPrice,
        listPrice: detailPrice ?? lookupPrice,
        effectivePrice: currentEffectivePrice,
        coupon: pricing.coupon,
        priceNote,
        bsr: detailAsin.bsrRank ?? null,
        rating: detailAsin.rating ?? null,
        reviews: detailAsin.ratings ?? null,
        monthlyUnits: seed.units ?? null,
        monthlyUnitsGrowthPercent: seed.unitsGr ?? null,
        monthlyRevenue: seed.revenue ?? null,
      },
      salesMeta: {
        source: "competitor_lookup",
        estimate: true,
        period: null,
      },
      promotion: {
        couponActive: pricing.couponActive,
        couponType: pricing.couponType,
        couponValue: pricing.couponValue,
        couponFinalPrice: pricing.couponFinalPrice,
        pdActive,
        pdPrice,
        pdAudience: pdActive ? "prime" : null,
        primePrice: pdPrice,
        dealActive,
        dealType: null,
        dealPrice,
        dealStartAt: typeof dealObservation?.timePoint === "number" ? new Date(dealObservation.timePoint).toISOString() : null,
        dealEndAt: null,
      },
      promotionChanges: {
        baseline: true,
        changed: false,
        summaries: ["已建立促销基线"],
      },
      promotionHistory,
      traffic: {
        naturalKeywords,
        adKeywords,
        spKeywords,
        sbvKeywords,
        sbKeywords,
        freeShare,
        paidShare,
        ...trafficMix,
        sourceNote: "流量占比来自 SellerSprite 前 50 个核心流量词加权；关键词数量来自 traffic_keyword_stat；关联免费/付费占比单独保留。",
        interpretation: trafficMix.naturalTrafficShare === null ? "流量占比暂缺；已保留自然词、SP、SBV、SB 关键词数量。" : trafficMix.naturalTrafficShare >= 75 ? `自然流量占主导；广告流量中 SP ${(trafficMix.spTrafficShare ?? 0).toFixed(1)}%、SBV ${(trafficMix.sbvTrafficShare ?? 0).toFixed(1)}%。` : "广告流量占比较高，重点监控 SP/SBV 广告位和核心自然位。",
      },
      keywordPlacementChanges: [],
      conclusions,
      competitors: competitors.map((item: AnyRecord) => ({ asin: item.asin, brand: item.brand ?? "", price: item.price ?? null, rating: item.rating ?? null, monthlyUnits: item.units ?? null, reason: competitorReason(item, medianPrice) })),
      actions: [
        medianRating !== null && typeof seed.rating === "number" && seed.rating < medianRating ? "优先分析近期 1–3 星评论，找出评分差距。" : "保持当前评分优势并监控新增差评主题。",
        trafficMix.naturalTrafficShare !== null && trafficMix.naturalTrafficShare >= 75 ? "守住核心自然位，并持续检查 SP、SBV 是否扩张。" : "检查高流量词的自然位、SP 位和 SBV 位变化。",
        "明天按同一接口复查销量、PD、Coupon、Amazon Deal、折后价、BSR、评分和核心流量，形成首个日环比。",
      ],
      dataNotes,
      listing: {
        title: listingTitle,
        bullets: listingBullets,
        attributesText: listingAttributes,
        imageUrls: listingImages,
      },
      listingChanges: {
        baseline: true,
        changed: false,
        titleChanged: false,
        bulletsChanged: false,
        attributesChanged: false,
        imagesAdded: [],
        imagesRemoved: [],
        imageOrderChanged: false,
        summaries: ["已建立 Listing 基线"],
      },
      history: [],
      changes: {
        effectivePrice: emptyChange(currentEffectivePrice),
        rating: emptyChange(detailAsin.rating ?? null),
        bsr: emptyChange(detailAsin.bsrRank ?? null),
        naturalKeywords: emptyChange(naturalKeywords),
        freeShare: emptyChange(freeShare),
        naturalTrafficShare: emptyChange(trafficMix.naturalTrafficShare),
        adTrafficShare: emptyChange(trafficMix.adTrafficShare),
        spTrafficShare: emptyChange(trafficMix.spTrafficShare),
        sbvTrafficShare: emptyChange(trafficMix.sbvTrafficShare),
        spKeywords: emptyChange(spKeywords),
        sbvKeywords: emptyChange(sbvKeywords),
        monthlyUnits: emptyChange(seed.units ?? null),
        monthlyUnitsGrowthPercent: emptyChange(seed.unitsGr ?? null),
        monthlyRevenue: emptyChange(seed.revenue ?? null),
        dealPrice: emptyChange(dealPrice),
      },
      comparisonCapturedAt: null,
    };
  } finally {
    await client.close();
  }
}
