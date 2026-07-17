# ASIN Radar

Amazon 多站点竞品监控工具。支持每日留存折后价、评分、BSR、核心流量和 Listing 图片/文案变化。

## 在线使用

- GitHub 官网：<https://1st-zzz.github.io/asin-radar/>
- 监控应用：<https://asin-radar-20260716.zzz3rdtop.chatgpt.site>

无需登录。服务端为每个浏览器签发匿名 HttpOnly Cookie，数据库只保存匿名标识的哈希。清除 Cookie 或更换浏览器后，无法恢复原匿名空间。

## 数据与安全

- 卖家精灵 MCP 地址及凭据只通过服务端环境变量注入。
- 监控快照按匿名空间、站点和 ASIN 隔离。
- 公共访问限额：每个匿名空间每天同步 20 个 ASIN、查询 30 次平台历史。
- GitHub Pages 仅承载静态官网；MCP、D1 和监控 API 运行在 Cloudflare 服务端。

## 本地运行

```bash
pnpm install
pnpm exec vinext dev
```

生产环境需要配置 `SELLERSPRITE_MCP_URL` 和 `SELLERSPRITE_MCP_HEADERS_JSON`。
