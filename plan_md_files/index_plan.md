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
