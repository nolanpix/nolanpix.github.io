#!/usr/bin/env python3
# --------------------------
# author    : nolan pierce
# date      : 2026/11/25
# label     : site_generator
# descrip   : Render the standalone note pages for nolanpix.github.io from a small
#             in-file POSTS table, so every article shares one HTML shell and new
#             posts are added by editing one list. Every post carries an English
#             version and a Chinese one (post["zh"]); each page holds both and
#             assets/prefs.js shows one (Chinese by default). Body text is a tiny
#             subset of Markdown (## heading, blank-line paragraphs, - bullets with
#             indented continuation lines, > quote, `code`, *emphasis*). Output
#             files are written next to this script under ../notes/.
# usage     :
#   python3 gen_notes.py [-o OUT_DIR] [-d]
# parameters:
#   -o/--out-dir (optional, path, default "../notes") - directory for the .html files,
#                resolved relative to this script; created if missing.
#   -d/--debug   (optional, flag, default False) - print each written path to stderr.
# output    : one <slug>.html per entry in POSTS; prints "wrote N notes" to stdout.
# return    : exit 0 on success, 1 on write failure, 2 on CLI or POSTS validation failure.
# ref       : plan_md_files/index_plan.md
# --------------------------

import argparse
import html
import os
import re
import sys


# ===== USER DEFAULTS: EDIT THESE VALUES =====
DEFAULT_OUT_DIR = "../notes"   # Output dir for note pages, relative to this script
DEFAULT_DEBUG   = False        # False = quiet; True = print written paths to stderr
# ===========================================


