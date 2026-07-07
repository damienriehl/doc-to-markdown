---
phase: 01-storage-foundation
plan: "02"
subsystem: storage
tags: [indexeddb, dexie, fake-indexeddb, vitest, tdd, blob-storage, localStorage]

# Dependency graph
requires:
  - phase: 01-storage-foundation/01-01
    provides: "projectRecord and blobs shapes from serializeProject/deserializeProject"
provides:
  - "Dexie singleton with DB_VERSION=1, onversionchange/blocked handlers"
  - "putProject/getProject/listProjects/deleteProject (project CRUD)"
  - "putFiles/getFiles (blob storage with bulkPut and File reconstruction)"
  - "requestPersistentStorage (navigator.storage.persist wrapper, never throws)"
  - "saveLastProjectId/getLastProjectId (localStorage round-trip)"
  - "QuotaExceededError caught in putProject and putFiles with user-friendly message"
  - "deleteProject cascades to file blobs in a single rw transaction"
affects:
  - 01-03-PLAN (server save path will co-exist with this IDB layer)
  - 02-project-switcher (useProjectStore hook will call all 9 exports here)

# Tech tracking
tech-stack:
  added:
    - "dexie@4.3.0 (production dependency — IndexedDB ORM)"
    - "fake-indexeddb@6.2.5 (dev dependency — mock IndexedDB for Vitest node env)"
  patterns:
    - "Dexie singleton pattern: getDb() lazy init with module-level _db variable"
    - "TDD RED/GREEN commit split: test file committed before implementation"
    - "localStorage mock via vi.stubGlobal() for Vitest node environment"
    - "bulkPut for batch file writes (one transaction, not N)"
    - "File reconstruction: new File([rec.blob], rec.name, { type, lastModified })"

key-files:
  created:
    - src/projectDb.js
    - src/__tests__/projectDb.test.js
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "localStorage mock via vi.stubGlobal() — Node 25's built-in localStorage stub has no setItem/getItem; using vi.stubGlobal avoids installing jsdom just for this test"
  - "db.close() called in onversionchange handler — prevents silent two-tab hang during schema upgrades"
  - "bulkPut used in putFiles — one transaction for N blobs, not N transactions"
  - "LAST_PROJECT_KEY constant scoped to module — doc-to-markdown:lastProjectId avoids localStorage key collisions"
  - "_resetDbForTest() closes + deletes the Dexie DB instance and sets _db=null — required because fake-indexeddb shares state across test files"

patterns-established:
  - "JSDoc @param/@returns on all exported functions following serverApi.js convention"
  - "Section separators: // --- Constants --- // --- Singleton --- // --- Project CRUD --- // --- File Blob Storage --- // --- Storage Persistence --- // --- Last Active Project ---"
  - "QuotaExceededError catch pattern: check err.name === 'QuotaExceededError', rethrow with user-friendly message, then rethrow original for all other errors"

requirements-completed: [STOR-01, STOR-02, STOR-03, STOR-04]

# Metrics
duration: 4min
completed: 2026-03-17
---

# Phase 1 Plan 02: Project DB Summary

**Dexie IndexedDB layer with project CRUD, blob storage via bulkPut, File reconstruction, QuotaExceededError handling, and 12-test TDD coverage using fake-indexeddb**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-17T15:17:34Z
- **Completed:** 2026-03-17T15:21:31Z
- **Tasks:** 3 commits (chore + test RED + feat GREEN)
- **Files modified:** 4

## Accomplishments

- Installed dexie@4.3.0 and fake-indexeddb@6.2.5 without breaking the existing 24-test suite
- Implemented full Dexie persistence layer with onversionchange/blocked handlers, CRUD, blob storage, localStorage pointer, and QuotaExceededError handling
- 12 unit tests prove all behaviors including Map-keyed File retrieval, cascade delete, upsert, sort order, and localStorage round-trip
- Full suite now 36/36 green (4 test files)

## Task Commits

