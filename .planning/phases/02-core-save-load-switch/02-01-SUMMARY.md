---
phase: 02-core-save-load-switch
plan: "01"
subsystem: database
tags: [react, indexeddb, dexie, persistence, hooks, tdd, vitest]

# Dependency graph
requires:
  - phase: 01-storage-foundation
    provides: projectDb.js (IDB layer), projectSerializer.js (serialize/deserialize contract)
provides:
  - useProjectStore hook with save, load, switchProject, confirmSwitch, cancelSwitch, newProject
  - buildSnapshot exported helper for stable dirty-detection without transient fields
  - Boot hydration — auto-loads last project from IDB on mount
  - isDirty tracking via JSON snapshot comparison
  - saveStatus (saved/unsaved/saving) state machine
  - bootStatus (idle/loading/ready) lifecycle
  - beforeunload guard when isDirty is true
  - Load-sequence token (loadTokenRef) preventing stale async overwrites
  - switchProject dirty guard — returns {blocked:true,pendingId} when unsaved work exists
affects:
  - 02-02 (App.jsx state lift — consumes useProjectStore)
  - 02-03 (ProjectList.jsx — uses projectList, switchProject, isDirty)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - savedSnapshotRef pattern: snapshot stored in ref (not state) to prevent double-render isDirty flicker after load
    - Load-sequence token: monotonic loadTokenRef prevents stale async results from overwriting freshly-switched project
    - buildSnapshot exclusion: file and _dragging stripped before snapshot to prevent phantom dirty detection
    - useCallback for all async actions with minimal dependency arrays

key-files:
  created:
    - src/useProjectStore.js
    - src/__tests__/useProjectStore.test.js
  modified: []

key-decisions:
  - "savedSnapshotRef set from deserialized values (not React state) on load to prevent false-positive isDirty flicker"
  - "buildSnapshot excludes file and _dragging: file is a live object not part of content identity; _dragging is transient UI state"
  - "isDirty when savedSnapshotRef.current === null: dirty only if chapters.length > 0 || book.title !== '' (supports newProject reset)"
  - "Tests structured without @testing-library/react: hook logic tested via exported buildSnapshot + direct projectDb/projectSerializer calls in fake-indexeddb"

patterns-established:
  - "savedSnapshotRef pattern: store snapshot in useRef on load/save, compare in useMemo — avoids extra re-renders"
  - "Load-sequence token: increment ref before async op, check equality after — one-liner stale guard with no extra state"
  - "saveStatus sync effect uses functional updater to not interrupt in-flight saves: if (prev === 'saving') return prev"

requirements-completed: [STOR-01, STOR-02, STOR-03, STOR-04, STAT-01, STAT-02]

# Metrics
duration: 3min
completed: 2026-03-17
---

# Phase 2 Plan 01: useProjectStore Summary

**React hook bridging Phase 1 IDB primitives with full save/load/dirty-tracking/boot-hydration/switch-guard logic — 28 new tests green, 64 total passing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-17T15:56:01Z
- **Completed:** 2026-03-17T15:58:38Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented `useProjectStore` hook (240 lines) with complete persistence abstraction — no persistence logic will leak into App.jsx or ProjectList.jsx
- `buildSnapshot` exported helper excludes `file` and `_dragging` from dirty comparison, preventing two classes of phantom isDirty bugs
- Load-sequence token (`loadTokenRef`) ensures rapid project switching cannot corrupt state with stale async results
- Boot hydration auto-loads last project on mount with `try/finally` ensuring `bootStatus` always reaches "ready"
- `switchProject` dirty guard returns `{blocked: true, pendingId}` without loading — enables confirmation dialog in UI without coupling the hook to UI decisions
- 28 new tests covering all behaviors; full suite 64/64 passing

## Task Commits

Each task was committed atomically:

1. **RED phase: failing tests** - `60966c3` (test)
2. **GREEN phase: hook implementation** - `0fefbab` (feat)

## Files Created/Modified

- `/home/damienriehl/Coding Projects/doc-to-markdown/src/useProjectStore.js` — Custom hook with save, load, switchProject, confirmSwitch, cancelSwitch, newProject; exports buildSnapshot
- `/home/damienriehl/Coding Projects/doc-to-markdown/src/__tests__/useProjectStore.test.js` — 28 tests covering buildSnapshot, save round-trip, boot hydration, isDirty tracking, switchProject guard, saveStatus transitions, load-sequence token, projectList, newProject logic

## Decisions Made

- **savedSnapshotRef from deserialized values:** After load, snapshot is set from the values returned by `deserializeProject` — NOT from React state (which hasn't re-rendered yet). This prevents the false-positive isDirty flicker that would fire if we built the snapshot after `setBook`/`setChapters` were called but before they settled.
- **No @testing-library/react:** Hook tested by extracting `buildSnapshot` as an exported pure function and testing persistence logic directly via `projectDb`/`projectSerializer` calls in `fake-indexeddb`. Avoids adding a devDependency; tests run in 34ms.
- **isDirty semantics when savedSnapshotRef is null:** Represents "new project, never saved". Dirty only if user added content (`chapters.length > 0 || book.title !== ""`). Clean slate after `newProject()` (null snapshot + empty state = not dirty).
- **switchProject returns {blocked} not throws:** Caller decides how to present the confirmation dialog. Hook is UI-agnostic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

All created files present. All task commits verified.

## Next Phase Readiness

- `useProjectStore` hook is complete and tested. Plan 02-02 (App.jsx state lift) can import and consume all returned values immediately.
- Plan 02-03 (ProjectList.jsx) depends on `projectList`, `switchProject`, `activeProjectId` — all available from this hook.
- No blockers.

---
*Phase: 02-core-save-load-switch*
*Completed: 2026-03-17*