# Each post: slug, title, date (ISO), tags, a mini-markdown body, and the same
# fields in Chinese under "zh" (title, dateline, tags, lede, body).
POSTS = [
    {
        "slug": "macro-placement-fast-repair",
        "title": "Macro placement: fast local repair beats raw wirelength",
        "date": "2026-11-24",
        "dateline": "November 24, 2026",
        "tags": ["placement", "congestion", "legality"],
        "lede": "What a winning macro-placement run taught me about multi-start "
                "search, congestion-aware ranking, and never skipping legality.",
        "body": """
I spent an evening reading through a winning run of a macro-placement challenge,
and the takeaway was not a clever cost function. It was discipline.

## Spend search, not wirelength

The instinct on macro placement is to chase total wirelength: pack the macros,
shrink the nets, call it done. The run that won did something less glamorous and
more effective: it ran a `multi-start` search, kept many candidate floorplans
alive, and ranked them with a congestion-aware score rather than pure wirelength.

> A placement that looks short on paper and routes like a swamp is not a good
> placement. Congestion is the real currency.

## Fast local repair is the engine

The other half was a cheap, fast `local repair` step applied over and over. Instead
of trying to produce a perfect global arrangement in one shot, you take a decent
one and nudge it: shove a macro out of a hotspot, open a channel, re-check. Because
each repair is cheap, you can afford thousands of them across the multi-start pool.

- Generate many starts; do not trust a single seed.
- Rank by congestion and routability, not wirelength alone.
- Repair locally and often; keep the loop tight.

## Legality is not optional

The part that is easy to skip and expensive to skip: `strict legality checks` on
every candidate. Overlaps, off-grid macros, blocked rows - if an illegal placement
slips into your ranking, you will optimize toward a fantasy and lose the hours it
takes to notice. Check legality up front, reject early, and only score what could
actually tape out.

None of this is exotic. It is the same lesson the back end keeps teaching: the
clever cost function matters less than a fast loop, an honest score, and a hard
legality gate you never turn off.
""",
        "zh": {
            "title": "宏单元摆放：快速局部修复比一味压线长更有效",
            "dateline": "2026年11月24日",
            "tags": ["布局", "拥塞", "合法性"],
            "lede": "一次获胜的宏单元摆放方案让我学到的：多起点搜索、按拥塞排序，以及永远不能跳过合法性检查。",
            "body": """
我花了一个晚上通读一份宏单元摆放（macro placement）比赛的获胜方案，最大的收获不是什么巧妙的代价函数，而是纪律。

## 把算力花在搜索上，而不是线长上

做宏单元摆放时，人的本能是追求总线长：把宏单元挤紧、把线网缩短，然后收工。获胜的方案做的事没那么光鲜，却更有效：它跑的是 `multi-start` 多起点搜索，同时保留大量候选布局，并用考虑拥塞的评分来排序，而不是只看线长。

> 纸面上线长很短、一布线就像陷进泥潭的摆放，不是好摆放。拥塞才是真正的硬通货。

## 快速局部修复才是引擎

另一半是一个便宜、快速、反复执行的 `local repair`（局部修复）步骤。与其指望一次就生成完美的全局布局，不如先拿一个还不错的方案，再一点点调整：把宏单元推出热点区域、打通一条通道、重新检查。因为每次修复都很便宜，整个多起点候选池里做上千次也负担得起。

- 多生成几个起点，不要只信一个随机种子。
- 按拥塞和可布线性排序，而不是只看线长。
- 局部修复要勤，迭代循环要短。

## 合法性检查不能省

最容易跳过、跳过代价又最大的一环，是对每个候选都做 `strict legality checks`（严格合法性检查）。重叠、没对齐网格的宏单元、被挡住的行——只要有一个不合法的摆放混进排名，你就会朝着一个幻想去优化，还要白白花上几个小时才发现。先查合法性，尽早淘汰，只给真正能流片的方案打分。

这些都谈不上新奇。后端一再教给我们的还是同一个道理：巧妙的代价函数，远不如快速的迭代循环、诚实的评分，以及一道永远不关的合法性关卡重要。
""",
        },
    },
    {
        "slug": "structuring-eco-work",
        "title": "Structuring complex ECO work around three gates",
        "date": "2026-11-22",
        "dateline": "November 22, 2026",
        "tags": ["ECO", "scripting", "workflow"],
        "lede": "One driver on the fixes, read-only workers for audits, and heavy "
                "review at only three gates.",
        "body": """
Big ECO and script-heavy work falls apart in a predictable way: everything edits
everything, nobody is sure which change caused the new violation, and review either
happens constantly (and slows to a crawl) or never (and ships a mess). Here is the
shape that has worked for me.

## One driver, many read-only workers

There is exactly one `driver` making fixes - one place where edits land, one person
or process that owns the mutation. Around it run `read-only workers`: parallel
search and diff audits that look but never touch. They answer questions ("where else
does this net appear?", "what changed between these two runs?") without adding their
own edits to the pile.

The point is to separate the thing that changes state from the things that only
observe it. When something breaks, you have one suspect, not twelve.

## Heavy review at three gates only

Review is expensive, so spend it where it pays off. Three gates:

- `Plan lock` - before any edit, agree on the plan. After this point the plan is
  the contract; deviations get written down, not improvised.
- `Second repeated error` - the first failure is noise. The *second* time the same
  class of error shows up, stop and review - it means the approach, not the typo,
  is wrong.
- `Final signoff` - the full, careful pass, once, at the end, against the locked
  plan.

Between the gates, let the driver run. Reviewing every intermediate step is how you
turn a two-hour ECO into a two-day one without catching more bugs.

## Why it holds up

This is just the same idea the back-end flow already runs on: a single source of
truth for the mutation, cheap parallel observation around it, and expensive checks
batched at a few well-chosen checkpoints instead of smeared across everything.
""",
        "zh": {
            "title": "复杂 ECO 工作的组织方式：只设三道关卡",
            "dateline": "2026年11月22日",
            "tags": ["ECO", "脚本", "工作流"],
            "lede": "修复只交给一个执行者，审计交给只读的协作者，重量级评审只放在三道关卡上。",
            "body": """
大型 ECO 和重度依赖脚本的工作，崩溃的方式往往可以预料：所有东西都在改所有东西，没人说得清新出现的违例是哪次改动引起的；评审要么时时刻刻都在做（进度慢得像在爬），要么根本不做（最后交出一团乱麻）。下面是对我有效的组织方式。

## 一个执行者，多个只读协作者

负责修复的 `driver`（执行者）只有一个：改动只落在一个地方，只有一个人或一个进程拥有修改权。围绕它运行的是 `read-only workers`（只读协作者）：并行的搜索和差异审计，只看不改。它们负责回答问题（“这条线网还出现在哪里？”“这两次运行之间改了什么？”），但不往改动堆里添加自己的修改。

关键是把改变状态的一方和只观察状态的各方分开。出问题时，你只有一个嫌疑对象，而不是十二个。

## 重量级评审只放在三道关卡

评审很贵，所以要花在回报最高的地方。三道关卡：

- `Plan lock`（方案锁定）：动手修改之前，先就方案达成一致。过了这一点，方案就是契约；偏离方案要记录下来，而不是临场发挥。
- `Second repeated error`（同类错误第二次出现）：第一次失败可以当作噪声。同一类错误*第二次*出现时，就该停下来评审——这说明错的是方法，而不是某个笔误。
- `Final signoff`（最终签核）：最后对照锁定的方案，完整、仔细地过一遍，只做一次。

关卡之间，放手让执行者跑。每个中间步骤都评审，只会把两小时的 ECO 拖成两天，却抓不到更多 bug。

## 为什么它站得住

这其实就是后端流程本身赖以运转的思路：改动只有唯一的真实来源，围绕它做低成本的并行观察，昂贵的检查集中放在几个精心挑选的检查点，而不是摊到每一步。
""",
        },
    },
    {
        "slug": "rtl2gds-timing-closed",
        "title": "RTL2GDS: synthesis is the easy half",
        "date": "2026-11-20",
        "dateline": "November 20, 2026",
        "tags": ["RTL2GDS", "signoff", "timing"],
        "lede": "Getting a clean, timing-closed GDSII out the far side is where most "
                "flows fall apart.",
        "body": """
I keep an eye on the RTL2GDS leaderboards the way some people check sports scores.
The headline number is always "it synthesized" - and that is the easy half.
Synthesizing RTL into a gate-level netlist is a solved-enough problem. Getting a
clean, `timing-closed GDSII` out the far side is where most flows actually fall
apart.

## Where flows break

The gap between "synthesized" and "signed off" is a graveyard of specific failures:

- Setup and hold that pass in isolation but fight each other after CTS.
- Routing congestion that only shows up once the clock tree is real.
- DRC and antenna violations that the netlist never hinted at.
- Timing that closes at the typical corner and explodes at the slow one.

Each of these lives in the physical domain, not the logical one. You cannot see
them from the RTL. They are the reason the back end is a job and not a button.

## What "timing-closed" actually asks

Timing closure is not one check; it is the whole chain holding at once:

- `WNS` and `TNS` clean across every corner and mode, not just the easy one.
- No hold fixes that quietly re-open setup somewhere else.
- A clock tree whose skew and insertion delay the timer actually believes.
- Signoff parasitics, not estimates - the numbers change, sometimes a lot.

## The habit

So when a new flow lands a clean GDSII with timing closed, it is worth more than a
faster synthesis time. Synthesis gets you to the start line. Everything interesting -
and everything hard - happens between placement and signoff.
""",
        "zh": {
            "title": "RTL2GDS：综合只是容易的那一半",
            "dateline": "2026年11月20日",
            "tags": ["RTL2GDS", "签核", "时序"],
            "lede": "真正让大多数流程栽跟头的，是最后拿出一份干净、时序收敛的 GDSII。",
            "body": """
我关注 RTL2GDS 排行榜，就像有些人追体育比分。头条数字永远是“综合通过了”——而那只是容易的一半。把 RTL 综合成门级网表，已经是一个基本解决了的问题。真正让大多数流程栽跟头的，是在另一端拿出一份干净的、`timing-closed GDSII`（时序收敛的 GDSII）。

## 流程会在哪里出问题

从“综合通过”到“签核通过”之间，散落着各种具体的失败：

- 建立时间和保持时间单独看都能过，做完 CTS 之后却互相打架。
- 布线拥塞要等时钟树真正建起来之后才暴露。
- 网表里毫无征兆的 DRC 和天线效应违例。
- 在典型工艺角收敛、到慢速工艺角就崩掉的时序。

这些问题都发生在物理域，而不是逻辑域，从 RTL 里根本看不到。正因为有它们，后端才是一份工作，而不是一个按钮。

## “时序收敛”到底要求什么

时序收敛不是一项检查，而是整条链路同时成立：

- 所有工艺角和工作模式下 `WNS` 与 `TNS` 都干净，而不只是最容易的那一个。
- 没有那种悄悄在别处重新打开建立时间违例的保持时间修复。
- 时钟树的偏斜和插入延迟，时序分析工具真的认可。
- 用签核级的寄生参数，而不是估算值——数字会变，有时变化很大。

## 这个习惯

所以，当一个新流程拿出一份时序收敛的干净 GDSII 时，它的价值远超更快的综合速度。综合只是把你带到起跑线。所有有意思的事——以及所有难的事——都发生在布局和签核之间。
""",
        },
    },
]


