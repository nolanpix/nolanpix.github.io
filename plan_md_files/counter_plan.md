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
- 2026-11-25 23:05 复验：用户按 eaa7b3b 重新部署后，线上 `/` pv=2、两篇笔记各 pv=1、dau=2；
  无 Origin / 外站 Origin 返回 403，`/../x` 返回 400 且带 CORS 头；Chrome 首页徽标显示
  `2 views / 2 today`。§6 的修复已在线上生效。

## 7. 改进策略（专属后台：详细数据页，GitHub 本人 + 密码双重验证）

状态：站长已批准。§7 保留设计时的讨论；已实现的行为、验收证据和生产配置边界见 §8。

### 7.1 需求（2026-11-25 用户原话归纳）

- 保留现有的公开简单数据徽标。
- 新增一个详细数据页面，只有站长本人能看：必须同时满足两条：(1) 用 GitHub 登录，且账号是
  nolanpix 本人；(2) 输入后台密码。
- 页面风格与主页一致。

### 7.2 约束与已核实的事实

- GitHub Pages 只托管静态文件，仓库里的文件全部公开。所以要保护的是数据接口，不是 HTML。
- 用户部署 Worker 的方式是在 Cloudflare 面板里粘贴 counter.js，所以 Worker 保持单文件、零依赖。
- nolanpix 的 GitHub 数字 ID 是 361057995（`gh api users/nolanpix`）。判断身份用数字 ID，
  不用用户名：用户名可以改，改掉以后旧名字可能被别人注册。
- Cloudflare 免费额度（官方文档，2026-11-25 抓取）：KV 写入 1,000 次/天；D1 写入 100,000 行/天、
  读取 5,000,000 行/天、单库最大 500 MB；Worker 每次请求 CPU 10 ms、每天 100,000 次请求。
- Miniflare（workerd）实测：WITHOUT ROWID 表每次 upsert 只计 1 行写入，普通表用 TEXT 主键时首次
  插入计 2 行（表和主键索引各一行）；同一个 batch 里用 `changes()` 判断"当日首访"结果正确；PBKDF2-SHA256 迭代
  100,000 次约 7 ms。
- GitHub OAuth App 支持 PKCE（`code_challenge` + S256，文档标为 Strongly recommended）。scope 留空时
  token 只能读公开资料，够用来核对身份；`prompt=select_account` 会强制弹出账号选择。

### 7.3 现有实现的问题（这次改造一并解决）

1. `total` 统计错了：counter.js:109-114 只在访客当天首访时加 1，所以它是"累计日访客数"，
   不是总浏览量。线上 total=2，而四个页面 pv 之和是 4。公开徽标没有用到它（stats.js:73-74）。
2. 限流会耗光写入额度：counter.js:76 每个请求都写一次 KV，被限流的请求也写。按 1,000 次/天
   的写入额度算，1,000 个刷量请求就能让当天所有计数失败。
3. 限流键里存了原始 IP：counter.js:73-76 写入 `rl:<ip>:<bucket>`，与文件头 counter.js:9 的
   "never stores a raw IP" 不符，虽然 60 秒后过期。
4. 访客 ID 能反推 IP：counter.js:23 的 SALT 写在公开源码里，访客 ID = sha256(ip|ua|日期|SALT)，
   拿到访客 ID 的人（包括站长自己）可以对整个 IPv4 空间暴力反推出 IP。现在 `seen:` 键 36 小时过期，影响不大；详细页要长期保存明细，
   必须先改掉。
5. KV 每次浏览要写 2–5 次，免费额度约 300–400 次浏览/天，存不了逐条明细。

### 7.4 方案比较

- A（推荐）：后台页面由 Worker 自己提供，地址
  `https://nolanpix-counter.song66666.workers.dev/admin`。登录态用 Worker 同源的 HttpOnly cookie；
  可以设置完整的安全响应头（CSP、禁止嵌入、no-store）；后台脚本写在 Worker 里，有人改了 GitHub
  仓库也碰不到后台逻辑。样式直接引用主站 `assets/style.css` 和新增的 `assets/admin.css`。
  缺点：地址不在 nolanpix.github.io 下。
- B：页面放在 `nolanpix.github.io/admin/`，Worker 只提供 API。github.io 和 workers.dev 是两个站点，
  Safari/Firefox 会拦第三方 cookie，token 只能放在 sessionStorage 里让 JS 读；GitHub Pages 不能设
  响应头；任何能推送仓库的人（包括这台机器上已登录 nolanpix 的 gh）都能改 admin.js 来偷 token。
