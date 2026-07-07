---
status: complete
phase: 04-export-import
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md]
started: 2026-04-03T22:00:00Z
updated: 2026-07-07T12:40:00Z
verified_by: "Fable (browser-driven UAT campaign, chrome-devtools MCP)"
---

## Current Test

number: complete
name: All manual UAT cases executed
expected: |
  All 11 cases pass through the real UI on the Vite dev build (port 9377).
  Export ZIPs verified by real-tool unzip; round-trip verified by byte-compare.
awaiting: none

## Tests

### 1. Export hover icon appears on project cards
expected: Hover over a non-active project card in the project list. Three icons should appear: pencil (rename), download arrow (export), and trash (delete).
result: pass
evidence: shots/01-hover-icons.png — hovering "Trialbook Alpha" reveals all 3 icons (action container opacity 1, pointerEvents auto).

### 2. Export dropdown shows two modes
expected: Click the download arrow (export) icon on a project card. A dropdown appears with two options: "Full project" and "Outputs only". Clicking outside the dropdown dismisses it.
result: pass
evidence: shots/02-export-dropdown.png — dropdown shows both modes; mousedown outside dismisses it (verified after React re-render).

### 3. Full project export downloads ZIP
expected: Click "Full project". A ZIP downloads containing project.json at root, a sources/ folder with originals, and an outputs/ folder with generated Markdown.
result: pass
evidence: Captured export blob (3626 B); `unzip -l` shows project.json (root), sources/01-jury-selection.txt, sources/02-opening-statements.txt, outputs/01-*.md, outputs/02-*.md, outputs/00-index.md.

### 4. Outputs-only export downloads ZIP
expected: Click "Outputs only". A ZIP downloads containing only .md files at the root level (no folders, no project.json, no source files).
result: pass
evidence: Captured export blob (1423 B); zipfile shows exactly [01-jury-selection.md, 02-opening-statements.md, 00-index.md] — all_md_at_root=True, has_project_json=False, has_folders=False.

### 5. Export spinner during download
expected: While an export is processing, the export icon shows a spinning animation, then returns to normal.
result: pass
evidence: MutationObserver on the export button caught the spinner SVG (circle[stroke-dasharray], animation:spin) rendering during handleExport; icon reverts after completion.

### 6. Import button visible in project list
expected: Below the project cards, an "Import project" button is visible (not hover-gated — always shown).
result: pass
evidence: shots/01-hover-icons.png / a11y snapshot — "Import project" button present unconditionally in expanded list.

### 7. Import from ZIP creates new project
expected: Click "Import project", select a previously exported ZIP. The project appears with its original name, opens immediately, all files/outputs restored.
result: pass
evidence: Imported a non-colliding full ZIP ("Trialbook Imported") via the real file input (change event) → appears with original name, 2 chapters, 2 restored outputs, source blobs restored.

### 8. Import name collision auto-renames
expected: Import a ZIP with the same project name as an existing project. The imported project appears with " (2)" appended (no overwrite, no prompt).
result: pass
evidence: shots/11-collision-roundtrip.png — importing "Trialbook Alpha" twice yields "Trialbook Alpha (2)" and "Trialbook Alpha (3)"; original retained.

### 9. Import status feedback
expected: During import, "Importing..." appears; on success, "Project imported successfully." (green) auto-clears after ~3s; on error, a red message appears.
result: pass
evidence: Captured status transitions: "Importing..." (muted rgb(138,132,120)) → "Project imported successfully." (green rgb(16,185,129)=#10b981). Error path is red (see Test 10).

### 10. Import rejects invalid ZIP
expected: Try importing a non-ZIP file or a ZIP without project.json or .md. An error message appears and no project is created.
result: pass
evidence: (a) non-ZIP → red error rgb(220,38,38), no project created. (b) ZIP with only readme.txt → "Unrecognized ZIP format: expected project.json or .md files." (red), no project created. UX note below.

### 11. Export-import round trip
expected: Export a project as "Full project", then import the exported ZIP. The imported project has the same chapters, outputs, and settings as the original.
result: pass
evidence: BYTE-COMPARE — re-exporting the imported copy yields sources/* and outputs/* that are byte-identical to the original export (all 5 payload files match); project.json content-equal ignoring volatile id/name/timestamps/blobIds. Verified only after the data-loss fix below.

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0
blocked: 0

## Fixes applied during UAT

- **[DATA-LOSS BUG — fixed] importProject reused embedded blobIds → stole source files.**
  The IndexedDB `files` store is keyed by `blobId`. `importProject` preserved the
  chapter `blobId`s embedded in `project.json`, so importing a project whose blobIds
  already existed in the DB (e.g. re-importing an export of an existing project)
  caused `putFiles` (bulkPut) to overwrite the existing blob records and re-parent
  them to the newly imported project — silently deleting the original project's
  source files. Confirmed live: after two imports, both the original and the first
  import showed 0 stored source blobs.
  **Fix:** `importProject` now regenerates a fresh `blobId` (and chapter `id`) for
  every chapter on import, mirroring the fresh project id it already assigns.
  Regression test added: `exportImport.test.js` Test 11 (blobId isolation). Full
  suite 120/120 green. Post-fix live re-run: all 4 projects retain their own blobs.

## Gaps

- **[minor UX]** The non-ZIP import error surfaces JSZip's raw internal message
  ("Can't find end of central directory : is this a zip file ? If it is, see
  https://…"). Functionally correct (red, no project created) but developer-facing.
  Recommend mapping unrecognized-archive failures to a friendly message such as
  "That file isn't a valid GlowNote/RAG project ZIP." Logged as a follow-up, not a
  blocker.
