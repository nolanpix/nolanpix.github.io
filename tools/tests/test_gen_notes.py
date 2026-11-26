#!/usr/bin/env python3
"""Checks for gen_notes.py: the short-name table and its guards. Run: python3 tools/tests/test_gen_notes.py"""
import copy
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import gen_notes  # noqa: E402

fails = []


def check(condition, message):
    if not condition:
        fails.append(message)


with tempfile.TemporaryDirectory() as tmp:
    pages = os.path.join(tmp, "pages.json")
    code = gen_notes.main(["-o", os.path.join(tmp, "notes"), "-p", pages])
    table = json.load(open(pages, encoding="utf-8")) if os.path.exists(pages) else {}
    check(code == 0, "a normal run must exit 0")
    check(sorted(table) == sorted("/notes/{}.html".format(p["slug"]) for p in gen_notes.POSTS),
          "pages.json must have exactly one entry per note")
    check(all(len(pair) == 2 and all(pair) for pair in table.values()), "every entry is [zh, en], both non-empty")
    check(all(gen_notes.display_width(name) <= gen_notes.SHORT_MAX for pair in table.values() for name in pair),
          "every short name fits the report column")
    check(len(os.listdir(os.path.join(tmp, "notes"))) == len(gen_notes.POSTS), "one page per note")

check(gen_notes.display_width("ECO 三道关卡") == 12, "CJK characters count as two columns")

original = gen_notes.POSTS
for label, mutate, expect in [
    ("missing English short name", lambda p: p.pop("short"), "has no short name"),
    ("missing Chinese short name", lambda p: p["zh"].pop("short"), "has no Chinese short"),
    ("overlong English short name", lambda p: p.update(short="x" * 25), "wider than 24 columns"),
    ("overlong Chinese short name", lambda p: p["zh"].update(short="宏" * 13), "wider than 24 columns"),
]:
    posts = copy.deepcopy(original)
    mutate(posts[0])
    problems = gen_notes.check_posts(posts)
    check(any(expect in text for _, text in problems), "{}: not reported ({})".format(label, problems))
    with tempfile.TemporaryDirectory() as tmp:
        gen_notes.POSTS = posts
        try:
            code = gen_notes.main(["-o", os.path.join(tmp, "notes"), "-p", os.path.join(tmp, "pages.json")])
        finally:
            gen_notes.POSTS = original
        check(code == 2, "{}: must exit 2, got {}".format(label, code))
        check(not os.path.exists(os.path.join(tmp, "pages.json")) and not os.listdir(os.path.join(tmp, "notes")),
              "{}: nothing may be written".format(label))

print("FAILED:\n  " + "\n  ".join(fails) if fails else "OK")
raise SystemExit(1 if fails else 0)
