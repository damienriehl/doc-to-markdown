# Phase 4: Export / Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 04-export-import
**Areas discussed:** ZIP contents & modes, Import behavior, Export/Import UI

---

## ZIP Contents & Modes

### Export modes

| Option | Description | Selected |
|--------|-------------|----------|
| Two modes (Recommended) | "Full project" and "Outputs only" | ✓ |
| Full project only | Always export everything | |
| Three modes | Full, Outputs only, Sources only | |

**User's choice:** Two modes
**Notes:** Matches ROADMAP success criteria directly.

### ZIP structure

| Option | Description | Selected |
|--------|-------------|----------|
| Flat with folders (Recommended) | project.json at root, sources/ and outputs/ folders. Mirrors server layout. | ✓ |
| Everything flat | All files at ZIP root | |
| Nested by chapter | Each chapter gets own folder with source + output paired | |

**User's choice:** Flat with folders
**Notes:** Selected after viewing preview showing the folder structure.

### Export engine

| Option | Description | Selected |
|--------|-------------|----------|
| Browser-side (Recommended) | JSZip already installed, works offline, IDB-primary consistent | ✓ |
| Server-side | Python zipfile + StreamingResponse | |
| Both with fallback | Server first, browser fallback | |

**User's choice:** Browser-side
**Notes:** None.

---

## Import Behavior

### Name collisions

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-rename (Recommended) | Append " (2)", " (3)" etc. | ✓ |
| Ask each time | Dialog with Rename/Overwrite/Cancel | |
| Always overwrite | Replace existing silently | |

**User's choice:** Auto-rename
**Notes:** None.

### Import target

| Option | Description | Selected |
|--------|-------------|----------|
| IDB + fire-and-forget server (Recommended) | Same dual-store pattern as save | ✓ |
| IDB only | Server sync on next manual save | |
| User chooses | Checkbox in import dialog | |

**User's choice:** IDB + fire-and-forget server
**Notes:** None.

### Error handling

| Option | Description | Selected |
|--------|-------------|----------|
| Validate then import (Recommended) | Check for project.json or .md files before importing | ✓ |
| Best-effort import | Import whatever is found | |
| Strict validation | Require exact export format match | |

**User's choice:** Validate then import
**Notes:** None.

---

## Export/Import UI

### Button placement

| Option | Description | Selected |
|--------|-------------|----------|
| Project list actions (Recommended) | Export as hover action on cards, Import at top/bottom of list | ✓ |
| Header toolbar | Buttons in main header area | |
| Both locations | Redundant placement | |

**User's choice:** Project list actions
**Notes:** None.

### Mode selection

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown on export click (Recommended) | Small dropdown with two options | ✓ |
| Modal with options | Dialog with radio buttons | |
| Two separate buttons | Separate "Export Full" and "Export Outputs" | |

**User's choice:** Dropdown on export click
**Notes:** None.

### Progress indication

| Option | Description | Selected |
|--------|-------------|----------|
| Simple spinner (Recommended) | Spinner on button, toast on completion | ✓ |
| Progress bar | Animated percentage bar | |
| No indicator | Just disable button | |

**User's choice:** Simple spinner
**Notes:** None.

---

## Claude's Discretion

- Export/import icon choices
- Dropdown component implementation
- Toast notification approach
- Exact ZIP validation rules
- Whether "Outputs only" includes 00-index.md

## Deferred Ideas

None -- discussion stayed within phase scope.
