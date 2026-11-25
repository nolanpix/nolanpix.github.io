# counter_plan.md — visit counter, status bar, anti-scraping

Scope: give nolanpix.github.io per-page view counts + daily-visitor counts, shown
in a small status badge beside every page, plus soft anti-scraping. Free, no
custom domain.

Files:
- `worker/counter.js`      Cloudflare Worker (KV-backed) — the counting backend.
- `worker/wrangler.toml`   deploy config (KV binding `COUNTER`).
- `worker/README.md`       two deploy paths (dashboard / wrangler CLI) + tests.
- `assets/stats.js`        client badge; injected on every page via one <script>.
- `.statbar` CSS in `assets/style.css`.
- `robots.txt`, `sitemap.xml`  soft anti-scraping + SEO.

## 1. Design decisions

- **Backend = Cloudflare Worker + KV** (user choice). Free tier: 100k req/day,
  KV 100k reads/day, **1,000 writes/day, 1 write/sec per key**. The write cap is
  the real constraint and shaped everything below.
- **No custom domain**: endpoint is `*.workers.dev`. The client is wired by
  editing one constant (`STATS_ENDPOINT` in `assets/stats.js`) OR a
  `<meta name="np-stats-endpoint">` / `window.NP_STATS_ENDPOINT` override.
- **Badge hidden until deployed**: with no endpoint configured, or on any fetch
  error, the badge renders nothing. No fake zeros, no console errors. This is the
  committed default state — it lights up only after the owner deploys the Worker.
- **Metrics shown**: `views` = this page's total PV; `today` = site-wide unique
  visitors today (DAU). Site-wide `total` is also stored and returned for future
  use (not shown yet).

## 2. Staying under the KV write budget (key design)

- **Per-path PV keys** (`pv:<path>`) spread writes across keys, dodging the
  1-write/sec-per-key limit.
- **DAU writes only on a visitor's FIRST hit of the day.** Visitor id =
  `SHA-256(ip + UA + date + salt)` — cookieless, not stored raw, not reversible
  to an IP. A `seen:<date>:<vid>` marker (TTL 36h) gates the daily increment.
- **Client write-throttle**: a page is counted at most once per 30 min per
  browser (localStorage timestamp); repeat views in that window call read-only
  `/stats`. Kills refresh-spam inflation and saves writes.

## 3. Anti-abuse / anti-scraping (soft, per user choice)

- **Origin guard**: `/hit` only counts when `Origin: https://nolanpix.github.io`.
  Other origins get 403 — curl/bots can't run up the counter from off-site.
- **Per-IP sliding window**: >40 counted hits / 10s from one IP -> `throttled`,
  numbers returned but counters NOT advanced (protects the write budget).
- **Path validation**: safe charset only, length <=128, reject `..` — no key
  flooding with junk paths.
- **robots.txt**: welcomes search engines, sets `Crawl-delay`, and `Disallow: /`
  for ~17 known bulk/AI-training crawlers (GPTBot, CCBot, ClaudeBot, Bytespider,
  Amazonbot, Ahrefs/Semrush, etc.). These honor robots.txt; malicious bots ignore
  it, which is why the Worker-side rate-limit exists.

## 4. KV has no atomic increment

Under heavy concurrency a few counts can be lost (read-modify-write race).
Negligible at personal-blog scale. Upgrade path if the site ever grows:
port the same endpoints to Durable Objects (atomic) or D1 — client unchanged.

## 5. Verification (evidence)

- `node --check` on `counter.js` and `stats.js` — pass.
- `python3 -m py_compile tools/gen_notes.py` — pass; 3 notes regenerated, each
  carries `../assets/stats.js`; `index.html` carries `assets/stats.js`.
- Node in-memory-KV harness, 15 assertions ALL PASS: first-hit pv/dau,
  same-visitor refresh dedup, per-page PV isolation, new-visitor DAU,
  Origin 403, path-traversal 400, read-only /stats, rate-limit throttle +
  frozen counter. The harness first caught a real bug: the path charset allowed
  `.` so `/../x` was accepted and counted — fixed by rejecting `..`.