def esc(text):
    """HTML-escape a plain string."""
    return html.escape(text, quote=True)


def render_body(markdown):
    """Render the tiny markdown subset to HTML (## h2, paragraphs, - lists, > quote)."""
    lines = markdown.strip("\n").split("\n")
    out = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i].rstrip()
        if not line:
            i += 1
            continue
        if line.startswith("## "):
            out.append("<h2>{}</h2>".format(inline(line[3:].strip())))
            i += 1
        elif line.startswith("- "):
            items = []
            while i < n and lines[i].rstrip().startswith("- "):
                item = [lines[i].strip()[2:].strip()]
                i += 1
                while i < n and lines[i].startswith("  ") and lines[i].strip():
                    item.append(lines[i].strip())
                    i += 1
                items.append("<li>{}</li>".format(inline(" ".join(item))))
            out.append("<ul>\n{}\n</ul>".format("\n".join(items)))
        elif line.startswith("> "):
            quote = []
            while i < n and lines[i].rstrip().startswith("> "):
                quote.append(lines[i].rstrip()[2:].strip())
                i += 1
            out.append("<blockquote>{}</blockquote>".format(inline(" ".join(quote))))
        else:
            para = []
            while i < n and lines[i].strip() and not lines[i].startswith(("## ", "- ", "> ")):
                para.append(lines[i].strip())
                i += 1
            out.append("<p>{}</p>".format(inline(" ".join(para))))
    return "\n".join(out)


