---
title: "feat: Scaffold Vite + React Web App for RAG Converter"
type: feat
status: active
date: 2026-03-15
---

# feat: Scaffold Vite + React Web App for RAG Converter

## Overview

Turn the existing `rag-converter-app.jsx` (870-line React component with complete DOCX→Markdown conversion logic) into a runnable, polished web application using Vite + React. The app is entirely client-side — no server needed for DOCX conversion.

## Problem Statement / Motivation

The JSX component contains all the conversion logic (mammoth.js DOCX→HTML, HTML→Markdown, artifact cleanup, heading normalization, YAML front matter, index generation) but has no build tooling, no `index.html`, and no `package.json`. It cannot run.

## Proposed Solution

Minimal Vite + React scaffolding around the existing component, plus a design polish pass to meet the "distinctive, not generic" standard.

## Implementation Plan

### Phase 1: Make It Run

**New files to create:**

1. **`package.json`** — Vite + React + mammoth dependencies
   - `react` ^19.1.0, `react-dom` ^19.1.0, `mammoth` ^1.9.0
   - `vite` ^6.3.0, `@vitejs/plugin-react` ^4.4.0 (devDeps)
   - Dev server port: **9377** (deterministic hash of "doc-to-markdown")

2. **`vite.config.js`** — Minimal: react plugin, port 9377, `dist/` output

3. **`index.html`** (project root, Vite convention)
   - Move Google Fonts `<link>` here (currently inline in JSX line 786)
   - `<link rel="preconnect">` for fonts.googleapis.com
   - Base CSS: `box-sizing: border-box`, `body { background: #faf9f7 }`, font smoothing
   - Mount point: `<div id="root">`
   - Entry: `<script type="module" src="/src/main.jsx">`

4. **`src/main.jsx`** — Mount `RAGConverter` into `#root` with `StrictMode`

5. **`src/App.jsx`** — Copy of `rag-converter-app.jsx` with one change:
   - Remove the Google Fonts `<link>` tag from line 786 (moved to `index.html`)

6. **`.gitignore`** — `node_modules/`, `dist/`, `*.local`

7. **`public/favicon.svg`** — Simple document/markdown icon

**Run:** `npm install` → `npm run dev` → verify at `http://localhost:9377`

### Phase 2: UX Improvements (in `src/App.jsx`)

8. **Smart chapter number inference from filenames** — add `inferChapterInfo(filename)` utility and update `addFiles`:

   **Multi-strategy parser** (tried in priority order):
   | # | Strategy | Examples | Regex |
   |---|----------|----------|-------|
   | 1 | Explicit chapter marker | `CH1`, `Ch01`, `Chapter 3`, `Chap_04` | `/ch(?:ap(?:ter)?)?[\s._-]*(\d+)/i` |
   | 2 | Part/Section/Unit marker | `Part 2`, `Section 3`, `Unit 4` | `/(?:part|section|unit)[\s._-]*(\d+)/i` |
   | 3 | Roman numerals | `Chapter IV`, `Ch.XII` | `/ch(?:ap(?:ter)?)?[\s._-]*(i{1,3}|iv|vi{0,3}|ix|xi{0,3}|xiv|xv)/i` → convert |
   | 4 | Word numbers (1–20) | `Chapter One`, `Chapter Twelve` | lookup map: `{one:1, two:2, ... twenty:20}` |
   | 5 | Ordinals | `1st Chapter`, `3rd` | `/(\d+)(?:st|nd|rd|th)\b/i` |
   | 6 | Leading digits | `01-intro.docx`, `3_evidence.docx` | `/^(\d+)[\s._-]/` |
   | 7 | Trailing digits | `intro-01.docx`, `evidence_3.docx` | `/[\s._-](\d+)$/` |

   **Noise stripping** (applied before parsing):
   - Remove file extension
   - Strip common suffixes: `_FINAL`, `_final`, `_v2`, `_draft`, `_DRAFT`, `(revised)`, `_rev`, `_copy`

   **Batch consensus** (applied across all files in a single upload):
   - Try each strategy on all files; pick the strategy that matches the most files
   - Use that strategy's results for all files it matched; fall back to next-best for unmatched
   - If no strategy matches any file, assign sequential numbers

   **Title derivation:**
   - Strip the matched chapter prefix/suffix from the filename
   - Clean separators (`_`, `-`) → spaces, title-case the result

   **Integration with `addFiles`:**
   - Run `inferChapterInfo` on all uploaded files
   - Auto-sort by inferred chapter number
   - Set `chapterNum` and derived `title`/`slug` from the parser output