- C：Cloudflare Access（Zero Trust）挡在前面，用 GitHub 登录，Worker 只校验 Access JWT 再查密码。
  OAuth 代码少写一些，但开通 Zero Trust 通常要绑付款方式，"只允许 nolanpix 本人"也只能靠邮箱
  规则间接实现。不采用。

### 7.5 选定架构（A）

```
公开:  页面 stats.js --POST /hit, GET /stats--> Worker --> D1
后台:  GET /admin --> /admin/login --302--> github.com 授权
       <-- /admin/callback: 换 token, GET api.github.com/user, id 必须为 361057995
       --> POST /admin/password: PBKDF2 校验 --> 发 12 小时会话 cookie
       --> GET /admin/api/report: 必须是完整会话 --> D1 聚合
```

- 存储从 KV 换到 D1：公开计数和明细都写 D1。首次运行自动建表，并把 KV 里现有的每页浏览量（`pv:*`）
  和每日访客数（`dau:*`，目前共 4 次浏览）导入一次，用 meta 表标记，只导入一次。确认无误后可以删掉 KV 绑定。
- 公开接口保持兼容：`/hit`、`/stats` 仍返回 `ok, path, pv, dau`；`/stats` 去掉统计错误的 `total`
  （只有自家 stats.js 调用，而且没用到）。stats.js 只多传一个 `ref`（`document.referrer`），
  Worker 只保留域名。

### 7.6 数据模型（D1，全部 WITHOUT ROWID）

| 表 | 内容 | 每次浏览写入 |
|---|---|---|
| hits | 逐条明细：时间、页面、来源域名（站内跳转单独标记）、国家、设备/浏览器/系统、当日匿名访客 ID、是否当日首访 | 1 行 |
| page_totals | 每页累计浏览（给公开徽标用） | 1 行 |
| day_totals | 每个 UTC 日的浏览数、访客数 | 1 行 |
| seen | 当天出现过的访客 ID，用来判定首访 | 首访时 1 行 |
| salts | 每天一个随机盐，48 小时后删除 | 每天 1 行 |
| sessions、auth_fail、meta | 后台会话、密码失败计数、迁移标记 | 只在登录时写 |

- 每次浏览约写 3–4 行，免费额度可支撑约 2.5 万次浏览/天。
- 不存 IP，也不存城市。访客 ID = sha256(当日随机盐|IP|UA) 截断成 16 位十六进制。盐只放在 D1 里，
  48 小时后连同 seen 一起删除，之后连站长也无法把 ID 还原成 IP（参考 Plausible 的做法）。
  ID 每天换一次，所以跨天认不出同一个人：多日窗口的 UV 是每日访客数之和。
- 明细默认保留 365 天（见 7.13 Q3）；每日汇总和每页累计永久保留。清理在每天轮换盐时顺带执行。
- 限流改为 Worker 内存里按 IP 哈希计数，不写存储，解决 7.3 的第 2、3 条。
  内存计数只在单个 Worker 实例里有效，只能挡住单个来源的快速刷新。最坏情况：分布式刷量
  耗尽当天的 D1 写入额度，计数暂停到 UTC 零点，主站本身不受影响。
- 设备、浏览器、系统用 UA 正则粗分：desktop / mobile / tablet / bot，浏览器和系统只记大类。

### 7.7 登录与会话

1. `GET /admin`：没有会话时显示登录页，只有"用 GitHub 登录"按钮，不含任何数据。
2. `GET /admin/login`：生成 state 和 PKCE verifier，写进 10 分钟有效的 `__Host-` HttpOnly cookie，
   302 跳到 GitHub（scope 留空，`allow_signup=false`，`prompt=select_account`）。
3. `GET /admin/callback`：先比对 state，不一致直接返回 400，不发任何外部请求；然后用 client secret
   和 verifier 换 token，调用 `GET https://api.github.com/user`，数字 id 不是 361057995 就返回 403。
   token 用完即丢，不保存。通过后只发"半会话"：5 分钟有效，只能用来提交密码。
4. `POST /admin/password`：校验 Origin；用 PBKDF2-SHA256 核对密码。哈希放在 Worker secret
   `ADMIN_PASSWORD_HASH` 里，格式为 `pbkdf2-sha256$100000$<盐>$<哈希>`，迭代次数写在哈希串里，
   以后调整不用改代码。连续错 5 次锁定 15 分钟。只有通过 GitHub 验证的人才能看到密码框，外人
   没有机会试密码。通过后升级成完整会话，有效期 12 小时。
