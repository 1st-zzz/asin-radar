# ASIN Radar

Amazon 多站点竞品监控工具。支持每日自动留存折后价、销量估算、评分与评论数、BSR、促销、关联来源结构、核心关键词广告位和 Listing 图片/文案变化。

## 在线使用

- GitHub 直达入口：<https://1st-zzz.github.io/asin-radar/>
- 监控应用：<https://asin-radar-20260716.zzz3rdtop.chatgpt.site>

无需登录。服务端为每个浏览器签发匿名 HttpOnly Cookie，数据库只保存匿名标识的哈希。清除 Cookie 或更换浏览器后，无法恢复原匿名空间。

## 数据与安全

- 卖家精灵 MCP 地址及凭据只通过服务端环境变量注入。
- 监控快照按匿名空间、站点和 ASIN 隔离。
- 新加入的监控对象默认开启每日 09:00（北京时间）自动同步，可在列表中逐个暂停。
- 价格、评论数、销量和关键词规模默认以 15% 作为显著波动阈值；流量结构按 15 个百分点判断。
- 公共访问限额：每个匿名空间每天同步 20 个 ASIN、查询 30 次平台历史。
- GitHub Pages 全屏承载应用入口；MCP、D1 和监控 API 运行在 Cloudflare 服务端。

## 本地运行

```bash
pnpm install
pnpm exec vinext dev
```

生产环境需要配置 `SELLERSPRITE_MCP_URL` 和 `SELLERSPRITE_MCP_HEADERS_JSON`。`AUTO_SYNC_MAX_TARGETS` 可限制单次定时任务处理的监控对象数量，默认 40。
