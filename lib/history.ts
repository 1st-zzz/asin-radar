import type { AnalysisResult, HistoryPoint, ListingChange, ListingSnapshot, MetricChange, PromotionChange, PromotionSnapshot, Severity } from "./demo-data";

function emptyChange(current: number | null): MetricChange {
  return { current, previous: null, absolute: null, percent: null, direction: "new", favorable: null };
}

function baselineListingChange(): ListingChange {
  return {
    baseline: true,
    changed: false,
    titleChanged: false,
    bulletsChanged: false,
    attributesChanged: false,
    imagesAdded: [],
    imagesRemoved: [],
    imageOrderChanged: false,
    summaries: ["已建立 Listing 基线"],
  };
}

function baselinePromotionChange(): PromotionChange {
  return { baseline: true, changed: false, summaries: ["已建立促销基线"] };
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeList(values: string[] | undefined) {
  return (values ?? []).map(normalizeText).filter(Boolean);
}

function compareListing(current: ListingSnapshot, previous: ListingSnapshot | null): ListingChange {
  if (!previous) return baselineListingChange();
  const currentBullets = normalizeList(current.bullets);
  const previousBullets = normalizeList(previous.bullets);
  const currentImages = [...new Set(current.imageUrls.filter(Boolean))];
  const previousImages = [...new Set(previous.imageUrls.filter(Boolean))];
  const previousImageSet = new Set(previousImages);
  const currentImageSet = new Set(currentImages);
  const titleChanged = normalizeText(current.title) !== normalizeText(previous.title);
  const bulletsChanged = JSON.stringify(currentBullets) !== JSON.stringify(previousBullets);
  const attributesChanged = normalizeText(current.attributesText) !== normalizeText(previous.attributesText);
  const imagesAdded = currentImages.filter((url) => !previousImageSet.has(url));
  const imagesRemoved = previousImages.filter((url) => !currentImageSet.has(url));
  const sameImageSet = imagesAdded.length === 0 && imagesRemoved.length === 0;
  const imageOrderChanged = sameImageSet && JSON.stringify(currentImages) !== JSON.stringify(previousImages);
  const summaries = [
    ...(titleChanged ? ["标题已修改"] : []),
    ...(bulletsChanged ? ["五点文案已修改"] : []),
    ...(attributesChanged ? ["属性文案已修改"] : []),
    ...(imagesAdded.length ? [`新增 ${imagesAdded.length} 张图片`] : []),
    ...(imagesRemoved.length ? [`移除 ${imagesRemoved.length} 张图片`] : []),
    ...(imageOrderChanged ? ["图片顺序已调整"] : []),
  ];
  return {
    baseline: false,
    changed: summaries.length > 0,
    titleChanged,
    bulletsChanged,
    attributesChanged,
    imagesAdded,
    imagesRemoved,
    imageOrderChanged,
    summaries,
  };
}

function comparePromotion(current: PromotionSnapshot, previous: PromotionSnapshot | null): PromotionChange {
  if (!previous) return baselinePromotionChange();
  const summaries: string[] = [];
  if (typeof current.dealActive === "boolean" && typeof previous.dealActive === "boolean" && current.dealActive !== previous.dealActive) {
    summaries.push(current.dealActive ? "Amazon Deal 已开始" : "Amazon Deal 已结束");
  }
  if (current.dealType && previous.dealType && current.dealType !== previous.dealType) summaries.push(`Deal 类型由 ${previous.dealType} 改为 ${current.dealType}`);
  if (typeof current.couponActive === "boolean" && typeof previous.couponActive === "boolean" && current.couponActive !== previous.couponActive) {
    summaries.push(current.couponActive ? "Coupon 已开始" : "Coupon 已结束");
  }
  if (current.couponActive && previous.couponActive && current.couponType && previous.couponType && current.couponType !== previous.couponType) summaries.push("Coupon 类型已变化");
  if (current.couponActive && previous.couponActive && current.couponType === previous.couponType && current.couponValue !== null && previous.couponValue !== null && current.couponValue !== previous.couponValue) summaries.push("Coupon 优惠值已变化");
  return { baseline: false, changed: summaries.length > 0, summaries };
}

export function hydrateResult(input: Partial<AnalysisResult>): AnalysisResult {
  const metrics = input.metrics ?? ({} as AnalysisResult["metrics"]);
  const traffic = input.traffic ?? ({} as AnalysisResult["traffic"]);
  const effectivePrice = metrics.effectivePrice ?? metrics.price ?? null;
  const result = input as AnalysisResult;
  return {
    ...result,
    sourceVersion: input.sourceVersion ?? 1,
    salesVersion: input.salesVersion ?? 0,
    promotionVersion: input.promotionVersion ?? 0,
    listingVersion: input.listingVersion ?? 0,
    metrics: {
      ...metrics,
      price: effectivePrice,
      listPrice: metrics.listPrice ?? metrics.price ?? null,
      effectivePrice,
      coupon: metrics.coupon ?? null,
      priceNote: metrics.priceNote ?? "历史口径",
      monthlyUnits: metrics.monthlyUnits ?? null,
      monthlyUnitsGrowthPercent: metrics.monthlyUnitsGrowthPercent ?? null,
      monthlyRevenue: metrics.monthlyRevenue ?? null,
    },
    salesMeta: input.salesMeta ?? { source: "legacy", estimate: true, period: null },
    promotion: input.promotion ?? {
      couponActive: metrics.coupon ? true : null,
      couponType: null,
      couponValue: metrics.coupon ?? null,
      couponFinalPrice: null,
      primePrice: null,
      dealActive: null,
      dealType: null,
      dealPrice: null,
      dealStartAt: null,
      dealEndAt: null,
    },
    promotionChanges: input.promotionChanges ?? baselinePromotionChange(),
    promotionHistory: input.promotionHistory ?? [],
    listing: input.listing ?? {
      title: input.title ?? "",
      bullets: [],
      attributesText: null,
      imageUrls: [],
    },
    listingChanges: input.listingChanges ?? baselineListingChange(),
    history: [],
    changes: {
      effectivePrice: emptyChange(effectivePrice),
      rating: emptyChange(metrics.rating ?? null),
      bsr: emptyChange(metrics.bsr ?? null),
      naturalKeywords: emptyChange(traffic.naturalKeywords ?? null),
      freeShare: emptyChange(traffic.freeShare ?? null),
      monthlyUnits: emptyChange(metrics.monthlyUnits ?? null),
      monthlyUnitsGrowthPercent: emptyChange(metrics.monthlyUnitsGrowthPercent ?? null),
      monthlyRevenue: emptyChange(metrics.monthlyRevenue ?? null),
      dealPrice: emptyChange(input.promotion?.dealPrice ?? null),
    },
    comparisonCapturedAt: null,
  };
}

export function toHistoryPoint(result: AnalysisResult): HistoryPoint {
  return {
    capturedAt: result.capturedAt,
    effectivePrice: result.metrics.effectivePrice ?? result.metrics.price,
    listPrice: result.metrics.listPrice,
    rating: result.metrics.rating,
    bsr: result.metrics.bsr,
    naturalKeywords: result.traffic.naturalKeywords,
    adKeywords: result.traffic.adKeywords,
    freeShare: result.traffic.freeShare,
    paidShare: result.traffic.paidShare,
    monthlyUnits: result.metrics.monthlyUnits,
    monthlyUnitsGrowthPercent: result.metrics.monthlyUnitsGrowthPercent,
    monthlyRevenue: result.metrics.monthlyRevenue,
    dealPrice: result.promotion.dealPrice,
  };
}

function dailyPoints(results: AnalysisResult[]) {
  const sorted = [...results].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const byDay = new Map<string, HistoryPoint>();
  for (const result of sorted) byDay.set(result.capturedAt.slice(0, 10), toHistoryPoint(result));
  return [...byDay.values()].slice(-30);
}

function change(current: number | null, previous: number | null, favorableWhen: "up" | "down" | "neutral"): MetricChange {
  if (current === null || previous === null) return emptyChange(current);
  const absolute = Math.round((current - previous) * 100) / 100;
  const percent = previous === 0 ? null : Math.round((absolute / previous) * 10000) / 100;
  const direction = absolute > 0 ? "up" : absolute < 0 ? "down" : "flat";
  const favorable = direction === "flat" || favorableWhen === "neutral" ? null : direction === favorableWhen;
  return { current, previous, absolute, percent, direction, favorable };
}

function changeConclusion(changes: AnalysisResult["changes"]): Array<{ severity: Severity; title: string; body: string }> {
  const conclusions: Array<{ severity: Severity; title: string; body: string }> = [];
  const price = changes.effectivePrice;
  if (price.percent !== null && price.direction !== "flat") {
    conclusions.push({
      severity: Math.abs(price.percent) >= 10 ? "high" : "info",
      title: `折后价${price.direction === "up" ? "上涨" : "下降"} ${Math.abs(price.percent).toFixed(1)}%`,
      body: `由 ${price.previous} 变为 ${price.current}，已按同一详情与优惠券口径比较。`,
    });
  }

  const rating = changes.rating;
  if (rating.absolute !== null && rating.absolute < 0) {
    conclusions.push({
      severity: rating.absolute <= -0.2 ? "high" : rating.absolute <= -0.1 ? "medium" : "info",
      title: `评分下降 ${Math.abs(rating.absolute).toFixed(1)}`,
      body: `由 ${rating.previous?.toFixed(1)} 降至 ${rating.current?.toFixed(1)}，建议检查新增差评。`,
    });
  }

  const bsr = changes.bsr;
  if (bsr.percent !== null && bsr.direction !== "flat") {
    conclusions.push({
      severity: Math.abs(bsr.percent) >= 30 ? "high" : "info",
      title: `BSR ${bsr.direction === "down" ? "改善" : "走弱"} ${Math.abs(bsr.percent).toFixed(1)}%`,
      body: `由 ${bsr.previous} 变为 ${bsr.current}；BSR 数字越低越好。`,
    });
  }

  const natural = changes.naturalKeywords;
  if (natural.percent !== null && Math.abs(natural.percent) >= 25) {
    conclusions.push({
      severity: "medium",
      title: `自然关键词${natural.direction === "up" ? "扩张" : "收缩"} ${Math.abs(natural.percent).toFixed(1)}%`,
      body: `自然词数量由 ${natural.previous} 变为 ${natural.current}；词数变化不等同于流量规模变化。`,
    });
  }

  const freeShare = changes.freeShare;
  if (freeShare.absolute !== null && Math.abs(freeShare.absolute) >= 15) {
    conclusions.push({
      severity: "high",
      title: `免费流量占比${freeShare.direction === "up" ? "提升" : "下降"} ${Math.abs(freeShare.absolute).toFixed(1)} 个百分点`,
      body: `由 ${freeShare.previous?.toFixed(1)}% 变为 ${freeShare.current?.toFixed(1)}%。`,
    });
  }

  const monthlyUnits = changes.monthlyUnits;
  if (monthlyUnits.percent !== null && Math.abs(monthlyUnits.percent) >= 25) {
    conclusions.push({
      severity: "high",
      title: `月销量估算${monthlyUnits.direction === "up" ? "上升" : "下降"} ${Math.abs(monthlyUnits.percent).toFixed(1)}%`,
      body: `由 ${monthlyUnits.previous} 变为 ${monthlyUnits.current}；这是 SellerSprite 估算值，不是后台真实订单。`,
    });
  }

  const growth = changes.monthlyUnitsGrowthPercent;
  if (growth.absolute !== null && Math.abs(growth.absolute) >= 20) {
    const reversed = (growth.previous ?? 0) > 0 && (growth.current ?? 0) < 0 || (growth.previous ?? 0) < 0 && (growth.current ?? 0) > 0;
    conclusions.push({
      severity: reversed ? "high" : "medium",
      title: reversed ? "销量增长方向发生反转" : "销量增长率明显变化",
      body: `由 ${growth.previous?.toFixed(1)}% 变为 ${growth.current?.toFixed(1)}%，变化 ${Math.abs(growth.absolute).toFixed(1)} 个百分点。`,
    });
  }

  const dealPrice = changes.dealPrice;
  if (dealPrice.percent !== null && Math.abs(dealPrice.percent) >= 10) {
    conclusions.push({
      severity: "high",
      title: `Deal 价格${dealPrice.direction === "up" ? "上涨" : "下降"} ${Math.abs(dealPrice.percent).toFixed(1)}%`,
      body: `由 ${dealPrice.previous} 变为 ${dealPrice.current}，仅比较明确的 Deal 价格记录。`,
    });
  }
  return conclusions;
}

export function decorateWithHistory(currentInput: AnalysisResult, previousInputs: AnalysisResult[]) {
  const current = hydrateResult(currentInput);
  const hydratedPrevious = previousInputs.map(hydrateResult);
  const compatible = hydratedPrevious
    .filter((item) => item.sourceVersion === current.sourceVersion && item.capturedAt !== current.capturedAt);
  const history = dailyPoints([...compatible, current]);
  const prior = history.length > 1 ? history[history.length - 2] : null;
  const currentDay = current.capturedAt.slice(0, 10);
  const salesPrior = hydratedPrevious
    .filter((item) => item.salesVersion === current.salesVersion && item.salesVersion > 0 && item.salesMeta.source === current.salesMeta.source && item.salesMeta.estimate === current.salesMeta.estimate && item.capturedAt.slice(0, 10) !== currentDay)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0] ?? null;
  const promotionPrior = hydratedPrevious
    .filter((item) => item.promotionVersion === current.promotionVersion && item.promotionVersion > 0 && item.capturedAt.slice(0, 10) !== currentDay)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0] ?? null;
  const changes = {
    effectivePrice: change(current.metrics.effectivePrice, prior?.effectivePrice ?? null, "neutral"),
    rating: change(current.metrics.rating, prior?.rating ?? null, "up"),
    bsr: change(current.metrics.bsr, prior?.bsr ?? null, "down"),
    naturalKeywords: change(current.traffic.naturalKeywords, prior?.naturalKeywords ?? null, "up"),
    freeShare: change(current.traffic.freeShare, prior?.freeShare ?? null, "up"),
    monthlyUnits: change(current.metrics.monthlyUnits, salesPrior?.metrics.monthlyUnits ?? null, "up"),
    monthlyUnitsGrowthPercent: change(current.metrics.monthlyUnitsGrowthPercent, salesPrior?.metrics.monthlyUnitsGrowthPercent ?? null, "up"),
    monthlyRevenue: change(current.metrics.monthlyRevenue, salesPrior?.metrics.monthlyRevenue ?? null, "up"),
    dealPrice: change(current.promotion.dealPrice, promotionPrior?.promotion.dealPrice ?? null, "neutral"),
  };
  const deltaConclusions = prior
    ? changeConclusion(changes)
    : [{ severity: "info" as const, title: "已建立每日监控基线", body: "下一自然日再次抓取后，将显示销量、Deal/Coupon、折后价、评分、BSR 与核心流量变化。" }];
  const previousListing = previousInputs
    .map(hydrateResult)
    .filter((item) => item.listingVersion === current.listingVersion && item.listingVersion > 0 && item.capturedAt.slice(0, 10) !== currentDay)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0] ?? null;
  const listingChanges = compareListing(current.listing, previousListing?.listing ?? null);
  const listingConclusions = listingChanges.changed
    ? [{
        severity: listingChanges.titleChanged ? "high" as const : "medium" as const,
        title: `Listing 发生 ${listingChanges.summaries.length} 项变动`,
        body: listingChanges.summaries.join("；") + "。",
      }]
    : [];
  const promotionChanges = comparePromotion(current.promotion, promotionPrior?.promotion ?? null);
  const promotionConclusions = promotionChanges.changed
    ? [{
        severity: promotionChanges.summaries.some((item) => item.includes("Deal 已开始")) ? "high" as const : "medium" as const,
        title: `促销状态发生 ${promotionChanges.summaries.length} 项变化`,
        body: promotionChanges.summaries.join("；") + "。",
      }]
    : [];

  return {
    ...current,
    history,
    changes,
    promotionChanges,
    listingChanges,
    comparisonCapturedAt: prior?.capturedAt ?? null,
    conclusions: [...promotionConclusions, ...listingConclusions, ...deltaConclusions, ...current.conclusions],
  };
}

export function storedResult(result: AnalysisResult) {
  return { ...result, history: [], comparisonCapturedAt: null, conclusions: result.conclusions.filter((item) => item.title !== "已建立每日监控基线") };
}