def inline(text):
    """Escape, then turn `code` spans into <code> and *x* (outside code) into <em>."""
    escaped = esc(text)
    parts = escaped.split("`")
    rebuilt = []
    for idx, part in enumerate(parts):
        if idx % 2 == 1:
            rebuilt.append("<code>{}</code>".format(part))
        else:
            rebuilt.append(re.sub(r"\*([^*\s][^*]*)\*", r"<em>\1</em>", part))
    return "".join(rebuilt)


PAGE = """<!doctype html>
<html lang="zh-CN" data-lang="zh" data-title-en="{title} - Nolan Pierce">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title_zh} - Nolan Pierce</title>
<meta name="description" content="{lede_zh}">
<meta property="og:title" content="{title_zh}">
<meta property="og:description" content="{lede_zh}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ff5a3c'/%3E%3Cstop offset='1' stop-color='%23c0398f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='url(%23g)'/%3E%3Ctext x='32' y='44' font-family='Space Grotesk,Arial,sans-serif' font-size='34' font-weight='700' text-anchor='middle' fill='%23fff'%3Enp.%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/style.css">
<script src="../assets/prefs.js"></script>
</head>
<body>

<header class="topbar">
  <div class="wrap">
    <a class="brand" href="../"><span class="np">np.</span></a>
    <nav class="navlinks">
      <a href="../#notes"><span lang="zh-CN">笔记</span><span lang="en">notes</span></a>
      <a href="../#repos"><span lang="zh-CN">仓库</span><span lang="en">repos</span></a>
      <a href="../#tools"><span lang="zh-CN">工具</span><span lang="en">tools</span></a>
      <a href="../#about"><span lang="zh-CN">关于</span><span lang="en">about</span></a>
    </nav>
    <div class="right">
      <a href="https://github.com/nolanpix" rel="me">GitHub</a>
      <a href="https://x.com/nolanpierce_lab" rel="me">X</a>
      <button class="pref" type="button" data-pref="lang"><span lang="zh-CN">EN</span><span lang="en">中文</span></button>
      <button class="pref" type="button" data-pref="theme"><svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg><svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg></button>
    </div>
  </div>
</header>

<main class="wrap">
  <article class="post">
    <a class="back" href="../#notes"><span lang="zh-CN">&larr; 全部笔记</span><span lang="en">&larr; all notes</span></a>
    <p class="p-meta mono"><span lang="zh-CN">{dateline_zh} &nbsp;&middot;&nbsp; {tagline_zh}</span><span lang="en">{dateline} &nbsp;&middot;&nbsp; {tagline}</span></p>
    <h1><span lang="zh-CN">{title_zh}</span><span lang="en">{title}</span></h1>
    <div class="p-body" lang="zh-CN">
{body_zh}
    </div>
    <div class="p-body" lang="en">
{body}
    </div>
    <hr class="p-end">
    <p class="back" lang="zh-CN"><a href="../#notes">&larr; 返回笔记列表</a>，或者在 <a href="https://x.com/nolanpierce_lab">X</a> 上关注后续。</p>
    <p class="back" lang="en"><a href="../#notes">&larr; back to notes</a> &nbsp; or follow along on <a href="https://x.com/nolanpierce_lab">X</a>.</p>
  </article>
</main>

<footer class="site">
  <div class="wrap">
    <span>&copy; 2026 Nolan Pierce &middot; <span lang="zh-CN">边做边公开</span><span lang="en">built in public</span></span>
    <span class="sep"></span>
    <a href="https://github.com/nolanpix">GitHub</a>
    <a href="https://x.com/nolanpierce_lab">X / @nolanpierce_lab</a>
  </div>
</footer>

<script defer src="../assets/stats.js"></script>

</body>
</html>
"""


