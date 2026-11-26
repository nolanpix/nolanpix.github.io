#!/usr/bin/env python3
"""Checks for gen_notes.py: the short-name table, the contents rail (topics as folding
<details>), the generated home-page notes section, the markdown subset and their guards.
Run: python3 tools/tests/test_gen_notes.py"""
import copy
import json
import os
import re
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import gen_notes  # noqa: E402

INDEX = os.path.join(HERE, "..", "..", "index.html")
fails = []


def check(condition, message):
    if not condition:
        fails.append(message)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def run(tmp, index_text=None):
    """Run main() with every output inside tmp; index.html starts as a copy of the real one (or index_text)."""
    index = os.path.join(tmp, "index.html")
    with open(index, "w", encoding="utf-8") as handle:
        handle.write(read(INDEX) if index_text is None else index_text)
    return gen_notes.main(["-o", os.path.join(tmp, "notes"), "-p", os.path.join(tmp, "pages.json"),
                           "-i", index, "-e", os.path.join(tmp, "404.html")])


def outside_generated(text):
    for start, end in ((gen_notes.RAIL_START, gen_notes.RAIL_END), (gen_notes.NOTES_START, gen_notes.NOTES_END)):
        text = re.sub(re.escape(start) + ".*?" + re.escape(end), "", text, flags=re.S)
    return text


with tempfile.TemporaryDirectory() as tmp:
    code = run(tmp)
    pages = os.path.join(tmp, "pages.json")
    table = json.load(open(pages, encoding="utf-8")) if os.path.exists(pages) else {}
    check(code == 0, "a normal run must exit 0")
    check(sorted(table) == sorted(["/notes/{}.html".format(p["slug"]) for p in gen_notes.POSTS] +
                                  ["/" + t["href"] for t in gen_notes.TOOLS]),
          "pages.json must have exactly one entry per note and per tool")
    check(table.get("/mbti/") == ["MBTI 自测", "MBTI test"], "the MBTI tool keeps MBTI in its short name")
    check(table.get("/notes/riemann-hypothesis-ai-proof.html") == ["黎曼猜想与 AI 证明", "Riemann & AI proof"],
          "the math post has its own short name")
    check(all(len(pair) == 2 and all(pair) for pair in table.values()), "every entry is [zh, en], both non-empty")
    check(all(gen_notes.display_width(name) <= gen_notes.SHORT_MAX for pair in table.values() for name in pair),
          "every short name fits the report column")
    check(len(os.listdir(os.path.join(tmp, "notes"))) == len(gen_notes.POSTS), "one page per note")

    for post in gen_notes.POSTS:
        page = read(os.path.join(tmp, "notes", post["slug"] + ".html"))
        check(page.count('<nav class="rail"') == 1, post["slug"] + ": exactly one rail")
        current = re.findall(r'<a href="([^"]+)" aria-current="page">', page)
        check(current == [post["slug"] + ".html"], post["slug"] + ": only its own link is current, got {}".format(current))
        check('href="../#notes"' in page and 'href="../mbti/"' in page, post["slug"] + ": rail links climb to the root")
        check(page.count('<details class="rail-cat"') == 2, post["slug"] + ": one folding block per topic")
        check('<details class="rail-cat" open><summary><span lang="zh-CN">{}'.format(
            next(c["zh"] for c in gen_notes.CATEGORIES if c["id"] == post["category"])) in page,
              post["slug"] + ": only its own topic starts open")
        check('href="../#cat-{}"'.format(post["category"]) in page, post["slug"] + ": links back to its topic")

    riemann = read(os.path.join(tmp, "notes", "riemann-hypothesis-ai-proof.html"))
    check("<table>" in riemann and "<h3>" in riemann and "<ol>" in riemann and "<strong>" in riemann,
          "the long article renders tables, h3, ordered lists and bold")
    check("**" not in riemann and "__alpoge__" in riemann, "no raw markdown survives, and escaped underscores unescape")

    index = read(os.path.join(tmp, "index.html"))
    check(index.count('<nav class="rail"') == 1 and 'href="mbti/"' in index and 'href="notes/structuring-eco-work.html"' in index,
          "index: the rail sits between the markers with home-relative links")
    check('id="cat-backend"' in index and 'id="cat-math"' in index, "index: notes are grouped by topic")
    check('4 篇 &middot; 2 个主题' in index and '4 posts &middot; 2 topics' in index, "index: the header counts posts and topics")
    check(outside_generated(index) == outside_generated(read(INDEX)), "index: nothing outside the markers changes")
    check(run(tmp, index) == 0 and read(os.path.join(tmp, "index.html")) == index, "index: a second run changes nothing")

    error = read(os.path.join(tmp, "404.html"))
    check('href="../' not in error and 'href="notes/' not in error and 'href="mbti/' not in error,
          "404: no page-relative links (it is served at any missing path)")
    check('href="/assets/style.css"' in error and 'href="/notes/rtl2gds-timing-closed.html"' in error and 'href="/"' in error,
          "404: root-relative stylesheet, rail and home link")
    check('content="noindex"' in error and "stats.js" not in error and "aria-current" not in error,
          "404: noindex, no visit counting, no current page")

