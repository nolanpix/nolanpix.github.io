#!/usr/bin/env python3
# --------------------------
# author    : nolan pierce
# date      : 2026/11/25
# label     : site_generator
# descrip   : Render the standalone note pages for nolanpix.github.io from a small
#             in-file POSTS table, so every article shares one HTML shell and new
#             posts are added by editing one list. Body text is a tiny subset of
#             Markdown (## heading, blank-line paragraphs, - bullets, > quote,
#             `code`). Output files are written next to this script under ../notes/.
# usage     :
#   python3 gen_notes.py [-o OUT_DIR] [-d]
# parameters:
#   -o/--out-dir (optional, path, default "../notes") - directory for the .html files,
#                resolved relative to this script; created if missing.
#   -d/--debug   (optional, flag, default False) - print each written path to stderr.
# output    : one <slug>.html per entry in POSTS; prints "wrote N notes" to stdout.
# return    : exit 0 on success, 1 on write failure, 2 on CLI validation failure.
# ref       : plan_md_files/index_plan.md
# --------------------------

import argparse
import html
import os
import sys


# ===== USER DEFAULTS: EDIT THESE VALUES =====
DEFAULT_OUT_DIR = "../notes"   # Output dir for note pages, relative to this script
DEFAULT_DEBUG   = False        # False = quiet; True = print written paths to stderr
# ===========================================


# Each post: slug, title, date (ISO), tags, and a mini-markdown body.
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
                items.append("<li>{}</li>".format(inline(lines[i].rstrip()[2:].strip())))
                i += 1
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
    """Escape, then turn `code` spans into <code>. Order matters: escape first."""
    escaped = esc(text)
    parts = escaped.split("`")
    rebuilt = []
    for idx, part in enumerate(parts):
        if idx % 2 == 1:
            rebuilt.append("<code>{}</code>".format(part))
        else:
            rebuilt.append(part)
    return "".join(rebuilt)


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} - Nolan Pierce</title>
<meta name="description" content="{lede}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{lede}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ff5a3c'/%3E%3Cstop offset='1' stop-color='%23c0398f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='url(%23g)'/%3E%3Ctext x='32' y='44' font-family='Space Grotesk,Arial,sans-serif' font-size='34' font-weight='700' text-anchor='middle' fill='%23fff'%3Enp.%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>

<header class="topbar">
  <div class="wrap">
    <a class="brand" href="../"><span class="np">np.</span></a>
    <nav class="navlinks">
      <a href="../#notes">notes</a>
      <a href="../#repos">repos</a>
      <a href="../#tools">tools</a>
      <a href="../#about">about</a>
    </nav>
    <div class="right">
      <a href="https://github.com/nolanpix" rel="me">GitHub</a>
      <a href="https://x.com/nolanpierce_lab" rel="me">X</a>
    </div>
  </div>
</header>

<main class="wrap">
  <article class="post">
    <a class="back" href="../#notes">&larr; all notes</a>
    <p class="p-meta mono">{dateline} &nbsp;&middot;&nbsp; {tagline}</p>
    <h1>{title}</h1>
    <div class="p-body">
{body}
    </div>
    <hr class="p-end">
    <p class="back"><a href="../#notes">&larr; back to notes</a> &nbsp; or follow along on <a href="https://x.com/nolanpierce_lab">X</a>.</p>
  </article>
</main>

<footer class="site">
  <div class="wrap">
    <span>&copy; 2026 Nolan Pierce &middot; built in public</span>
    <span class="sep"></span>
    <a href="https://github.com/nolanpix">GitHub</a>
    <a href="https://x.com/nolanpierce_lab">X / @nolanpierce_lab</a>
  </div>
</footer>

<script defer src="../assets/stats.js"></script>

</body>
</html>
"""


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

    written = 0
    for post in POSTS:
        tagline = " &middot; ".join(esc(t) for t in post["tags"])
        page = PAGE.format(
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
