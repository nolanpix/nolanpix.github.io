# index.html (nolanpix.github.io) — design + build plan

Owner persona: **Nolan Pierce** (@nolanpierce_lab on X, nolanpix on GitHub).
Digital IC physical design engineer — P&R, CTS, STA, signoff; also tracking RTL,
synthesis, DFT, verification, packaging. Based in Silver Lake, Los Angeles.
Site job: a personal **blog / notebook** that hosts backend-flow notes, links to
his GitHub repos, and small tools — and tells a first-time visitor in ~5 seconds
who this is, what the site is for, and how to use it.

Avatar identity: **np.** monogram, warm magenta→orange gradient (same image now on
GitHub and X). The blog must feel like it belongs to that mark.

## 1. Design plan (first pass)

### Brief, pinned down
- Subject matter: digital IC backend (place-and-route, clock trees, timing signoff).
  The vernacular here is the **floorplan**: a chip die split into rows, a power grid,
  macros, routing tracks. That is where the distinctive visual choice comes from —
  not another dev-blog card grid.
- Audience: other backend / EDA / chip engineers who'll skim for a useful note or repo.
- Primary job: orient a newcomer fast, then get out of the way and list the writing.

### Avoid (design-skill "AI tells" to stay away from)
- No cream (#F4F1EA) + terracotta (#D97757) serif look — that is trait #1, and the
  current placeholder uses exactly it. Replace it.
- No identical rounded SaaS cards with the same soft grey shadow on everything.
- No tracked-out ALL-CAPS eyebrow over every heading, no "A · B · C" midd-dot meta,
  no "→" glued onto every link, no tinted-near-black standing in for black.

### Palette (dark "tapeout terminal", 4–6 tokens)
- `--bg`      #0e1016  near-black blue — the canvas, like a layout viewer background
- `--panel`   #161a23  slightly lifted surface for the floorplan hero + code
- `--fg`      #e8eaf0  primary text
- `--muted`   #8b90a3  secondary / metadata
- `--line`    #242a38  hairline grid + dividers (the "routing tracks")
- `--accent`  #ff5a3c→#c0398f  the np. magenta→orange, used once, for the signature
  gradient (name, the die outline glow, active nav). Single bold element = restraint.
- Light mode: inverted to a blueprint-paper look (#f3f5fa bg, same accent), via
  prefers-color-scheme, but the design is authored dark-first.

### Type
- Display / headings: **Space Grotesk** (geometric, slightly mechanical — reads like
  tooling, not a magazine serif). One weight for H1 (600), one for H2 (500).
- Body: system UI sans stack (`-apple-system, Segoe UI, Roboto, ...`) 16–17px, line
  1.7, measure ~68ch. No italics.
- Mono: `ui-monospace, "JetBrains Mono", "SFMono", Menlo, monospace` for inline
  signal names (`WNS`, `setup`, `clk`), file names, and the die-coordinate eyebrow
  on the hero. Mono is used because these ARE code/data tokens, not as decoration.
- Fonts loaded self-hosted-ish via one Google Fonts link for Space Grotesk only;
  everything else is system. Keep it to one web font to stay fast.

### Layout concept
Hero is an actual **floorplan of the site**: a die rectangle (SVG) whose "blocks"
are the sections of the blog (Notes / Repos / Tools / About), drawn like placed
macros on a grid, with a faint power-grid overlay. The newcomer literally sees a
chip floorplan where each block is a labelled, clickable region — that is the hero,
the nav, and the "what is this / how to use it" explainer in one object.

```
+----------------------------------------------------------+
|  np.          notes   repos   tools   about      [gh][x] |   <- slim top bar
+----------------------------------------------------------+
|  DIE: nolanpix  (12.4um x 3.8um)         <- mono eyebrow  |
|  Nolan Pierce — backend notes from                       |
|  floorplan to signoff.           <- big Space Grotesk h1 |
|  one-line what/how sentence in muted body                |
|                                                          |
|  +--------- floorplan svg (die + 4 macro blocks) ------+ |
|  | [ NOTES ]        [ REPOS ]                          | |
|  |  power grid dots....................................| |
|  | [ TOOLS ]        [ ABOUT / how to use ]             | |
|  +----------------------------------------------------+ |
+----------------------------------------------------------+
|  Latest notes            (list, newest first)            |
|   2026-11-24  Looping layers to trade compute for mem    |
|   2026-11-24  Macro placement: fast repair beats raw WL  |
|   ...                                                    |
+----------------------------------------------------------+
|  Repos  (3 real cards, distinct from the note list)      |
+----------------------------------------------------------+
|  footer: built in public · gh · x · rss                  |
```
- Alignment: left-aligned throughout (default), hero die centered as the one
  deliberate focal object.
- Articles are separate static pages under `notes/<slug>.html`, same shell, so the
  blog is real (not a one-pager). Start with 3 posts seeded from his actual X notes,
  rewritten into short technical reads.

### Principles
1. The floorplan hero is the single memorable thing; everything else is quiet.
2. Structure encodes meaning: the "blocks" are real sections, the mono eyebrow is a
   real coordinate-style label, hairlines read as routing tracks — not decoration.
3. One accent (the np. gradient), spent on the name + die glow only.
4. Quality floor unannounced: responsive to mobile (die stacks), keyboard focus
   rings, prefers-reduced-motion kills the one load animation, light mode works.

## 2. Review against brief (did I just produce the generic default?)
- A dev would default to: dark bg + one acid accent + a card grid of posts. My plan
  shares "dark bg + one accent" but spends the accent on a **floorplan hero that is
  literally the site's own chip layout**, which is specific to THIS engineer's
  domain and not reusable for a generic blog. Kept.
- Risk: a floorplan can become decorative. Mitigation — each die block is a real
  nav target with a real label, and the coordinate eyebrow uses the site name, so
  it carries information. If it ever reads as pure ornament in review, simplify to a
  labelled 2x2 region map (still domain-specific, still functional).
- Motion: exactly one load reveal (die blocks settle into place, like placement
  converging), reduced-motion disables it. No per-card hover fades.

## 3. Build notes / decisions
- Static, no build step (matches README: "single static HTML page, no build step" —
  extended to a few static pages, still no build). `.nojekyll` kept.
- Favicon: the np. image via github avatar URL is fine, but better to inline an SVG
  np. favicon so the tab matches even if GitHub avatar CDN changes. Decision: inline
  SVG favicon with the gradient np.
- Onboarding for a new visitor lives in the "about / how to use" die block + a short
  hero sentence: who Nolan is, what the site hosts, and that everything is built in
  public with links out to GitHub/X.

## 4. Q&A / open items
- Q: real repos to feature? The GitHub account is new; use placeholder-but-honest
  "coming soon" repo cards pointing at github.com/nolanpix, rather than inventing
  repo names. Revisit when real repos exist.

## 5. 改进策略（Safari 选中文字时两侧空白被整片高亮）

- 现象：Safari 里拖选正文，高亮会铺满左右两侧空白；Chrome 只高亮文字。截图实测：Safari 1432 宽时选区有 38%–56% 的像素落在正文栏之外。
- 根因：WebKit 在块级容器里补画 selection gaps，即块与块之间、块两侧的空隙。`body` 是普通块容器，它的子块 `header` / `main` / `footer` 两侧的页边距就被当成空隙涂满。Chrome（LayoutNG）不画这类空隙。
- 方案对比，在 Mac WKWebView（与 Safari 同引擎）离屏渲染，按像素测量：
  - `body` 单列 grid（采用）：grid 容器不给子项补画空隙。选区画在正文栏外的像素在 1432、820、390 三个宽度下都是 0。
  - 对 `header` / `main` / `footer` 加 `transform`（2026-11-10 修 markdown-preview 时的做法）：只在 `main` 内部选择时有效。全选跨越 header 到 footer 时，`body` 仍会补画，index 页约 79% 的高亮落在空白上，不采用。
  - 对 `body` 用 flex：与 grid 效果相同，但改动面更大，不采用。
- 改动：`assets/style.css` 中 `body` 增加 `display: grid; grid-template-columns: minmax(0, 1fr);`。`minmax(0, 1fr)` 防止宽内容撑开唯一的一列。
- 验证（全部用本地副本，不碰线上）：
  - 选区：10 种选择 × 3 个宽度，正文栏外的高亮像素为 0；修复前最多约 539 万像素。
  - 未选中时，滚动条自动隐藏模式：6 个页面 × 4 个宽度，逐元素位置和逐像素都与修复前一致。
  - Chromium：6 个页面 × 4 个宽度，24/24 逐元素位置和整页截图一致。
  - 长代码块（单独构造的测试页，Always 模式，1432 / 390 各跑两次）：布局与修复前一致。
- 已知残留：只在「始终显示滚动条」（例如接了鼠标的 Mac）且窗口宽度不超过约 489px 时出现。后台报表页的热力图出现横向滚动条，所在面板稳定少算 17px（390、330 宽度都能复现），滚动条压住面板底边约 2px。原因是 WebKit 会延后处理 grid 子项内部滚动框的滚动条，祖先高度没有重新计算。尝试用 `contain: layout` 修补，第一次测试通过，重测失败，所以没有采用。窄屏下改用 `overflow-x: scroll` 可以确定性规避，但要写死断点宽度，所以先不加，等站长决定。
- 教训：结果不稳定的测试必须重复跑；从候选方案里选之前，先逐项读完筛选结果。

## 6. 改进策略（深色/浅色主题切换 + 中英双语，默认中文）

- 需求（2026-11-26）：访客可以自己切换深色或浅色主题；页面支持中文和英文，默认显示中文，并提供按钮选择语言；文章正文也要有中英两版，默认中文。
- 方案：同一个 URL 承载两种语言，不拆分 /en/ 目录。这样访问统计的路径不变，sitemap 不用改，切换时也不需要刷新。
  - 静态 HTML 默认带 `<html lang="zh-CN" data-lang="zh">`。中英文成对出现，分别标注 `lang="zh-CN"` 和 `lang="en"`。style.css 只显示当前语言：`:root[data-lang="zh"] [lang="en"]` 与 `:root[data-lang="en"] [lang="zh-CN"]` 设为 `display: none`。
  - assets/prefs.js 作为同步脚本放在 `<head>` 中、样式表之后执行。它读取 localStorage 中的 `np:lang` 和 `np:theme`，在 `<body>` 解析之前写好 `data-lang`、`lang`、`data-theme` 和页面标题，所以刷新时不会先闪一下默认语言或默认主题。
  - 没有保存过主题时跟随系统，并监听系统切换；点过按钮后固定为所选主题。多个标签页通过 `storage` 事件保持同步。
  - 主题变量：`:root` 为深色；`:root[data-theme="light"]` 为浅色。`@media (prefers-color-scheme: light) :root:not([data-theme])` 是不运行脚本时的兜底，后台页由 Worker 下发、带 CSP，不加载 prefs.js，仍按系统设置显示，行为不变。
  - 按钮放在顶栏右侧：语言按钮显示另一种语言（中文页显示 `EN`，英文页显示 `中文`）；主题按钮显示当前主题的图标（月亮或太阳）。`aria-label` 和 `title` 随语言更新。脚本没有运行时隐藏这两个按钮。
  - 中文排版：字体栈补上 PingFang SC、Hiragino Sans GB、Microsoft YaHei、Noto Sans CJK SC；中文标题去掉负字距并放宽行高；中文强调用加粗，不用伪斜体。
- 文章：tools/gen_notes.py 中每篇文章新增 `zh` 字段（title、dateline、tags、lede、body），页面同时输出中英两版正文。缺少任何一个中文字段时报错，返回码为 2。
- 顺带修复：迷你 Markdown 渲染器原先把列表项的缩进续行当成新段落，ECO 那篇的三条关卡因此被拆成“列表项 + 段落”；现在续行会拼回同一个列表项。另外支持 `*强调*`。
- 访问量徽标（stats.js）两种语言都输出：中文显示“浏览 N / 今日 N”，英文显示“N views / N today”。
- 验证（Chromium，/tmp/test_wksel/node/i18n.mjs，11 组全部通过）：
  - 默认中文：系统为深色或浅色时各测 4 个页面，都只显示中文，`<body>` 出现前属性已经设好。
  - 切换与持久化：语言、主题、页面标题和按钮文案随切换更新；跨页面、刷新后选择仍然保留。
  - 文章：中文正文、列表续行、强调样式均正确。
  - 窄屏：390 与 330 宽度下没有横向溢出，按钮完整可见且不小于 28px。
  - 键盘：Enter、Tab、Space 都能操作两个按钮。
  - 关闭 JavaScript：按钮隐藏，显示中文，主题跟随系统。
- 未做：后台管理页（Worker 下发，与博客不同源）暂不加切换按钮，仍跟随系统主题，界面保持英文。是否需要，列在统一提问中。

### 统一提问
1. 后台管理页要不要也加中英与深浅色切换？那是另一个域名，localStorage 不共享，需要单独实现。

## 7. 改进策略（个人网页加管理员入口；后台独立的中英与深浅色切换）

- 需求（2026-11-26）：在个人网页上放后台管理页入口，并标明只有管理员可以进入；后台管理页也要有语言和主题两个按钮，切换状态单独记忆。此前 §6 统一提问的第 1 题由此得到答复：要。
- 入口：首页和文章页顶栏的 GitHub、X 后面加一个带锁图标、虚线边框的链接，文案为“后台 · 仅管理员”（英文：Admin · owner only）；页脚也加一条“站长后台（仅管理员可进入）”。
  - 链接带 `rel="nofollow"`；`aria-label` 和 `title` 都写明“仅管理员可进入”。
  - 窄屏（不超过 760px）只显示锁图标，读屏仍会读出完整文字。
  - 文章页入口由 tools/gen_notes.py 模板生成。
  - 入口只是指路，权限仍由 Worker 的 GitHub 站长身份校验加后台密码两道关卡控制，这里没有任何改动。
- 后台切换（worker/counter.js）：
  - 页面默认中文，所有界面文字成对输出 `lang="zh-CN"` / `lang="en"`，沿用主站 style.css 的隐藏规则。
  - 服务端错误提示用 `ZH` 对照表输出中英两份，例如“密码不正确，请重试。”。
  - 新增 `/admin/prefs.js`，由 `adminPrefs()` 函数序列化而成。它与后台同源，所以 CSP 的 `script-src 'self'` 能放行；脚本不含任何数据，公开可读，缓存 1 小时。
  - 偏好存在后台域名下的 localStorage，键名为 `npa:lang` 和 `npa:theme`，与主站的 `np:*` 互不影响。没选过主题时跟随系统设置。
  - 报表脚本 `dashboardClient()` 在运行时生成的文字也做了双语：说明行、状态行、表头、热力图的星期、空状态、图表的 aria 描述。切换语言时直接用上一次取到的数据重新渲染，不会重新请求报表。
- 兼容：Worker 部署要站长手动操作，在这之前线上仍是旧版 Worker。admin.css 保留了旧页面依赖的选择器 `.adm-top > div > a:last-child`，所以旧版后台页在新样式下显示不变；入口链接指向的 `/admin` 新旧版都能用。
- 验证（/tmp/test_wksel/node/admin_e2e.mjs，8 组全部通过）。测试在本地运行真实的 worker/counter.js，并把线上 Worker 和博客的域名都指到本地，所以真实的 CSP 和 `__Host-` Cookie 都在起作用。GitHub 和 D1 用本地替身代替。
  - 主站入口：首页和文章页、中英文、390 和 330 宽度下都正常。
  - 后台登录页：默认中文，主题跟随系统。
  - 切换后的偏好写在 `npa:*` 键下，不写主站的 `np:*`。
  - GitHub 登录、密码页、报表三个阶段都保留了所选的语言和主题；密码错误的提示显示为当前语言，切换语言后实时变化。
  - 报表数据随语言重新渲染，不重新请求。
  - 权限边界不变：没有完成两道关卡时，ui.js 和报表接口都返回 401；用非站长的 GitHub 账号登录会被拒绝，也不会下发会话 Cookie。
  - 主站 §6 的 11 组回归测试全部通过。
- 测试中遇到的坑：
  - Playwright 用 `route.fulfill` 返回 3xx 后，跟随跳转的下一个请求不会再经过 route，而是直接去线上的旧版 Worker。测试里改成返回 200，再用 `location.replace` 跳转。
  - Node 没有 Workers 才有的 `crypto.subtle.timingSafeEqual`，测试里用 `node:crypto` 补上了。

## 8. 改进策略（后台报表交互：悬停详情、键盘、筛选）

- 需求（2026-11-26，用户已重新部署 307900f）：用户截图圈出“每日访问”波形图，希望鼠标放上去能看到更详细的数据，并让后台其他地方也能这样交互。确认的方案为“全部做”。
- 实现（worker/counter.js 的 `dashboardClient()` 和 assets/admin.css）：
  - 全页共用一个悬停卡片：文字用 textContent 写入，位置通过 CSSOM 设置，CSP 不需要允许内联样式；卡片会贴边避让，不会超出屏幕。
  - 卡片的关闭方式：鼠标离开、点到别处、按 Esc、切换语言、页面滚动超过 24px。
  - 波形图：竖向指示线吸附到最近的一天，两条线上各画一个点。卡片显示：
    - 日期和星期、浏览、访客、每访客浏览；
    - 占本期比例、较前一日的变化（绝对值和百分比）；
    - 标签：今天（仍在统计）、本期峰值、尚未开始记录。
    - 键盘：←/→ 逐日移动，Home/End 跳到首日/末日。
  - 热力图：悬停时高亮所在行和列（24 + 7 − 1 = 30 格），当前格加描边。卡片显示时段、浏览、占比、在 168 个时段中的排名、当天全天合计、该小时一周合计。方向键可以逐格移动。
  - 4 个指标卡：
    - 页面浏览量、访客天数下方各加一条走势线。
    - 悬停或聚焦时卡片显示本期合计、日均、峰值日、较上一时段变化；“今日”卡与本期其他日的日均对比。
  - 来源排行：
    - 每一项变成按钮，背景是占比条；悬停时显示次数、占比和排名。
    - 点击后筛选下方的访问日志，并显示“筛选：来源域名 = x.com · 最近 N 条中有 M 条”；再点一次或点“清除筛选”恢复。
    - 筛选只作用于已加载的最近 50 条记录，不重新请求数据。
  - 修复 §7 遗留的问题：图例里的“访客”标记原本和“浏览”同为橙色实线（`:nth-child(2)` 实际选中的是文字节点前的第一个 `<i>`），现改为 `:nth-of-type(2)`，显示白色虚线，与图表一致。
- 验证（/tmp/test_wksel/node/admin_e2e.mjs 新增 6 组，共 14 组全部通过；主站 i18n.mjs 11 组通过）：
  - 波形：悬停最后一天，卡片内容正确；悬停第一天时没有“较前一日”；←/Esc 正常。
  - 热力图：卡片正确，高亮 30 格，鼠标离开后清除。
  - 指标卡：较上一时段 +25% 等数值正确。
  - 排行：占比条宽度分别为 100%、66.7%、22.2%；点击 x.com 后日志剩 6 条中的 3 条；再次点击恢复。
  - 切换语言：打开的卡片会关闭，新卡片和筛选条随语言变化。
  - 390px 宽度：轻点后卡片在屏幕内且保持显示，滚动后关闭。
  - 全程没有 CSP 违规。
- 测试中发现并修复的 bug：卡片最初监听了捕获阶段的所有 scroll 事件，手机上轻点后浏览器自动把元素滚入视野，卡片立刻被关掉。现在只在页面本身滚动超过 24px 时关闭。

## 9. 改进策略（访问来源改版 + 页面短名 + 接入 MBTI 小工具，2026-11-26）

- 需求（用户原话归纳）：
  1. 后台“访问来源”里每个按钮做成整行进度条看占比分布，框太大、突兀，要和整页更适配。
  2. “页面”一栏有很长的名字（`/notes/macro-placement-fast-repair.html`），换行很难看，要重新命名。
  3. 把另一个 GitHub 账号里的 MBTI 网页移植进个人网站，作为小工具，加一个入口点进去；以后用 nolanpix 账号推送，那个账号里的 MBTI 网页内容删除。
- 设计（实测截图对照，见 §9.4）：
  - 排行项改为“名称 + 次数一行，下面 3px 占比线”：无背景块、无边框、不换行（ellipsis），悬停时文字提亮、占比线升到全色。
  - 占比口径从“相对第一名的条长”改为“占本期浏览/访客天的百分比”，悬停卡里的数字和线长一致（例如 6/14 = 42.9%）。
  - 页面类标签用短名：`首页`、`宏单元摆放`。短名表由 `tools/gen_notes.py` 生成到 `assets/pages.json`（`{path: [zh, en]}`），Worker 读它，新增笔记不必重新部署 Worker；读不到时回退为 slug。
  - 访问日志表的“页面”列与筛选条同样显示短名，完整路径放在悬停卡里（“路径”一行）。
  - 首页“小工具”区：一张卡片链到 `mbti/`（相对链接，中英双语说明，标注页面本身是中文）。
  - MBTI 页挂在 `/mbti/`：只发布生成物 `index.html`、`og.png`、`OFL-Anybody.txt`，源码与解锁码继续留在本地工作区（付费明文不进公开仓库）。
- 实现：
  - `assets/admin.css`：`.adm-rank` 改为两行 grid（名称/次数 + `::after` 占比线），`--share` 继续由客户端设置；新增 `:focus-visible` 轮廓，按压态用强调色。
  - `worker/counter.js`：新增 `pageNames()`（2 秒超时、失败返回 `{}`、带 600 秒缓存提示）；`report()` 用 `Promise.all` 取名称；`dashboardClient()` 增加 `pageName()`/`shown()`，占比改为 `n/base`。
  - `tools/gen_notes.py`：`-p/--pages-file`，生成 `assets/pages.json`；每篇文章新增 `short`（英）与 `zh.short`，校验缺失与显示宽度（CJK 记 2 列，上限 24）。
  - `tools/tests/test_gen_notes.py`：正常生成、四种缺/超长短名的拒绝（退出码 2、不写文件）、宽度计算。
  - `index.html` + `assets/style.css`：工具区从一段说明改为“卡片 + 待办说明”，网格 `minmax(0,360px) minmax(0,1fr)`，≤620px 单列。
  - `mbti/`：构建命令 `python3 build_site.py -u https://nolanpix.github.io/mbti/`，随后复制三件生成物。
- 兼容：新 `admin.css` 对当前已部署的旧 Worker 同样生效（同一 `.adm-rank` 结构与 `--share`），旧 Worker 下只是没有短名。
- 验证：
  - `/tmp/test_wksel/node/admin_e2e.mjs` 15 组通过（新增：占比=占本期浏览、短名/回退、筛选条与日志用短名、截图数字下每项单行 ≤32px、3px 线、无背景块、1280/390 × 深浅色无溢出）。
  - `/tmp/test_wksel/node/mbti_site.mjs` 5 组通过（首页入口中英双语、点击进入、`og:url` 为新地址、旧地址不出现也不被请求、无跨域请求、390/320 无横向溢出、未解锁时详细解读不渲染且解锁面板写“付款入口还在准备中”）。
  - `/tmp/test_wksel/node/i18n.mjs` 11 组通过；`python3 tools/tests/test_gen_notes.py` OK；MBTI 侧 `python3 tests/test_site.py` OK。
- 未覆盖 / 待办：
  - Worker 需要站长在 Cloudflare 控制台整体替换 `worker/counter.js` 并部署，短名与占比口径才线上生效（CSS 已生效）。
  - MBTI 付费入口仍为空（等爱发电链接与客服邮箱）；`-r` 发布检查未通过，因此这次是按普通构建发布。
  - 旧站（另一账号下的 `mbti-self-test` 仓库）的删除需要 `delete_repo` 权限，该账号令牌没有；Pages 已下线、仓库已转为私有。

## 10. 改进策略（左侧目录栏、MBTI 命名、404 与导航闭环，2026-11-26）

- 需求（用户原话归纳）：
  1. 网站左侧加导航栏：存在感要低，但想找内容时往左看一眼就能看到站里有什么。
  2. 小工具的名字加上 MBTI：大多数人认识这四个字母，原名不够醒目。
  3. 按上一轮推荐的顺序执行：MBTI 详情页按来路返回、各视图独立的“个人主页”链接、改名、左栏、验证，最后改写提交历史。
- 左栏方案（没有采用上一轮提的“56px 图标栏，悬停展开到 176px”）：
  - 原因：图标栏要悬停才显示文字，往左看一眼只能看到四个图标，看不出有哪些内容，和需求相反。
  - 做法：正文左侧页边里一列纯文字目录。列出四个栏目，栏目下列具体内容：最新 5 篇笔记的短名，以及“MBTI 自测”。超过 5 篇时追加“全部 N 篇”。
  - 降低存在感：没有底色、边框、图标和动效；字号 12.8px（正文 16.5px）、常规字重、`--muted` 色；只有正在读的那篇用正文色加一段强调色细线标出。
  - 一眼可见：常驻、固定在距顶 100px，滚动时不动，不需要悬停；和正文栏保持 36px 间距，从不压到正文上。
  - 可读：`--muted` 与背景的对比度，深色 5.99、浅色 5.42，满足 WCAG AA。
  - 断点：宽度 ≥1280px 才显示，页边刚好放得下 152px 的一列。这时隐藏顶栏的“笔记/仓库/工具/关于”，免得两套导航重复；<1280px 时与原来一样。
  - 生成：由 `tools/gen_notes.py` 统一写入文章页、`index.html` 的 `rail:start`/`rail:end` 标记之间和 `404.html`，新增笔记会自动出现在左栏。标记缺失或重复时报错退出 1，不写任何文件。
  - 顺带修复：点栏目链接后标题被吸顶顶栏挡住（实测标题在 46px，顶栏底边 59px）。左栏、顶栏和布局图三处入口都受影响，`section.band` 加 `scroll-margin-top: 58px`。
- 404：新增 `404.html`。GitHub Pages 对任何不存在的路径都返回这个页面，所以链接全部用根相对路径。页面带左栏，提供“回到首页”和“最新笔记”两个链接，标 `noindex`，不加载访问统计，免得把探测路径记进报表。
- MBTI 命名：首页卡片改为“MBTI 十六型偏好自测”；左栏和后台报表的短名为“MBTI 自测”（`pages.json` 新增 `/mbti/`）。MBTI 页面本身的改动记在 MBTI 工作区的方案 §14。
- 验证：
  - `/tmp/test_wksel/node/nav_e2e.mjs` 14 组通过：
    - MBTI：从分享结果、我的结果、类型列表进入详情后，返回按钮回到来处；直接打开、过期或伪造的来路一律退回类型列表，伪造内容不会注入页面。返回用 `history.back()`，不新增历史记录，浏览器前进后退的结果一致。
    - MBTI：“个人主页”入口在每个视图上都有，与“上一题”分开；名称带 MBTI。
    - 左栏：1280/1440/1920 × 深浅色，位置、间距、对比度、字号都符合上面的要求；1279/1024/820/390 宽不显示，也没有横向溢出。
    - 左栏：当前文章有标记，所有链接都指向真实存在的文件，切换英文后文字和 aria-label 都换成英文；键盘 Tab 能走到左栏；窗口只有 420px 高时，左栏不会伸进底部 60px。
    - 404：返回状态 404，样式正常加载，链接正确。
  - 回归：`mbti_site.mjs` 5 组、`i18n.mjs` 11 组、`admin_e2e.mjs` 15 组、`pages_fetch.mjs` 全部通过。`python3 tools/tests/test_gen_notes.py` 在 Python 3 和 3.6 下都是 OK；新增的检查覆盖左栏、首页刷新的幂等性、404 只用根相对链接、超过 5 篇时折叠、缺少标记时不写任何文件。
  - 回归：3 篇文章页与改动前逐字比对，只多出左栏这一段，其余字节完全不变。
- 提交历史（2026-11-26，按站长要求）：全部提交的作者和提交者统一为 Nolan Pierce（GitHub noreply 邮箱），去掉共同作者行；只做了这一处内容调整：一份早期计划文档快照改为后来的中性措辞。改写后每个提交的日期和标题不变，最新提交的文件树与改写前完全一致，线上内容没有变化。本文和 `counter_plan.md` 里引用的提交号已换成改写后的新号。
  - 上线（同日）：改写后的分支由站长本人强推（代理侧的 force push 被安全策略拦截）。第一次强推失败，报错 `fatal: 'origin' does not appear to be a git repository`。原因是 git-filter-repo 改写时会自动删除 `origin` 远端，而补加远端的那条命令和强推写在同一条命令里，整条被拦，补加没有执行；交接前也没有用 `git remote -v` 核对。补上远端、用普通推送 `--dry-run` 确认认证和网络正常（结果为预期的 non-fast-forward 拒绝）后，站长重新执行，推送成功。远端 main 为 0e6b28a；GitHub 上 16 个提交的作者和提交者全部为 Nolan Pierce；Pages 已重新构建，线上 11 个文件与本地逐字节一致。
  - 站长决定（1A）：删除改写前的 15 条 Actions 运行记录（全部返回 204），只保留改写后新提交的那条。
  - 本地工作克隆已换成改写后的新克隆。旧克隆含改写前的历史，如果在里面 pull 再 push，会把旧提交带回来。

## 11. 改进策略（笔记按主题分组 + 左侧目录可折叠 + 首篇非芯片长文，2026-11-26）

- 需求（用户原话归纳）：
  1. 把黎曼猜想那篇中英文长文上传到 nolanpix 个人网站；它不属于数字芯片后端内容。
  2. 重新安排站内的内容分组；以后还会上传与数字后端无关的内容，要能分出其他类别。
  3. 文章多起来后，左侧导航必须能折叠，让用户看到更少的层次，方便选择。
- 分类方案：
  - 新增 `CATEGORIES`（`id` / 中文 / 英文）：`backend` 数字后端、`math` 数学与科学。每篇文章带 `category`，未知分类直接拒绝构建。新类别只加一行，不需要改渲染代码。
  - 首页“笔记”块改为由生成器写出（`notes:start` / `notes:end`），按主题分组成 `note-group`，组内按日期倒序；标题处给出“4 篇 · 2 个主题”。这样不再需要手工维护首页列表。
  - 文章页返回链接与 meta 行都指向 `#cat-<id>`，读者能回到自己那一类，而不是笼统的“全部笔记”。
- 左栏折叠方案：
  - 采用原生 `<details>` / `<summary>`，不引入 JS：每个主题一行，右侧显示篇数；默认只展开“当前文章所属主题”（首页展开最新文章的主题），其余折叠。展开后仍只列该主题最新 5 篇，更多时给“全部 N 篇”链接到首页对应分组。
  - 视觉保持原来的低存在感：12.8px、`--muted`、无底色无边框无动效；只为 summary 加一个 `▸/▾` 小三角和 `cursor:pointer`。折叠后的左栏固定是“栏目 + 主题”两层。
  - 位置与断点不变：≥1280px 常驻；1280 宽实测左栏 22–174px，正文从 210px 开始，间距 36px，无重叠。
- 长文导入：
  - `gen_notes.py` 的 POSTS 支持 `body_file`（英文）与 `zh.body_file`（中文），文件放在 `content/`，避免 40KB 正文塞进生成器；`check_posts` 会检查文件存在且非空。
  - 扩展迷你 Markdown：`###`、有序列表、`|` 表格、`---` 分隔线、`**粗体**`、`\_` 反转义；表格输出包在 `.table-wrap` 里，窄屏横向滚动而不是把四列压成 340px。
  - 正文来自 `~/other_domains/writing/riemann_ai_proof/` 两篇现成稿件，去掉重复的一级标题（站点用 POSTS 里的标题），其余原样保留；站点内 slug 为 `riemann-hypothesis-ai-proof`，短名“黎曼猜想与 AI 证明” / “Riemann & AI proof”。
- 顺带调整：首页 hero、布局图 BLOCK A 和 meta/og 描述都改成“笔记按主题分组”，不再暗示全站只写芯片后端。
- 验证：
  - `python3 tools/tests/test_gen_notes.py` → OK：覆盖分类校验、未知分类/缺失正文文件拒绝构建、两处标记缺失时不写任何文件、每组最多 5 篇与“全部 N 篇”、首页分组与计数、幂等性、长文的表格/三级标题/有序列表/粗体渲染。
  - `/tmp/test_wksel/node/categories_nolanpix.mjs` → ALL PASS（1440/1280/1279/820/390）：左栏只在 ≥1280 显示；两个主题一折叠一展开；点击主题能展开并出现该主题文章，再点收起；首页两组 3+1 篇；无横向溢出；文章页中英切换、主题返回链接、当前文章标记正常；390 宽表格可滚动。
  - 页边几何：1440 时左栏 102–254px、正文 290–1150px；1280 时左栏 22–174px、正文 210–1070px，间距始终 36px。
- Q&A / 待定：
  - 用户说“以后可能分其他类别”，当前只建了有内容的两个主题；不预先造空分类，避免首页出现 0 篇的分组。新增主题时同步在 `CATEGORIES` 加一行并在文章上写 `category`。
  - 折叠状态不做 localStorage 记忆：换页即回到“当前主题展开”，避免导航行为依赖 JS；如以后需要，可在 `prefs.js` 里加。

## 12. 改进策略（首页 hero 定位改为“不只后端”；DIE 参数改 3280x6692 / 62%，2026-11-26）

- 需求（用户原话归纳）：站点记录的不只是后端笔记，还会有其他领域的文章和自己做的小工具，因此首页最上方那段文字不能只说“后端笔记”；同时把 hero 上方的 DIE 小字改成尺寸 `3280 x 6692`、利用率 `62%`。
- 文案方案：
  - 中文标题改为“芯片、数学与小工具：我的公开笔记本。”，英文 “Silicon, math, and small tools: my open notebook.”；gradient 落在“公开笔记本 / open notebook”上，保留 `np.` 品牌色。
  - 中文 lede 明确“芯片后端只是其中一条主线”，并列出数学、AI、其他领域长文、代码仓库、小工具；英文 lede 同步。
  - `<title>`、`data-title-en`、meta description、og:title、og:description 一起改，避免搜索结果和分享卡仍写“后端笔记”。
  - 布局图 BLOCK C（工具）原文只提 Tcl/Python 流程与日志，和实际已有 MBTI 自测不符，顺手放宽为“Tcl/Python 流程、日志处理，也有和芯片无关的小玩意”。
- DIE 小字：`860 x 420 um / util 68%` → `3280 x 6692 um / util 62%`。用户只给了数字，单位沿用原 `um`。
- 验证（headless Chromium `chromium-1248/chrome-linux-arm64`，file:// 本地页）：
  - 1440/390 两档：无横向溢出（scrollWidth == clientWidth），hero/标题/lede 文案与中英切换后的 `document.title` 全部命中，无 page error。
  - 320 宽时 eyebrow 折成两行（44px），仍无溢出，属可接受的极端窄屏表现。

## 13. 改进策略（hero 文案“数学”→“写作”，2026-11-26）

- 用户追加要求：把 §12 文案里的“数学”换成“写作”，强调写作而不是数学。
- 改动范围：`<title>`、`data-title-en`、og:title、meta description、og:description、h1（中英）、lede（中英）、布局图 BLOCK A 描述（中英）。
  - 中文标题 → “芯片、写作与小工具：我的公开笔记本。”；英文 → “Silicon, writing, and small tools: my open notebook.”
  - lede 改为“芯片之外还有写作、AI 和其他领域的长文”，英文 “also cover writing, AI, and other fields beyond chips”。
  - 只改首页表达；左栏/首页分组里的真实主题名“数学与科学 / Math & science”以及黎曼文章的 `数学` 标签保留不动。
- 验证：同一套 headless 检查（1440/390、中英切换、无横向溢出）。

## 14. 改进策略（从主站进后台时沿用主站的深浅色，2026-11-27）

- 需求（用户原话）：nolanpix 的个人网站跳转到后台管理页时也要统一色调；从网站去后台时，网站是明亮色调，后台也要用明亮色调。
- 根因：后台在 Worker 的另一个源（`nolanpix-counter.song66666.workers.dev`），与 GitHub Pages 不共享 localStorage，`np:theme` 与 `npa:theme` 互不可见。后台进入时只能按它自己的保存值或系统主题。
- 方案：主站把“当前生效的主题”写进后台入口链接的查询串（`?theme=light|dark`），后台读取后应用、存入 `npa:theme`，再从地址栏移除参数。
  - `assets/prefs.js`：新增 `syncAdminLinks()`，对所有跨源 `a[href*="/admin"]` 用 URL API 设置 `theme` 参数；`applyTheme()`、DOM 就绪、系统主题变化与跨标签页同步时都会刷新链接。链接在页面载入时即带参数，中键、复制链接同样有效，无需改 index/404/文章模板。
  - `worker/counter.js` 的 `adminPrefs()`：读取 `location.search` 的 `theme`，只接受 `light`/`dark`；命中则 `save('npa:theme')` 并 `history.replaceState` 去掉参数（避免刷新或回退时旧参数覆盖用户后来在后台切换的选择），再按“URL 参数 → 已存偏好 → 系统”的优先级设置 `data-theme`。脚本在 `<head>` 同步执行，首屏即正确，无闪色。
  - 登录流程不受影响：参数只落在 `/admin` 这一次，随后 `/admin/login`、OAuth 回调、密码页的跳转都靠已存下的 `npa:theme` 保持。
  - 脚本地址加 `?v=2` 作为缓存戳：`/admin/prefs.js` 之前是 `public, max-age=3600`，不加戳时部署后浏览器可能继续用旧脚本一小时。
- 兼容：主站旧链接（无参数）仍可用；未部署新 Worker 时参数被旧版忽略，行为与现在相同；后台自己的主题按钮不变，切换后写 `npa:theme`。
- 验证：
  - `/tmp/test_wksel/node/admin_e2e.mjs` 17 组全部通过。新增 3 组：
    - 主站深浅色切换时，顶栏与页脚两个后台入口的 href 实时变为 `?theme=light|dark`；
    - 从主站点击入口实际进入后台：系统为深色时后台仍以浅色打开，`npa:theme=light`，地址栏已无参数；
    - 直接访问 `/admin?theme=light`（系统深色）首屏即浅色；刷新后保持；`?theme=blue` 被忽略；`?theme=light` 覆盖已存的 dark。
  - 回归：`/tmp/test_wksel/node/i18n.mjs` 11 组通过。
- 上线：主站（`assets/prefs.js`）随 GitHub Pages 发布；后台需站长在 Cloudflare 控制台用本版 `worker/counter.js` 整体替换并部署，之后 `?theme=` 才会生效。部署前旧 Worker 只是忽略该参数。