5. 会话 cookie：`__Host-np_admin`，Secure、HttpOnly、SameSite=Lax、Path=/。D1 里只存 token 的
   SHA-256。`POST /admin/logout` 删除会话。
6. `/admin` 下所有响应都带：CSP（脚本只允许本站，样式只允许 nolanpix.github.io 和 Google Fonts，
   connect 只允许本站，frame-ancestors none）、`Cache-Control: no-store`、
   `Referrer-Policy: no-referrer`、`X-Robots-Tag: noindex`。
7. 数据接口只认完整会话：没有会话、会话过期或只有半会话，一律返回 401。
8. 密码哈希由站长在自己电脑上用一行 Python（标准库 hashlib + getpass）生成，命令写进
   worker/README.md。密码不经过任何其他人。

### 7.8 页面设计（沿用主页的视觉语言）

- 复用 style.css 的配色变量、字体（Space Grotesk + 等宽字体）、顶栏和 die/block 样式；新增
  `assets/admin.css`，类名统一加 `adm-` 前缀。
- 主题延续"流片终端"：后台就是一份流量的 signoff report。

```
np. admin                                         @nolanpix   logout
REPORT: traffic   window 30d   tz UTC+08:00            <- 等宽 eyebrow
Traffic report                             [7d] [30d] [90d] [365d]
[PV 1.2k +12%]  [UV 430]  [PV/UV 2.8]  [TODAY 41 / 17]  <- 4 个 block
+- waveform.vcd ----------------------------------+    <- 每日浏览阶梯波形，
+--------------------------------------------------+       访客为第二条淡色线
+- congestion.map  weekday x hour -----------------+    <- 热力图，按拥塞图配色
Top paths | Entry pages | Referrers | Countries | Device / Browser / OS
event.log  23:01:12  /notes/x.html  <- x.com  US  mobile Safari iOS  new
```

- 登录页：同样的顶栏，加一个边框带斜线填充的 block（版图里的 placement blockage，表示禁区），
  里面只有登录按钮或密码框。
- 图表全部手写 SVG，不引第三方库（CSP 也不允许）。深色/浅色、手机宽度、键盘焦点、减少动效
  都按主站的做法处理。
- 时区：页面把浏览器时区偏移传给接口，按站长本地时间分日、分小时。

### 7.9 站长需要做的一次性配置

1. GitHub：Settings -> Developer settings -> OAuth Apps -> New OAuth App。Homepage 填
   `https://nolanpix.github.io`，Callback 填
   `https://nolanpix-counter.song66666.workers.dev/admin/callback`。
2. Cloudflare：D1 -> 新建数据库 `nolanpix-stats`；Worker -> Settings -> Bindings -> 添加 D1 绑定，
   变量名填 `DB`。
3. Worker -> Settings -> Variables and Secrets：`GITHUB_CLIENT_ID`（文本）、
   `GITHUB_CLIENT_SECRET`（Secret）、`ADMIN_PASSWORD_HASH`（Secret）。
4. 粘贴新的 counter.js，点 Deploy。admin.css 和 stats.js 随 git push 上线。

### 7.10 实施步骤

1. counter.js：D1 存储层、KV 一次性导入、内存限流、UA 和来源解析。
2. counter.js：`/admin` 路由、OAuth、密码、会话、安全响应头、报表接口、后台页面 HTML 和脚本。
3. 新增 assets/admin.css；stats.js 传 `ref`。
4. 更新 worker/README.md 和 wrangler.toml 的部署说明。
5. 按 7.11 测试并截图，结果续写到本文件 §8。
6. 提交并推送；站长按 7.9 配置、部署后做线上复验。

### 7.11 测试计划

- 环境：Miniflare（D1 + KV 模拟器），GitHub 的两个接口用 outboundService 模拟。
- 公开接口：计数、同访客去重、首访判定、按页隔离、外站 Origin 403、坏路径 400、内存限流、
  KV 只导入一次、ref 只留域名、bot 识别。
- 鉴权：无会话 401；state 不符返回 400 且不发外部请求；GitHub id 不符返回 403 且不发会话；
  半会话访问数据接口返回 401；密码连错 5 次返回 429；密码正确后会话可用；登出后失效；
  过期会话失效；cookie 属性和安全响应头逐项断言。
- 页面：本机 headless Chrome 打开本地 Worker。测试脚本直接往 D1 写会话，生产代码里不留测试后门。
  灌 30 天模拟数据，截深色、浅色、手机宽度三张图。
