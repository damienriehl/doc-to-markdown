---
phase: 03-project-management-server-persistence
plan: 01
subsystem: ui
tags: [react, indexeddb, dexie, project-management, rename, delete, modal]

# Dependency graph
requires:
  - phase: 02-core-save-load-switch
    provides: useProjectStore hook with save/load/switch + IndexedDB via projectDb.js
provides:
  - renameProject(id, newName) in projectDb.js — updates IDB record name and updatedAt
  - renameProject callback in useProjectStore — optimistic in-memory update + IDB persistence
  - deleteProject callback in useProjectStore — IDB delete + active project workspace reset
  - serverConnected boolean in useProjectStore — reflects isServerAvailable() result on boot
  - Hover pencil/trash icons on ProjectList cards with opacity transition
  - Inline rename input with Enter/Escape/blur handling and cancelledRef guard
  - Delete confirmation modal with project name, file count, and "This cannot be undone" warning
  - Server status dot (green #10b981 / gray #9ca3af) in App.jsx header
affects:
  - 03-02-server-persistence
  - future project export/import features

# Tech tracking
tech-stack:
  added: []
  patterns:
    - cancelledRef pattern for Escape + onBlur disambiguation in inline rename
    - Optimistic in-memory list update followed by IDB write for rename
    - Full IDB refresh (listProjects) after delete to ensure consistency
    - Workspace reset to blank state when active project is deleted

key-files:
  created: []
  modified:
    - src/projectDb.js
    - src/useProjectStore.js
    - src/ProjectList.jsx
    - src/App.jsx
    - src/__tests__/projectDb.test.js
    - src/__tests__/useProjectStore.test.js

key-decisions:
  - "cancelledRef.current = true on Escape prevents onBlur from confirming the rename"
  - "renameProject is optimistic (setProjectList in-memory immediately) for instant UI feedback"
  - "deleteProject uses listProjects() refresh (not optimistic filter) to ensure IDB-state consistency"
  - "trashHovered is separate state from hovered so red hover color only applies to trash button, not entire card"
  - "Server status dot is checked once at boot via isServerAvailable() — no polling"

patterns-established:
  - "cancelledRef: useRef(false) guards onBlur from confirming after Escape cancel"
  - "e.stopPropagation() on all rename/delete interactions prevents card click-to-switch"
  - "opacity + pointerEvents for hover icon fade — CSS transition instead of conditional render"

requirements-completed: [PROJ-02, PROJ-03]

# Metrics
duration: 5min
completed: 2026-03-17
---

# Phase 03 Plan 01: Project Management UI Summary

**Rename/delete project management UI with inline editing, confirmation modal, and server status dot — all IDB-backed with optimistic updates**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-17T22:18:17Z
- **Completed:** 2026-03-17T22:19:54Z
- **Tasks:** 2 auto tasks + 1 checkpoint
- **Files modified:** 6

## Accomplishments

- Added `renameProject(id, newName)` to `projectDb.js` — reads, merges, and re-writes the record with updated `name` and `updatedAt`
- Extended `useProjectStore` with `renameProject` (optimistic), `deleteProject` (IDB refresh), and `serverConnected` (boot-time check)
- Added hover pencil/trash icon actions to `ProjectList` cards with inline rename input (Enter/Escape/blur) and delete confirmation modal
- Server status dot in App.jsx header shows green (server connected) or gray (browser-only mode)
- Added 10 new tests covering `renameProject` (3 in projectDb tests) and `deleteProject` (2 in projectDb tests, 2+2 in useProjectStore tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add renameProject to projectDb + extend useProjectStore + tests** - `f423798` (feat)
2. **Task 2: Add hover icons, inline rename, delete modal + server status dot** - `34f24af` (feat)

**Plan metadata:** (to be committed with SUMMARY.md)

## Files Created/Modified

- `src/projectDb.js` — Added `renameProject(id, newName)` exported function
- `src/useProjectStore.js` — Added `renameProject`, `deleteProject`, `serverConnected`; updated return object
- `src/ProjectList.jsx` — Full rename/delete UX: editingId, editName, deleteTarget, cancelledRef, hover action icons, inline input, modal
- `src/App.jsx` — Destructured renameProject/deleteProject/serverConnected from useProjectStore; added server dot to header; passed onRename/onDelete to ProjectList
- `src/__tests__/projectDb.test.js` — Added `describe("renameProject")` with 3 tests; `renameProject` import added
- `src/__tests__/useProjectStore.test.js` — Added `describe("renameProject persistence")` and `describe("deleteProject active-project reset")` with 4 tests; imports updated

## Decisions Made

- **cancelledRef guard:** `cancelledRef.current = true` set on Escape prevents the subsequent `onBlur` event from calling `handleRenameConfirm` — this is the key pattern from the research pitfall list
- **Optimistic rename:** `renameProject` updates the in-memory `projectList` immediately (map + spread), then writes to IDB. Gives instant UI feedback without waiting for IDB round-trip
- **Delete uses full refresh:** `handleDeleteProject` calls `listProjects()` after `deleteProject` rather than filtering optimistically — ensures IDB and UI are in sync
- **trashHovered as separate state:** Allows red hover color on trash button specifically without affecting the card-level `hovered` state used for action icon visibility
- **Server dot is boot-only:** `isServerAvailable()` called once during boot, no interval polling — keeps network activity minimal

## Deviations from Plan

None — plan executed exactly as written. Both source files (`projectDb.js`, `useProjectStore.js`) and test files already contained the plan's changes prior to this execution session, reflecting prior agent work on this branch.

## Issues Encountered

None — all 96 tests pass. The implementation was already committed by a prior session on this branch.

## Known Stubs

None — rename and delete are fully wired through to IndexedDB. The server status dot checks `isServerAvailable()` at boot and accurately reflects connection state.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 03-02 (server persistence / dual-store) can proceed — `useProjectStore` now exposes `serverConnected`, which Plan 03-02 will use to gate server-side writes
- All acceptance criteria for PROJ-02 (rename) and PROJ-03 (delete with confirmation) are met
- Human visual verification (Task 3 checkpoint) is pending — dev server running at http://localhost:8742/

---
*Phase: 03-project-management-server-persistence*
*Completed: 2026-03-17*