1. **Task 1: Install dexie and fake-indexeddb** — `9956381` (chore)
2. **Task 2: Create projectDb.test.js (RED phase)** — `16e8eb2` (test)
3. **Task 2: Implement projectDb.js (GREEN phase)** — `3f48674` (feat)

_TDD plan: test file committed first in RED, implementation committed in GREEN_

## Files Created/Modified

- `/home/damienriehl/Coding Projects/doc-to-markdown/src/projectDb.js` — Dexie singleton + 9 exported functions (putProject, getProject, listProjects, deleteProject, putFiles, getFiles, requestPersistentStorage, saveLastProjectId, getLastProjectId) + test helper _resetDbForTest
- `/home/damienriehl/Coding Projects/doc-to-markdown/src/__tests__/projectDb.test.js` — 12 test cases with vi.stubGlobal localStorage mock
- `/home/damienriehl/Coding Projects/doc-to-markdown/package.json` — dexie in dependencies, fake-indexeddb in devDependencies
- `/home/damienriehl/Coding Projects/doc-to-markdown/package-lock.json` — lockfile updated

## Decisions Made

- `vi.stubGlobal("localStorage", localStorageMock)` — Node 25's built-in localStorage is a non-functional stub with no setItem/getItem. Rather than installing jsdom (a large dependency), a minimal in-memory Map-backed mock is created per-test-file with vi.stubGlobal. This keeps the test environment lean while providing accurate localStorage semantics.
- `_resetDbForTest()` calls both `_db.close()` and `await _db.delete()` before nulling `_db` — without the delete, fake-indexeddb retains data across beforeEach calls between tests, causing isolation failures.
- `bulkPut` chosen over loop of `put()` calls — single transaction, lower overhead, matches the research recommendation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] localStorage mock required for Vitest node environment**
- **Found during:** Task 2 (GREEN phase — first test run)
- **Issue:** Vitest's default `node` environment uses Node 25's experimental `localStorage` stub, which provides only an empty object with no `setItem`/`getItem`/`clear` methods. All localStorage tests failed with `TypeError: localStorage.setItem is not a function`.
- **Fix:** Added `vi.stubGlobal("localStorage", localStorageMock)` at the top of `projectDb.test.js`, where `localStorageMock` is a minimal Map-backed implementation. Also cleared the mock in `beforeEach` via `localStorage.clear()`.
- **Files modified:** `src/__tests__/projectDb.test.js`
- **Verification:** All 12 tests pass including `saveLastProjectId`/`getLastProjectId` round-trip.
- **Committed in:** `3f48674` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking)
**Impact on plan:** Required to make localStorage tests runnable in the Vitest node environment. No scope creep — the production `projectDb.js` code is unchanged; the mock is test infrastructure only.

## Issues Encountered

None in the production code. The localStorage environment mismatch was caught immediately on first test run and fixed inline before the GREEN commit.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `src/projectDb.js` exports the complete storage API: `putProject`, `getProject`, `listProjects`, `deleteProject`, `putFiles`, `getFiles`, `requestPersistentStorage`, `saveLastProjectId`, `getLastProjectId`
- Phase 2's `useProjectStore.js` hook can import all 9 functions directly
- The `blobs` contract (`{ id, file, name }`) from Plan 01-01 is fully consumed by `putFiles`
- The `projectRecord` contract from Plan 01-01 is fully consumed by `putProject`
- Both Phase 1 plans complete — Phase 1 storage foundation is done

---
*Phase: 01-storage-foundation*
*Completed: 2026-03-17*

## Self-Check: PASSED

All files exist, all commits confirmed, all acceptance criteria verified:
- src/projectDb.js — FOUND
- src/__tests__/projectDb.test.js — FOUND (12 it() cases)
- 01-02-SUMMARY.md — FOUND
- Commits 9956381, 16e8eb2, 3f48674 — FOUND
- import Dexie, DB_VERSION=1, db.version().stores(), projects/files schemas, versionchange/blocked handlers, QuotaExceededError, bulkPut, File reconstruction, LAST_PROJECT_KEY, fake-indexeddb/auto — ALL FOUND
