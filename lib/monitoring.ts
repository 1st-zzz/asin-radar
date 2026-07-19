import type { AnalysisResult, MetricChange } from "./demo-data";

export const MATERIAL_CHANGE_PERCENT = 15;
export const TRAFFIC_SHARE_CHANGE_POINTS = 15;

export type MaterialSignal = {
  key: string;
  label: string;
  value: number;
  unit: "%" | "pp" | "";
  ratio: number;
};

function percentSignal(key: string, label: string, change: MetricChange, threshold = MATERIAL_CHANGE_PERCENT): MaterialSignal | null {
  if (change.previous === null || change.percent === null || Math.abs(change.percent) < threshold) return null;
  return { key, label, value: change.percent, unit: "%", ratio: Math.abs(change.percent) / threshold };
}

function keywordCountSignal(key: string, label: string, change: MetricChange): MaterialSignal | null {
  if (change.previous === 0 && change.current !== null && change.current > 0) {
    return { key, label, value: 100, unit: "%", ratio: 1 };
  }
  return percentSignal(key, label, change);
}

function pointSignal(key: string, label: string, change: MetricChange, threshold = TRAFFIC_SHARE_CHANGE_POINTS): MaterialSignal | null {
  if (change.previous === null || change.absolute === null || Math.abs(change.absolute) < threshold) return null;
  return { key, label, value: change.absolute, unit: "pp", ratio: Math.abs(change.absolute) / threshold };
}

export function materialSignals(result: AnalysisResult): MaterialSignal[] {
  const signals = [
    percentSignal("effectivePrice", "折后价", result.changes.effectivePrice),
    percentSignal("reviews", "评论数", result.changes.reviews),
    percentSignal("monthlyUnits", "月销量估算", result.changes.monthlyUnits),
    percentSignal("monthlyRevenue", "月销售额估算", result.changes.monthlyRevenue),
    keywordCountSignal("naturalKeywords", "自然关键词", result.changes.naturalKeywords),
    keywordCountSignal("spKeywords", "SP 广告词", result.changes.spKeywords),
    keywordCountSignal("sbvKeywords", "SBV 广告词", result.changes.sbvKeywords),
    pointSignal("paidShare", "付费关联来源占比", result.changes.paidShare),
    pointSignal("adTrafficShare", "关键词广告贡献", result.changes.adTrafficShare),
    percentSignal("dealPrice", "Deal 价格", result.changes.dealPrice),
    percentSignal("bsr", "BSR", result.changes.bsr, 30),
  ].filter((signal): signal is MaterialSignal => signal !== null);

  const rating = result.changes.rating;
  if (rating.previous !== null && rating.absolute !== null && rating.absolute <= -0.2) {
    signals.push({ key: "rating", label: "评分", value: rating.absolute, unit: "", ratio: Math.abs(rating.absolute) / 0.2 });
  }
  if (result.promotionChanges.changed) {
    signals.push({ key: "promotion", label: "促销状态", value: result.promotionChanges.summaries.length, unit: "", ratio: 1 });
  }
  if (result.listingChanges.changed) {
    signals.push({ key: "listing", label: "Listing", value: result.listingChanges.summaries.length, unit: "", ratio: result.listingChanges.titleChanged ? 1.5 : 1 });
  }
  if (result.keywordPlacementChanges.some((item) => item.status === "lost" || item.status === "changed" && item.adRankDelta !== null && Math.abs(item.adRankDelta) >= 10)) {
    signals.push({ key: "keywordPlacement", label: "核心关键词位", value: 1, unit: "", ratio: 1 });
  }
  return signals.sort((a, b) => b.ratio - a.ratio);
}

export function materialSummary(result: AnalysisResult) {
  const signals = materialSignals(result);
  return { changed: signals.length > 0, score: signals[0]?.ratio ?? 0, top: signals[0] ?? null };
}

export function formatMaterialSignal(signal: MaterialSignal | null) {
  if (!signal) return "暂无显著波动";
  if (signal.key === "promotion" || signal.key === "listing" || signal.key === "keywordPlacement") return `${signal.label}发生变化`;
  const prefix = signal.value > 0 ? "+" : "";
  return `${signal.label} ${prefix}${signal.value.toFixed(1)}${signal.unit}`;
}
