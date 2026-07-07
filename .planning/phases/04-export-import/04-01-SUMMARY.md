---
phase: 04-export-import
plan: 01
subsystem: ui
tags: [jszip, indexeddb, react, export, import, zip, tdd]

# Dependency graph
requires:
  - phase: 03-project-management-server-persistence
    provides: projectDb CRUD, fileSaver, serverApi, useProjectStore hook pattern

provides:
  - exportProject(id, mode) standalone async function exported from useProjectStore.js
  - importProject(file, setProjectList, setServerConnected) standalone async function
  - buildIndexContent helper (replicated from App.jsx buildIndexFile as standalone)
  - Hook wrapper callbacks (handleExport, handleImport) on useProjectStore return object
  - 10 unit/integration tests covering all export/import behaviors

affects:
  - 04-02 (UI wiring — imports handleExport, handleImport from useProjectStore hook)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone exported async functions for testability without React context"
    - "Hook wrappers bind setProjectList/setServerConnected from hook scope to standalone functions"
    - "vi.mock fileSaver to capture blob in TDD tests (no DOM download trigger in Node)"
    - "buildIndexContent extracted from App.jsx as module-level helper for reuse"

key-files:
  created:
    - src/__tests__/exportImport.test.js
  modified:
    - src/useProjectStore.js

key-decisions:
  - "exportProject and importProject are EXPORTED standalone functions (not just hook members) — enables direct test imports without React"
  - "Hook wrappers (handleExport, handleImport) bind state setters from hook closure — clean separation between pure logic and React state"
  - "buildIndexContent extracted from App.jsx into useProjectStore.js module scope — App.jsx's version is not exported; duplication avoided by making this the canonical location"
  - "outputsFolder only created when doneChapters.length > 0 in full mode — avoids empty folder in ZIP"
  - "importProject skips __MACOSX/ and dot-prefixed paths — standard ZIP artifact filtering"

patterns-established:
  - "Standalone + wrapper pattern: implement logic outside hook, wrap inside hook to inject state setters"
  - "TDD RED/GREEN: test file committed before implementation, all 10 tests RED confirmed, then GREEN"

requirements-completed:
  - EXPT-01
  - EXPT-02

# Metrics
duration: 3min
completed: 2026-04-04
---

# Phase 4 Plan 1: Export/Import Core Logic Summary

**exportProject/importProject as standalone testable functions in useProjectStore.js with JSZip, full/outputs-only modes, UUID remapping, and name collision resolution**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-04T02:47:32Z
- **Completed:** 2026-04-04T02:49:59Z
- **Tasks:** 2 (TDD RED + GREEN each)
- **Files modified:** 2

## Accomplishments

- `exportProject(id, "full")` produces ZIP with project.json at root, sources/ folder with original blobs, outputs/ folder with .md files and 00-index.md
- `exportProject(id, "outputs-only")` produces flat ZIP with .md files at root; throws "No converted outputs" when nothing converted
- `importProject(file)` validates ZIP, assigns fresh UUID, resolves name collisions (appends " (2)", " (3)", etc.), writes IDB, restores source blobs, fires server sync
- 10 tests all pass GREEN; full suite 119/119 tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create exportImport.test.js (TDD RED)** - `4e3fa3b` (test)
2. **Task 2: Implement exportProject and importProject (TDD GREEN)** - `a5aa4a9` (feat)

## Files Created/Modified

- `src/__tests__/exportImport.test.js` — 419 lines: 10 test cases for all EXPT-01/EXPT-02 behaviors
- `src/useProjectStore.js` — Added buildIndexContent helper, exportProject, importProject as standalone exports; hook wrappers + return object update

## Decisions Made

- Standalone exported functions for testability: tests import `exportProject`/`importProject` directly without needing a React hook wrapper
- Hook callbacks (handleExport, handleImport) bind React state setters from hook closure, keeping the standalone functions pure
- `buildIndexContent` extracted from App.jsx's `buildIndexFile` — App.jsx is not exported, so this function is the canonical standalone version going forward
- `outputsFolder` only created when chapters have content — prevents empty folder artifacts in full-mode ZIPs
- `__MACOSX/` and dot-prefix filtering applied during import entry enumeration — standard macOS ZIP artifact handling

## Deviations from Plan

None — plan executed exactly as written. The implementation code in the plan was used as a direct template with minor safety additions (null coalescing on book properties, outputs folder only created when non-empty).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `exportProject` and `importProject` are ready for UI wiring in plan 04-02
- Hook return object includes `exportProject` and `importProject` callbacks
- Both functions accept optional state setters (safe to call without them in tests)

---
*Phase: 04-export-import*
*Completed: 2026-04-04*
