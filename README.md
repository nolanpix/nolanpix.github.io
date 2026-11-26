# nolanpix.github.io

Source for <https://nolanpix.github.io> — the personal site / open notebook of
**Nolan Pierce**, a digital IC physical design engineer (P&R, CTS, STA, signoff).

Static HTML, no build step. Structure:

- `index.html` — home: chip-floorplan hero (site map), latest notes, repos, about.
- `notes/*.html` — individual note pages, generated from `tools/gen_notes.py`.
- `assets/style.css` — shared "tapeout terminal" styles. Dark by default; light theme via
  `data-theme="light"`, or the OS setting when no script runs.
- `assets/prefs.js` — the theme (dark / light) and language (中文 / English) switches.
  Pages carry both languages (`lang="zh-CN"` / `lang="en"` pairs); Chinese is the default
  and the visitor's choice is remembered in localStorage.
- `tools/gen_notes.py` — renders the note pages from an in-file post table. To add a
  post: edit the `POSTS` list and run `python3 tools/gen_notes.py`, then add a matching
  row to the "Latest notes" list in `index.html`.
  Every post needs its Chinese version under `"zh"`; the script refuses to run without it.
- `plan_md_files/index_plan.md` — the design rationale.

Design notes live in `plan_md_files/`.
