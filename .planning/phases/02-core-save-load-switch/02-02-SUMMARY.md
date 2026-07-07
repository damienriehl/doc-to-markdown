---
phase: 02-core-save-load-switch
plan: "02"
subsystem: ui-integration
tags: [react, indexeddb, persistence, hooks, project-management, save-load, ui]

# Dependency graph
requires:
  - phase: 02-core-save-load-switch
    plan: "01"
    provides: useProjectStore hook (save, load, switchProject, confirmSwitch, cancelSwitch, newProject, isDirty, saveStatus, bootStatus, projectList)
provides:
  - App.jsx state lifted into useProjectStore (book/chapters from hook, not local useState)
  - Project name input + Save button + New button in header
  - Save-state badge (Saved/Unsaved/Saving) in header
  - Boot loading gate ("Loading workspace..." until IDB hydration ready)
  - Unsaved-changes confirmation modal with Discard & Switch / Cancel actions
  - ProjectList.jsx component: collapsible list, project cards with name/date/file count, active badge
affects:
  - All subsequent phases (App.jsx is now persistence-aware)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - projectNameInput local state synced from activeProjectName via useEffect — separates controlled input lifecycle from persistence state
    - showSwitchConfirm null-as-closed pattern — null means modal closed, pendingId (string) means modal open
    - bootStatus gate before main return — prevents empty workspace flash during IDB hydration
    - ProjectList collapsed by default — progressive disclosure, keeps UI focused on conversion work

key-files:
  created:
    - src/ProjectList.jsx
  modified:
    - src/App.jsx

key-decisions:
  - "projectNameInput is local state synced from activeProjectName via useEffect — not bound directly to hook — allows user to type freely before clicking Save"
  - "showSwitchConfirm stores the pendingId (string) not a boolean — lets UI show the target project name in future if needed, and uses null as falsy closed state"
  - "ProjectList collapsed by default — user intent is conversion work, not browsing projects; collapse reduces visual noise"
  - "Boot gate returns early (not conditional JSX) — ensures no refs, callbacks, or effects run on partially-hydrated state"

# Metrics
duration: 2min
completed: 2026-03-17
---

# Phase 2 Plan 02: App.jsx State Lift + ProjectList Summary

**useProjectStore wired into App.jsx with save/project-name/badge UI, plus new collapsible ProjectList component — 64 tests green, all 12 visual verification checks passed in Chrome**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-17T16:02:05Z
- **Completed:** 2026-03-17T16:04:15Z
- **Tasks:** 3 of 3 (all complete including human visual verification)
- **Files modified:** 2

## Accomplishments

- Lifted `book`/`chapters` state from local `useState` into `useProjectStore()` — all existing functionality (file import, conversion, drag-and-drop, preview, download) works unchanged
- Added project name input (controlled local state synced from `activeProjectName`), Save button, New button, and save-state badge to the header
- Added `bootStatus` gate before the main return — shows "Loading workspace..." during IDB hydration, eliminating empty-workspace flash
- Added unsaved-changes confirmation modal using `showSwitchConfirm` state — routes `switchProject` blocked results to user confirmation
- Created `ProjectList.jsx` — 170 lines, zero storage dependencies, collapses by default
- Each project card shows name, file count, last-modified date; active project highlighted with `--accent-bg` and "active" badge
- Full suite: 64/64 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Lift App.jsx state + header UI** - `49c85a2` (feat)
2. **Task 2: Create ProjectList component** - `1be3c77` (feat)
3. **Task 3: Visual verification checkpoint** - Approved by user; all 12 checks passed in Chrome browser testing

## Files Created/Modified

- `/home/damienriehl/Coding Projects/doc-to-markdown/src/App.jsx` — State lifted to useProjectStore; header enhanced with project name input, Save/New buttons, save-state badge; bootStatus gate; ProjectList rendered below header; unsaved-changes modal
- `/home/damienriehl/Coding Projects/doc-to-markdown/src/ProjectList.jsx` — New component: collapsible project list, project cards with name/date/file count, hover effects, active badge

## Decisions Made

- **projectNameInput as local controlled state:** The name input is a local `useState` synced from `activeProjectName` via `useEffect`. Binding directly to the hook's value would make every keystroke trigger hook logic. Local state lets the user type freely; `save(projectNameInput)` sends the final value on click.
- **showSwitchConfirm stores pendingId string:** `null` = modal closed. `pendingId` (non-null string) = modal open. This future-proofs the modal to display the target project name if needed, and the null check is idiomatic for conditional JSX.
- **Boot gate as early return (not conditional JSX):** Returning before the main JSX tree ensures refs, useCallbacks, and timers don't run on partially-hydrated state. Simpler than wrapping the entire return in a conditional.
- **ProjectList collapsed by default:** The user's primary task is document conversion, not project management. Showing the list expanded by default would increase visual noise. Progressive disclosure keeps focus on the task.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — all changes are in-browser React/IndexedDB. No new dependencies.

## Self-Check: PASSED

- `src/App.jsx` — modified, contains all required patterns (useProjectStore, bootStatus gate, saveStatus badge, ProjectList, modal)
- `src/ProjectList.jsx` — created at correct path
- Commit `49c85a2` — Task 1 (App.jsx state lift)
- Commit `1be3c77` — Task 2 (ProjectList component)
- `npx vitest run` — 64/64 tests passing

## Checkpoint Verification (Task 3)

All 12 visual verification checks passed in Chrome browser testing:
- Initial load with no empty-state flash (boot gate working)
- Import files — Unsaved badge shows; Save — Saved badge confirms
- Project list shows correct name, date, and file count per card
- Project switching restores correct files and metadata
- Unsaved changes modal works: Cancel stays on current project, Discard switches
- Page refresh auto-loads the last-opened project

## Next Phase Readiness

- Plan 02-02 is complete; Phase 2 (Core Save/Load/Switch) is fully done
- App.jsx is now persistence-aware; all existing converter features work unchanged
- Phase 3 (Project Management + Server Persistence) is ready to begin: rename, delete, server-side durability

---
*Phase: 02-core-save-load-switch*
*Completed: 2026-03-17*
