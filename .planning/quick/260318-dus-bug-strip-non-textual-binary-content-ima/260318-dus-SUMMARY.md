---
phase: quick-260318-dus
plan: 01
subsystem: conversion-pipeline
tags: [bug-fix, rag-optimization, image-stripping, browser-pipeline, python-pipeline]
dependency_graph:
  requires: []
  provides: [image-embed-stripping]
  affects: [src/App.jsx, postprocess.py]
tech_stack:
  added: [src/stripImages.js]
  patterns: [utility-extraction, belt-and-suspenders, ordered-regex-pipeline]
key_files:
  created:
    - src/stripImages.js
    - src/__tests__/stripBinaryContent.test.js
  modified:
    - src/App.jsx
    - postprocess.py
decisions:
  - Image stripping moved before empty-link cluster regex in PostProcessor.clean() — the empty-link regex [^)]* is greedy and swallows data: URIs, breaking no-alt detection
  - stripImageEmbeds extracted to standalone utility (src/stripImages.js) for testability — App.jsx functions are module-private
  - img handler strips at HTML-to-MD parse time (htmlToMarkdown) + cleanMarkdown as belt-and-suspenders for server-converted output
metrics:
  duration: ~8 minutes
  completed_date: "2026-03-18"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Quick Task 260318-DUS: Strip Non-Textual Binary Content (Images) Summary

**One-liner:** Regex-based image stripping across both browser and Python pipelines replaces base64 data URIs and Pandoc `media/` references with `[Image: alt]` placeholders to eliminate RAG context window bloat.

## What Was Built

Binary image content (base64 data URIs from mammoth DOCX conversion, Pandoc `media/` directory references) now gets stripped from markdown output across all conversion paths. Alt text is preserved as `[Image: alt]` placeholders; images without alt text become `[Image removed]`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add image stripping to browser-side pipeline (App.jsx) with tests | f5050c4 | src/stripImages.js, src/__tests__/stripBinaryContent.test.js, src/App.jsx |
| 2 | Add image stripping to Python-side PostProcessor.clean() | 1f43762 | postprocess.py |

## Implementation Details

### Browser Pipeline (Task 1)

- `src/stripImages.js` — exported `stripImageEmbeds(md)` utility with two regexes:
  - `!/\[([^\]]*)\]\(data:[^)]+\)/g` — strips all `data:` URI embeds (images, audio, any MIME)
  - `!/\[([^\]]*)\]\(media\/[^)]+\)/g` — strips Pandoc `media/` directory references
- `src/App.jsx htmlToMarkdown() img case` — inline check at HTML-to-MD parse time: `if (/^data:|^media\//i.test(src))` returns placeholder instead of embedding the binary
- `src/App.jsx cleanMarkdown()` — calls `stripImageEmbeds(t)` as belt-and-suspenders after all other cleanup, catches any remaining embeds from server-converted markdown

### Python Pipeline (Task 2)

- `postprocess.py PostProcessor.clean()` — two `re.sub()` calls with lambda replacements added before the empty-link cluster regex
- Both pipelines use identical logic: alt text preserved when non-empty, `[Image removed]` when empty

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Python regex ordering conflict with empty-link cluster stripper**

- **Found during:** Task 2 verification
- **Issue:** The `re.sub(r"(\[\]\(#?[^)]*\))+", "", text)` empty-link regex runs before image stripping and matches `[](data:image/jpeg;base64,...)` — the `[^)]*` greedily consumes the entire data URI, stripping the whole image tag before our regex can replace it with `[Image removed]`
- **Fix:** Moved image stripping regexes to run before the empty-link cluster regex in `PostProcessor.clean()`, with an explanatory comment
- **Files modified:** postprocess.py
- **Commit:** 1f43762

## Verification

- All 8 JS behavior tests pass (`npx vitest run src/__tests__/stripBinaryContent.test.js`)
- Full test suite: 96 tests pass, 0 failures (`npx vitest run`)
- Python inline verification: 6 assertions pass (base64 with/without alt, media/ with/without alt, LaTeX safety, external URL preservation)

## Self-Check

### Files created:
- /home/damienriehl/Coding Projects/doc-to-markdown/src/stripImages.js — FOUND
- /home/damienriehl/Coding Projects/doc-to-markdown/src/__tests__/stripBinaryContent.test.js — FOUND

### Commits:
- f5050c4 — FOUND
- 1f43762 — FOUND

## Self-Check: PASSED