9. **Replace ↑/↓ buttons with drag-and-drop reordering** — HTML5 native drag events (no library):
   - Add `draggable` attribute to `ChapterRow` collapsed header div
   - `onDragStart`: store source index via `dataTransfer.setData`
   - `onDragOver`: show drop indicator (top or bottom border highlight based on cursor position)
   - `onDrop`: reorder the chapters array, recalculate `chapterNum` sequence
   - Keep ↑/↓ buttons as secondary keyboard-accessible fallback (smaller, less prominent)

### Phase 3: Design Polish

10. **`src/index.css`** — Global styles imported in `main.jsx`:
    - CSS reset (box-sizing, margins)
    - Background texture: subtle CSS noise grain overlay (tiny base64 PNG, low opacity) on body
    - Custom scrollbar styles for preview modal
    - Focus ring styles (`:focus-visible` with accent box-shadow) for accessibility
    - Smooth transitions for buttons and file rows on hover
    - Responsive media queries for mobile (stack the grid layouts below 640px)

11. **Enhancements in `src/App.jsx`:**
    - Fade-in animation on chapter rows
    - Smooth expand/collapse for chapter detail panels
    - Button hover state color shifts
    - Subtle shadow on cards

### Phase 4: Verify and Build

12. Test full workflow: Upload DOCX → Configure → Convert → Preview → Download All
13. Verify chapter number auto-detection from filenames (CH1, Chapter_02, 03-slug, etc.)
14. Verify drag-and-drop reordering works + ↑/↓ keyboard fallback
15. Test PDF notice (should show warning pointing to CLI)
16. Test preview modal open/close
17. `npm run build` → verify `dist/` is clean
18. `npm run preview` → verify production build at port 9377
19. Visual verification via browser screenshot

## File Structure After Implementation

```
doc-to-markdown/
  package.json              (NEW)
  vite.config.js            (NEW)
  index.html                (NEW)
  .gitignore                (NEW)
  src/
    main.jsx                (NEW)
    App.jsx                 (NEW - adapted from rag-converter-app.jsx)
    index.css               (NEW - global styles, textures, animations)
  public/
    favicon.svg             (NEW)
  dist/                     (generated by build)
  rag-converter-app.jsx     (EXISTING - original reference)
  convert.py                (EXISTING - CLI toolkit)
  postprocess.py            (EXISTING)
  generate_index.py         (EXISTING)
  validate.py               (EXISTING)
  chapters.yaml             (EXISTING)
  setup.sh                  (EXISTING)
```

## Technical Considerations

- **mammoth.js bundle size** (~400KB): Vite should tree-shake Node.js polyfills. If bundle is too large, dynamic `import()` can lazy-load it. Try simple import first.
- **`crypto.randomUUID()`**: Requires secure context (HTTPS or localhost). Vite dev server satisfies this. Production must be HTTPS.
- **No refactoring of JSX into multiple files**: 870 lines with clear section separators is manageable. Split only if features are added later.
- **Keep original `rag-converter-app.jsx`** at project root as the reference artifact.

## Acceptance Criteria

- [ ] `npm run dev` serves the app at `http://localhost:9377`
- [ ] DOCX files convert correctly via drag-and-drop upload
- [ ] PDF files show the "use CLI" notice
- [ ] Book title/author persist across steps
- [ ] Chapter configuration (title, slug, topics, key terms) works with Enter-to-add tags
- [ ] Chapter numbers auto-inferred from filenames (CH1, Chapter_02, 03-slug, Part IV, Chapter One, etc.)
- [ ] Files auto-sorted by inferred chapter number on upload
- [ ] Drag-and-drop reordering works in Configure step
- [ ] ↑/↓ keyboard fallback reordering still works
- [ ] Preview modal shows converted Markdown
- [ ] Download All exports numbered chapter files + `00-index.md`
- [ ] YAML front matter includes title, chapter, book, author, topics, key_terms, converted_date
- [ ] Heading normalization strips first H1 and shifts levels
- [ ] Artifact cleanup removes stray escapes, smart quotes, Pandoc attributes
- [ ] Design is polished: textured background, smooth transitions, focus states, responsive layout
- [ ] `npm run build` produces working production bundle in `dist/`

## Critical Files

- `rag-converter-app.jsx` — Source component (adapt into `src/App.jsx`)
- `postprocess.py` — Reference for cleanup regex patterns (already replicated in JSX)
- `generate_index.py` — Reference for index structure (already replicated in JSX)
- `chapters.yaml` — Reference for metadata schema