- 线上：部署后检查未登录接口返回 401、安全响应头齐全、公开徽标正常。完整登录只能由站长本人完成。

### 7.12 风险

- 免费版每次请求 CPU 上限 10 ms，PBKDF2 本地约 7 ms，只有提交密码的那次请求会执行。如果线上
  报 1102，用更小的迭代次数重新生成哈希即可，不用改代码。
- 100,000 次迭代低于 OWASP 建议的 600,000 次（本地实测 600,000 次约 41 ms，超出免费版 CPU 限制）。
  哈希只存在 Cloudflare secret 里，密码又要先过 GitHub 这一关才用得上，风险可以接受。
- 访客 ID 按 UTC 日轮换。按本地日统计时，跨 UTC 零点的访客会被算成两个。
- 30 天浏览量超过约 5 万次后，报表每次都扫全部明细，会消耗较多读取额度；到那时再加每日汇总表。
- workers.dev 子域 song66666 已经出现在公开的 stats.js 里。如果以后换子域，要同时修改
  STATS_ENDPOINT 和 OAuth 回调地址。

### 7.13 统一提问（待站长答复）

- Q1 后台地址：A workers.dev/admin（推荐）；B nolanpix.github.io/admin/。
- Q2 采集范围：A 7.6 的默认字段（推荐）；B 再加访客所在网络（ASN，能看出访问来自哪家公司的网络）。
- Q3 明细保留：A 365 天（推荐）；B 永久；C 90 天。
- Q4 面板配置：A 站长自己操作；B 我用站长已登录的 Chrome 代为操作，Client secret 和密码由站长本人填写。

## 8. 改进策略（已批准方案的实现与验收）

站长答复「好，按这个方案实现吧」。按推荐值实施：Worker 同源 `/admin`，不采集 ASN，明细保留 365 天；未代替站长创建生产资源或填写凭据。

- GitHub 身份只按固定数字 ID 核对，回调校验 state 和 PKCE；GitHub 验证只换取五分钟的密码步骤。密码正确后轮换会话，私有页面脚本和报表 API 只接受完整会话。来源域、过期和注销均由服务端判定。
- D1 事务同时写入日报、每页累计、当日去重与事件。旧 KV 使用游标、事务标记和只读导入；旧累计与新明细分开标注，不从 KV 猜测旧访问的来源或设备。
- 报表沿用主站颜色、字体及 `np.` 品牌，含时间窗口、趋势、小时热力、排行和最近 50 条记录。定时清理与生产绑定见 `worker/wrangler.toml`；面板配置、验证、会话撤销及回滚限制见 `worker/README.md`。
- 本地 Miniflare/workerd，GitHub 为隔离模拟服务：`SUMMARY 14 groups passed`。包括迁移幂等、原访客去重、未登录 401、非所有者 403、只过 GitHub 为 401、连续密码错误 429、两关通过 200、过期/登出 401 及保留期清理。
- 兼容性修正：首次测试发现 workerd 不支持 `fetch` 的 `redirect: 'error'`，会在调用 GitHub 前抛出 TypeError。改为 `manual` 并拒绝一切非成功状态，不跟随重定向。
- Chromium 用本地 D1 的 30 天模拟数据实测：1440×960 深/浅、390×844 手机均无整页水平溢出；每档检查图表、7 天切换、请求失败时保留旧数据、注销或过期后清除报表。三张截图不含真实访客数据。
- 验收边界：以上是本地真实 Worker 运行时与浏览器验证，不是生产 GitHub 授权。必须由站长配置 OAuth 应用、DB 绑定和 Secrets 后部署 Worker，再验证真实身份登录。GitHub Pages 的发布本身不会替换 Worker。

## 9. 改进策略（原生密码表单返回登录页）

站长报告 GitHub 登录后提交密码返回起点。以前的 API 测试显式设置 Origin，浏览器测试从完整会话开始；两者都没有覆盖浏览器生成密码表单请求头的过程。用真实 Chromium、回环 HTTPS、Miniflare 和模拟 GitHub 第一阶段会话对比同一表单：旧版发送 `Origin: null`，响应 403 `Invalid form origin.`；修复后发送同源 Origin、响应 303，随后成功加载报表和退出。只在含密码或登出表单的 HTML 设置 `Referrer-Policy: same-origin`；OAuth 回调和其他私有响应继续 `no-referrer`，严格 Origin 检查不变。14 组原有回归通过。生产须部署此 Worker 并重新打开页面；本地复现未使用站长的真实凭据。
