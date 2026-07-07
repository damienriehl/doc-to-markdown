---
phase: quick
plan: 260318-cpt
subsystem: file-save
tags: [file-system-access-api, downloads, smart-naming, tdd]
dependency_graph:
  requires: []
  provides: [smart-save-with-picker, date-prefixed-filenames, directory-memory]
  affects: [src/App.jsx]
tech_stack:
  added: []
  patterns: [File System Access API, anchor-click fallback, vi.stubGlobal for browser globals]
key_files:
  created:
    - src/fileSaver.js
    - src/__tests__/fileSaver.test.js
  modified:
    - src/App.jsx
decisions:
  - "Use globalThis.showSaveFilePicker (not window.) for testability — vi.stubGlobal sets on globalThis"
  - "Use vi.stubGlobal('document', ...) not vi.spyOn(document) — document is undefined in Node test env"
  - "Preserve real URL constructor — stubbing URL as plain object breaks Vitest module resolution (new URL(...))"
  - "Export _resetCachedHandleForTest() to reset module-level cachedFileHandle in unit tests"
  - "forceFallback: true for batch All Individual downloads — avoids repeated save dialogs per file"
metrics:
  duration: "7 min"
  completed_date: "2026-03-18"
  tasks_completed: 2
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Quick Task 260318-cpt: Smart File Save with Location Picker and Auto-Naming — Summary

**One-liner:** File System Access API save dialog with date-prefixed smart filenames and session directory memory, replacing all legacy anchor-click downloads in App.jsx.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create fileSaver.js (TDD) | ec5bf4d | src/fileSaver.js, src/__tests__/fileSaver.test.js |
| 2 | Replace all download call sites in App.jsx | 135a1e5 | src/App.jsx |

## Task 3 — Awaiting Human Verification

Task 3 is a `checkpoint:human-verify` requiring browser testing of save dialogs and smart filenames. See checkpoint details below.

## What Was Built

**`src/fileSaver.js`** — new module exporting:
- `smartFilename(type, opts)` — generates `YYYY-MM-DD NN-Slug-Title.md` (chapter), `YYYY-MM-DD 00-index.md` (index), `YYYY-MM-DD 00-complete-book.md` (combined), `YYYY-MM-DD book-title-markdown.zip` (zip)
- `saveFile(filename, content, opts?)` — uses `showSaveFilePicker` in Chromium, falls back to anchor-click; supports `forceFallback: true` for batch downloads; caches chosen directory per session
- `saveBlob(filename, blob)` — same pattern for pre-built Blobs (ZIP files)
- Abort/cancel is silently ignored (no fallback triggered)

**`src/App.jsx`** — updated to:
- Import `saveFile`, `saveBlob`, `smartFilename` from `./fileSaver.js`
- Delete old `downloadFile()` helper function (11 lines removed)
- Replace 5 download call sites: ZIP, combined book, index, individual chapter, batch all-individual
- Batch "All Individual" uses `forceFallback: true` to avoid repeated save dialogs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Avoid replacing URL constructor in tests**

- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** `vi.stubGlobal("URL", {...})` replaced the `URL` constructor with a plain object, breaking Vitest's own module resolution which internally uses `new URL(...)`. This caused "URL is not a constructor" errors in all tests that used the URL stub.
- **Fix:** Used `vi.spyOn(URL, "createObjectURL")` and `vi.spyOn(URL, "revokeObjectURL")` to mock only the specific methods, preserving the `URL` constructor. Used `vi.stubGlobal("document", mockDoc)` for the non-existent `document` global in Node test environment.
- **Files modified:** `src/__tests__/fileSaver.test.js`

**2. [Rule 2 - Missing functionality] Export `_resetCachedHandleForTest` for test isolation**

- **Found during:** Task 1 — the module-level `cachedFileHandle` persisted across test runs within the same module import, corrupting test state.
- **Fix:** Added `export function _resetCachedHandleForTest()` to fileSaver.js; called in `beforeEach` of showSaveFilePicker/saveBlob test suites.
- **Files modified:** `src/fileSaver.js`, `src/__tests__/fileSaver.test.js`

## Test Results

```
Test Files: 6 passed (6)
Tests:      88 passed (88)
```

All existing tests continue to pass. 17 new fileSaver tests added.

## Self-Check

- [x] `src/fileSaver.js` created
- [x] `src/__tests__/fileSaver.test.js` created
- [x] `src/App.jsx` modified — no `downloadFile` references remain
- [x] Commit ec5bf4d exists (Task 1)
- [x] Commit 135a1e5 exists (Task 2)
- [x] All 88 tests pass
