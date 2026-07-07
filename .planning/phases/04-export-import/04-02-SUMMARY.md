---
phase: 04-export-import
plan: 02
subsystem: ui
tags: [react, export, import, zip, dropdown, hover-actions, project-list]

# Dependency graph
requires:
  - phase: 04-export-import
    plan: 01
    provides: exportProject(id, mode) and importProject(file) as hook callbacks on useProjectStore

provides:
  - Export hover icon with mode dropdown ("Full project" / "Outputs only") on each project card
  - Import button with hidden .zip file picker below project card list
  - Inline status feedback (importing / done / error) during import
  - Outside-click dismissal of export dropdown
  - Export spinner while download is in progress
  - onExport and onImport props wired in App.jsx from useProjectStore hook

affects:
  - ProjectList.jsx — new props, state, handlers, and JSX for export/import UI
  - App.jsx — destructures exportProject/importProject, passes as props to ProjectList

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Relative-positioned wrapper div around export button enables absolute dropdown positioning"
    - "mousedown listener for outside-click dismissal — avoids interfering with click events inside dropdown"
    - "Spinner keyframes injected via inline <style> tag at top of component return"
    - "Hidden file input triggered via importInputRef.current.click() — avoids custom button styling for file pickers"
    - "Export aliases in App.jsx destructuring (exportProject: handleExportProject) prevent shadowing of standalone module exports"

key-files:
  created: []
  modified:
    - src/ProjectList.jsx
    - src/App.jsx

key-decisions:
  - "Export icon placed between rename and delete icons — discovery is contextual to the card, not a global action"
  - "onMouseDown handler on dropdown prevents outside-click listener from firing before dropdown buttons register their click"
  - "Import section always visible below project cards (not hover-gated) — import is a global project-list action, not per-card"
  - "Import status auto-clears after 3s (success) or 5s (error) — balance between feedback and visual noise"

# Metrics
duration: 5min
completed: 2026-04-04
---

# Phase 4 Plan 2: Export/Import UI Wiring Summary

**Export hover icon with mode dropdown and import button added to ProjectList, with App.jsx wiring — completing the full EXPT-01 and EXPT-02 user-facing feature**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-04T~02:53Z
- **Completed:** 2026-04-04
- **Tasks:** 1 code task + 1 auto-approved checkpoint
- **Files modified:** 2

## Accomplishments

- `ProjectList.jsx` now accepts `onExport` and `onImport` props
- Export download-arrow icon appears on hover alongside pencil (rename) and trash (delete) icons
- Clicking export icon toggles a dropdown with "Full project" and "Outputs only" options
- Export spinner shown (via animated SVG circle) while download is in progress; color changes to `--accent`
- Dropdown closes when clicking outside via `mousedown` listener + `onMouseDown stopPropagation` inside dropdown
- Import section with "Import project" button and hidden `.zip` file input placed below project cards
- Inline status feedback shows "Importing..." (muted color), "Project imported successfully." (green), or error message (red)
- `App.jsx` destructures `exportProject` and `importProject` from `useProjectStore()` with aliases, passes as `onExport`/`onImport` to `<ProjectList>`
- 119/119 tests pass; no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Export dropdown and import button + App.jsx wiring** — `56d3bd8` (feat)
2. **Task 2: Visual verification checkpoint** — auto-approved per user directive

## Files Created/Modified

- `src/ProjectList.jsx` — 170 lines added: new props, state (exportMenuId, exportingId, importStatus, importInputRef), useEffect for outside-click, handleExport/handleImportFile handlers, export button+dropdown JSX, import section JSX, spinner keyframes style tag
- `src/App.jsx` — 3 lines changed: added exportProject/importProject destructuring with aliases, added onExport/onImport props to ProjectList

## Decisions Made

- Export icon placed between rename and delete for contextual discovery on each card (not a global action)
- `onMouseDown` handler on dropdown prevents outside-click listener from firing before dropdown button clicks register
- Import section is always visible (not hover-gated) — it is a project-list-level action, not a per-card action
- Import status auto-clears after 3s (success) or 5s (error) for clean UI
- Aliases used in App.jsx destructuring (`exportProject: handleExportProject`) to avoid shadowing standalone module exports

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all UI is wired to real `exportProject`/`importProject` callbacks from `useProjectStore.js`. No hardcoded empty values or placeholder data paths exist in this plan's changes.

## Issues Encountered

None.

## User Setup Required

None — fully browser-side, no external service needed.

## Phase 4 Completion

This plan completes Phase 4 (export-import). Both EXPT-01 (export) and EXPT-02 (import) requirements are now fully implemented:
- Plan 01 built the core logic (exportProject, importProject standalone functions + hook wrappers)
- Plan 02 wired the UI (export dropdown, import button, status feedback)

---
## Self-Check: PASSED

- `src/ProjectList.jsx` exists: FOUND
- `src/App.jsx` exists: FOUND  
- Task 1 commit `56d3bd8`: FOUND (confirmed via git log)
- `onExport` in ProjectList props: FOUND
- `onImport` in ProjectList props: FOUND
- `exportMenuId` state: FOUND
- `importStatus` state: FOUND
- `importInputRef` ref: FOUND
- `type="file"` input: FOUND
- `accept=".zip"`: FOUND
- "Full project" dropdown option: FOUND
- "Outputs only" dropdown option: FOUND
- "Import project" button: FOUND
- `handleExport(` function: FOUND
- `handleImportFile(` function: FOUND
- `onExport={` in App.jsx ProjectList JSX: FOUND
- `onImport={` in App.jsx ProjectList JSX: FOUND
- `npx vitest run`: 119/119 passed

---
*Phase: 04-export-import*
*Completed: 2026-04-04*