check(gen_notes.display_width("ECO 三道关卡") == 12, "CJK characters count as two columns")

many = []
for i in range(7):
    post = copy.deepcopy(next(p for p in gen_notes.POSTS if p["category"] == "backend"))
    post.update(slug="n{}".format(i), date="2026-11-0{}".format(i + 1))
    many.append(post)
rail = gen_notes.rail_html(many, "../", "")
check(re.findall(r'href="(n\d)\.html"', rail) == ["n6", "n5", "n4", "n3", "n2"],
      "each topic lists its newest five notes first")
check("全部 7 篇" in rail and "All 7 posts" in rail and 'href="../#cat-backend"' in rail,
      "older notes sit behind an 'all N' link to their topic")
check('<summary><span lang="zh-CN">数字后端</span><span lang="en">Digital backend</span><span class="n">7</span></summary>' in rail,
      "the topic summary carries its post count")

with tempfile.TemporaryDirectory() as tmp:
    code = run(tmp, read(INDEX).replace(gen_notes.RAIL_END, ""))
    check(code == 1, "index without the rail end marker must exit 1, got {}".format(code))
    check(not os.listdir(os.path.join(tmp, "notes")) and not os.path.exists(os.path.join(tmp, "pages.json"))
          and not os.path.exists(os.path.join(tmp, "404.html")), "index without markers: nothing may be written")

with tempfile.TemporaryDirectory() as tmp:
    code = run(tmp, read(INDEX).replace(gen_notes.NOTES_START, ""))
    check(code == 1, "index without the notes start marker must exit 1, got {}".format(code))
    check(not os.listdir(os.path.join(tmp, "notes")), "index without notes markers: no note page is written")

original = gen_notes.POSTS
for label, mutate, expect in [
    ("missing English short name", lambda p: p.pop("short"), "has no short name"),
    ("missing Chinese short name", lambda p: p["zh"].pop("short"), "has no Chinese short"),
    ("overlong English short name", lambda p: p.update(short="x" * 25), "wider than 24 columns"),
    ("overlong Chinese short name", lambda p: p["zh"].update(short="宏" * 13), "wider than 24 columns"),
    ("unknown topic", lambda p: p.update(category="nope"), "has an unknown category"),
    ("missing body file", lambda p: p.update(body_file="missing.md"), "cannot read its English body"),
]:
    posts = copy.deepcopy(original)
    mutate(posts[0])
    problems = gen_notes.check_posts(posts)
    check(any(expect in text for _, text in problems), "{}: not reported ({})".format(label, problems))
    with tempfile.TemporaryDirectory() as tmp:
        gen_notes.POSTS = posts
        try:
            code = run(tmp)
        finally:
            gen_notes.POSTS = original
        check(code == 2, "{}: must exit 2, got {}".format(label, code))
        check(not os.path.exists(os.path.join(tmp, "pages.json")) and not os.listdir(os.path.join(tmp, "notes"))
              and read(os.path.join(tmp, "index.html")) == read(INDEX), "{}: nothing may be written".format(label))

print("FAILED:\n  " + "\n  ".join(fails) if fails else "OK")
raise SystemExit(1 if fails else 0)
