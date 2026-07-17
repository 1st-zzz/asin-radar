export type Severity = "high" | "medium" | "info";

export type MetricChange = {
  current: number | null;
  previous: number | null;
  absolute: number | null;
  percent: number | null;
  direction: "up" | "down" | "flat" | "new";
  favorable: boolean | null;
};

export type HistoryPoint = {
  capturedAt: string;
  effectivePrice: number | null;
  listPrice: number | null;
  rating: number | null;
  bsr: number | null;
  naturalKeywords: number | null;
  adKeywords: number | null;
  freeShare: number | null;
  paidShare: number | null;
  monthlyUnits: number | null;
  monthlyUnitsGrowthPercent: number | null;
  monthlyRevenue: number | null;
  dealPrice: number | null;
};

export type PromotionSnapshot = {
  couponActive: boolean | null;
  couponType: "amount" | "percent" | "text" | null;
  couponValue: number | string | null;
  couponFinalPrice: number | null;
  primePrice: number | null;
  dealActive: boolean | null;
  dealType: string | null;
  dealPrice: number | null;
  dealStartAt: string | null;
  dealEndAt: string | null;
};

export type PromotionChange = {
  baseline: boolean;
  changed: boolean;
  summaries: string[];
};

export type ListingSnapshot = {
  title: string;
  bullets: string[];
  attributesText: string | null;
  imageUrls: string[];
};

export type ListingChange = {
  baseline: boolean;
  changed: boolean;
  titleChanged: boolean;
  bulletsChanged: boolean;
  attributesChanged: boolean;
  imagesAdded: string[];
  imagesRemoved: string[];
  imageOrderChanged: boolean;
  summaries: string[];
};

export type AnalysisResult = {
  sourceVersion: number;
  salesVersion: number;
  promotionVersion: number;
  listingVersion: number;
  marketplace: string;
  asin: string;
  capturedAt: string;
  title: string;
  brand: string;
  amazonUrl: string;
  currency: string;
  healthScore: number;
  metrics: {
    price: number | null;
    listPrice: number | null;
    effectivePrice: number | null;
    coupon: string | null;
    priceNote: string;
    bsr: number | null;
    rating: number | null;
    reviews: number | null;
    monthlyUnits: number | null;
    monthlyUnitsGrowthPercent: number | null;
    monthlyRevenue: number | null;
  };
  salesMeta: {
    source: string;
    estimate: boolean;
    period: string | null;
  };
  promotion: PromotionSnapshot;
  promotionChanges: PromotionChange;
  traffic: {
    naturalKeywords: number | null;
    adKeywords: number | null;
    freeShare: number | null;
    paidShare: number | null;
    interpretation: string;
  };
  conclusions: Array<{ severity: Severity; title: string; body: string }>;
  competitors: Array<{
    asin: string;
    brand: string;
    price: number | null;
    rating: number | null;
    monthlyUnits: number | null;
    reason: string;
  }>;
  actions: string[];
  dataNotes: string[];
  listing: ListingSnapshot;
  listingChanges: ListingChange;
  history: HistoryPoint[];
  changes: {
    effectivePrice: MetricChange;
    rating: MetricChange;
    bsr: MetricChange;
    naturalKeywords: MetricChange;
    freeShare: MetricChange;
    monthlyUnits: MetricChange;
    monthlyUnitsGrowthPercent: MetricChange;
    monthlyRevenue: MetricChange;
    dealPrice: MetricChange;
  };
  comparisonCapturedAt: string | null;
};

export type MonitorResponse = { results: AnalysisResult[]; persisted: boolean };

export type PlatformHistoryPoint = {
  capturedAt: string;
  marketPrice: number | null;
  listPrice: number | null;
  buyBoxPrice: number | null;
  dealPrice: number | null;
  bsr: number | null;
  rating: number | null;
  reviews: number | null;
};

export type PlatformHistoryResult = {
  marketplace: string;
  asin: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  amazonUrl: string;
  currency: string;
  rangeDays: number;
  points: PlatformHistoryPoint[];
  source: "SellerSprite Keepa";
  sourceNote: string;
};

export type HistoryQueryResponse = {
  platform: PlatformHistoryResult;
  retained: AnalysisResult | null;
};

