export type UserErrorTone = "info" | "success" | "warning" | "danger";

export type UserErrorExplanation = {
  tone: UserErrorTone;
  title: string;
  detail: string;
  text: string;
};

function rawMessage(input: unknown, fallback: string) {
  const value = input instanceof Error ? input.message : String(input ?? "");
  return value.trim() || fallback;
}

export function explainUserError(input: unknown, fallback = "请求失败"): UserErrorExplanation {
  const raw = rawMessage(input, fallback);
  const lower = raw.toLowerCase();

  if (raw.includes("无可用次数") || lower.includes("no remaining") || lower.includes("secret_no_remaining")) {
    return {
      tone: "danger",
      title: "卖家精灵 MCP 次数已用完",
      detail: "当前不是网站登录问题，而是数据源调用额度不足。恢复次数后通常不需要重新发布页面。",
      text: "卖家精灵 MCP 次数已用完：请在卖家精灵用量页确认次数或等待额度恢复。",
    };
  }

  if (raw.includes("SELLERSPRITE_MCP_URL") || raw.includes("SELLERSPRITE_MCP_HEADERS_JSON") || raw.includes("环境变量") || raw.includes("尚未连接")) {
    return {
      tone: "danger",
      title: "卖家精灵 MCP 未连接",
      detail: "服务端还没有可用的数据源配置。MCP 地址和请求头只能放在服务端环境变量里，不能放到 GitHub Pages 前端。",
      text: "卖家精灵 MCP 未连接：请检查服务端环境变量配置。",
    };
  }

  if (raw.includes("未授权") || raw.includes("权限") || lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("401") || lower.includes("403")) {
    return {
      tone: "danger",
      title: "卖家精灵 MCP 授权不可用",
      detail: "数据服务可见，但当前账号、密钥或套餐权限无法调用对应接口。",
      text: "卖家精灵 MCP 授权不可用：请检查账号权限、密钥或套餐权限。",
    };
  }

  if (raw.includes("每天最多") || raw.includes("次数上限") || lower.includes("quota") || lower.includes("rate limit")) {
    return {
      tone: "warning",
      title: "当前匿名空间达到调用上限",
      detail: "这是为了保护公共页面和数据源额度。明天会自动恢复，也可以减少单次同步 ASIN 数量。",
      text: raw,
    };
  }

  if ((raw.includes("ASIN") || lower.includes("asin")) && (raw.includes("无数据") || raw.includes("不存在") || raw.includes("未找到") || lower.includes("not found") || lower.includes("no data"))) {
    return {
      tone: "warning",
      title: "这个 ASIN 暂无可用数据",
      detail: "连接本身可用，但数据源没有返回该站点和 ASIN 的有效记录。",
      text: "这个 ASIN 暂无可用数据：请确认站点和 ASIN 是否匹配。",
    };
  }

  if (raw.includes("超时") || lower.includes("timeout") || lower.includes("temporarily")) {
    return {
      tone: "warning",
      title: "数据服务暂时不可用",
      detail: "通常是上游接口波动或本次请求超时。稍后重试即可，不代表竞品没有变化。",
      text: "数据服务暂时不可用：请稍后重试。",
    };
  }

  if (raw.includes("历史库") || raw.includes("D1") || raw.includes("不可写")) {
    return {
      tone: "warning",
      title: "历史留存暂时不可写",
      detail: "本次分析可能已经完成，但趋势数据没有可靠保存，次日对比会受影响。",
      text: "历史留存暂时不可写：本次数据可能无法参与后续趋势对比。",
    };
  }

  if ((raw.startsWith("已") || raw.includes("同步完成") || raw.includes("载入")) && !raw.includes("失败") && !raw.includes("不可用")) {
    return {
      tone: "success",
      title: "已完成",
      detail: raw,
      text: raw,
    };
  }

  if (raw.includes("失败") || raw.includes("不可用") || lower.includes("error")) {
    return {
      tone: "warning",
      title: "请求未完成",
      detail: raw,
      text: raw,
    };
  }

  return {
    tone: "info",
    title: "提示",
    detail: raw,
    text: raw,
  };
}

export function friendlyError(input: unknown, fallback = "请求失败") {
  return explainUserError(input, fallback).text;
}

export function userErrorTone(input: unknown): UserErrorTone {
  return explainUserError(input, "").tone;
}
