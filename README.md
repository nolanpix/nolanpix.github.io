# nolanpix.github.io

Source for <https://nolanpix.github.io> — the personal site / open notebook of
**Nolan Pierce**, a digital IC physical design engineer (P&R, CTS, STA, signoff).

Static HTML, no build step. Structure:

- `index.html` — home: chip-floorplan hero (site map), latest notes, repos, about.
- `notes/*.html` — individual note pages, generated from `tools/gen_notes.py`.
- `assets/style.css` — shared "tapeout terminal" styles (dark-first, light mode via
  `prefers-color-scheme`).
- `tools/gen_notes.py` — renders the note pages from an in-file post table. To add a
  post: edit the `POSTS` list and run `python3 tools/gen_notes.py`, then add a matching
  row to the "Latest notes" list in `index.html`.
- `plan_md_files/index_plan.md` — the design rationale.

Design notes live in `plan_md_files/`.