ZH_FIELDS = ("title", "dateline", "tags", "lede", "body")


def check_posts(posts):
    """Return [(slug, field)] for every Chinese field that is missing or empty."""
    return [(post["slug"], field) for post in posts for field in ZH_FIELDS
            if not post.get("zh", {}).get(field)]


def build_parser():
    parser = argparse.ArgumentParser(
        description="Render standalone note pages for nolanpix.github.io.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("-o", "--out-dir", default=DEFAULT_OUT_DIR,
                        help="output dir for .html files, relative to this script")
    parser.add_argument("-d", "--debug", action="store_true", default=DEFAULT_DEBUG,
                        help="print each written path to stderr")
    return parser


def resolve_out_dir(out_dir):
    """Resolve out_dir relative to this script's directory, so cwd does not matter."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, out_dir))


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    target = resolve_out_dir(args.out_dir)
    try:
        os.makedirs(target, exist_ok=True)
    except OSError as error:
        print("[ERROR] main: cannot create {}: {}".format(target, error), file=sys.stderr)
        return 1

    missing = check_posts(POSTS)
    if missing:
        for slug, field in missing:
            print("[ERROR] main: post {} has no Chinese {}".format(slug, field), file=sys.stderr)
        return 2

    written = 0
    for post in POSTS:
        zh = post["zh"]
        tagline = " &middot; ".join(esc(t) for t in post["tags"])
        page = PAGE.format(
            title_zh=esc(zh["title"]),
            lede_zh=esc(zh["lede"]),
            dateline_zh=esc(zh["dateline"]),
            tagline_zh=" &middot; ".join(esc(t) for t in zh["tags"]),
            body_zh=render_body(zh["body"]),
            title=esc(post["title"]),
            lede=esc(post["lede"]),
            dateline=esc(post["dateline"]),
            tagline=tagline,
            body=render_body(post["body"]),
        )
        path = os.path.join(target, post["slug"] + ".html")
        try:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(page)
        except OSError as error:
            print("[ERROR] main: cannot write {}: {}".format(path, error), file=sys.stderr)
            return 1
        written += 1
        if args.debug:
            print("DEBUG wrote {}".format(path), file=sys.stderr)

    print("wrote {} notes to {}".format(written, target))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