## Q&A / notes

- Q: why not show a number before deploy? A: there is no backend yet; showing
  anything would be fake. Hidden-until-real is the honest default.
- Q: is the Worker source public (it's in the repo)? A: yes, served at
  `/worker/counter.js`. No secrets in it; `SALT` is explicitly not a secret
  (rotating it just resets visitor ids). Fine to be open.
- Open item (needs the owner): deploy the Worker on the owner's Cloudflare
  account, then paste the `*.workers.dev` URL into `assets/stats.js`
  `STATS_ENDPOINT` and commit. Only then does the badge light up.
  (Done 2026-11-25 by the owner: commit `1246b07`, endpoint
  `https://nolanpix-counter.song66666.workers.dev/`. See §6.)

## 6. 改进策略（线上 `POST /hit` 一律 1101 的修复）

**现象（2026-11-25 22:00 实测）**：Worker 已部署，`GET /` 和 `GET /stats` 都返回 200，
CORS 预检返回 204；但带站点 Origin 的 `POST /hit` 一律 HTTP 500，响应体是
`error code: 1101`，且不带 CORS 头。Chrome 里这次请求 status=0（CORS 失败），徽标保持隐藏；
30 分钟内再次打开页面只走 `/stats`，显示 `0 views / 0 today`。KV 里没有任何计数。

**根因**：`isRateLimited` 用 `expirationTtl: RL_WINDOW_S * 2`（20 秒）写限流键，而 Workers KV
要求 TTL 至少 60 秒。每次 hit 都先经过限流写入，所以全部在第一次写入时就抛错，后面的计数写入
一次也没执行。用 Miniflare（workerd + KV 模拟器）复现，报错原文：
`KV PUT failed: 400 Invalid expiration_ttl of 20. Expiration TTL must be at least 60.`

**§5 的测试为什么没发现**：手写的 Node 内存 KV mock 不校验 TTL 下限。以后 Worker 的测试一律在
Miniflare 里跑。

**修复**：
1. `worker/counter.js`：限流键 TTL 改为 `Math.max(60, RL_WINDOW_S * 2)`。
2. `worker/counter.js`：整个 `fetch` 包一层 try/catch。未捕获的异常会变成不带 CORS 头的 1101
   页面，浏览器只能看到含糊的 CORS 错误；现在改为返回带 CORS 头的 JSON `{"ok":false,"error":"internal"}`
   （HTTP 500），异常写进 `console.error`，可以在 Cloudflare 的日志里查看。
3. `assets/stats.js`：原来在请求发出前就记下 localStorage 的“本页已计数”，请求失败也照样记，
   导致之后 30 分钟不再计数。改为 Worker 返回 `ok:true` 之后才记。

**验证**：Miniflare 里 11/11 通过（计数、同访客去重、新访客、按页隔离、外站 Origin 403、
`..` 路径 400、`/stats`、同一窗口 40 次全部计数、第 41 次 throttled 且计数不变）；负面测试：
把 TTL 改回 20，handler 返回 HTTP 500、带 CORS 头、JSON `ok:false`（3/3）。

**Q&A / 备注**
- Q：仓库推送后线上就修好了吗？A：没有。Worker 运行在站长自己的 Cloudflare 账号里，本机没有
  wrangler 凭据。站长要在面板里把新的 `worker/counter.js` 粘贴进去重新 Deploy，修复才生效。
- 剩余风险（未实测）：KV 同一个键每秒最多写 1 次。同一秒内两次写同一个键（例如两个访客同时打开首页）
  时，第二次 put 会被拒绝；现在这种情况返回 JSON 500，这一次不计数，徽标隐藏。按博客的访问量很少会碰到。
- 写入额度：一次计数大约 2 次 KV 写入（限流键 + 页面计数），访客当天首次访问另加 3 次。免费额度
  1,000 次写入/天，大约够 300–400 次浏览/天。流量涨上来以后改用 Durable Objects 或 D1（§4）。