export const demoResult: AnalysisResult = {
  sourceVersion: 2,
  salesVersion: 1,
  promotionVersion: 1,
  listingVersion: 1,
  marketplace: "DE",
  asin: "B0DPDKLHYM",
  capturedAt: "2026-07-16T22:31:59+08:00",
  title: "Titan Schneidebrett Set 3 Stück – S316 Edelstahl",
  brand: "Bafeil",
  amazonUrl: "https://www.amazon.de/dp/B0DPDKLHYM",
  currency: "EUR",
  healthScore: 78,
  metrics: {
    price: 26.99,
    listPrice: 26.99,
    effectivePrice: 26.99,
    coupon: null,
    priceNote: "当前无优惠券",
    bsr: 229700,
    rating: 4.0,
    reviews: 347,
    monthlyUnits: 682,
    monthlyUnitsGrowthPercent: 18.4,
    monthlyRevenue: 15467.76,
  },
  salesMeta: {
    source: "competitor_lookup",
    estimate: true,
    period: null,
  },
  promotion: {
    couponActive: false,
    couponType: null,
    couponValue: null,
    couponFinalPrice: null,
    primePrice: null,
    dealActive: false,
    dealType: null,
    dealPrice: null,
    dealStartAt: null,
    dealEndAt: null,
  },
  promotionChanges: {
    baseline: true,
    changed: false,
    summaries: ["已建立促销基线"],
  },
  traffic: {
    naturalKeywords: 130,
    adKeywords: 4,
    freeShare: 93.05,
    paidShare: 6.95,
    interpretation: "自然覆盖强、广告依赖低。当前更应守住自然词和评分，而不是盲目增加广告词。",
  },
  conclusions: [
    { severity: "info", title: "自然流量结构领先", body: "免费关联占 93.05%，广告关键词仅 4 个，当前不是广告堆量型。" },
    { severity: "medium", title: "评分是最明确的短板", body: "评分 4.0 低于直接竞品中位数 4.2，可能限制转化和价格上限。" },
    { severity: "medium", title: "低价竞品正在施压", body: "Fegat 的 3 件套定价 €19.49，应监控其销量和付费流量扩张，但不建议未经利润测算直接跟价。" },
    { severity: "high", title: "价格与 BSR 存在接口口径冲突", body: "后续变化必须使用同一路径复查，避免把数据源差异误判为真实波动。" },
  ],
  competitors: [
    { asin: "B0GZ7GFCHJ", brand: "Fegat", price: 19.49, rating: 3.8, monthlyUnits: 288, reason: "低价压力" },
    { asin: "B0FJFP2VVK", brand: "BOYUNSHI", price: 29.99, rating: 4.2, monthlyUnits: 113, reason: "广告扩张" },
    { asin: "B0GVDLZGDM", brand: "Saliva", price: 58.59, rating: 4.5, monthlyUnits: 114, reason: "高价策略" },
    { asin: "B0DXKWBHN2", brand: "vapourd", price: 29.99, rating: 3.9, monthlyUnits: 122, reason: "同款对标" },
  ],
  actions: [
    "分析近期 1–3 星评论，找出评分无法突破 4.2 的具体原因。",
    "保持自然词优势，不因低价竞品出现就直接增加广告或降价。",
    "7 天后按同一接口复查价格、BSR、销量与重点竞品。",
  ],
  dataNotes: [
    "卖家精灵详情、批量对比和 Keepa 路径对当前价格及 BSR 的返回存在差异。",
    "月销量和销售额为卖家精灵估算值，不是 Amazon 后台实际订单。",
  ],
  listing: {
    title: "Titan Schneidebrett Set 3 Stück – S316 Edelstahl",
    bullets: ["Doppelseitiges Schneidebrett", "S316 Edelstahl und Titanbeschichtung"],
    attributesText: "Material: Edelstahl; Anzahl: 3",
    imageUrls: [],
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
    effectivePrice: { current: 26.99, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
    rating: { current: 4, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
    bsr: { current: 229700, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
    naturalKeywords: { current: 130, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
    freeShare: { current: 93.05, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
    monthlyUnits: { current: 682, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
    monthlyUnitsGrowthPercent: { current: 18.4, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
    monthlyRevenue: { current: 15467.76, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
    dealPrice: { current: null, previous: null, absolute: null, percent: null, direction: "new", favorable: null },
  },
  comparisonCapturedAt: null,
};
