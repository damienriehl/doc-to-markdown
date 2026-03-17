---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 02-01-PLAN.md
last_updated: "2026-03-17T15:59:00Z"
last_activity: 2026-03-17 — Completed plan 02-01 (useProjectStore hook)
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 37
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-17)

**Core value:** Users can switch between 5-15 book projects instantly, with full state restoration — files, settings, outputs, and UI — so they never lose work or repeat setup.
**Current focus:** Phase 2 — Core Save/Load/Switch

## Current Position

Phase: 2 of 4 (Core Save/Load/Switch) — IN PROGRESS
Plan: 1 of 3 in current phase — COMPLETE
Status: Phase 2 plan 01 complete, ready for plan 02-02
Last activity: 2026-03-17 — Completed plan 02-01 (useProjectStore hook)

Progress: [███░░░░░░░] 37%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 3 min
- Total execution time: 0.10 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-storage-foundation | 2/2 | 6 min | 3 min |
| 02-core-save-load-switch | 1/3 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2 min), 01-02 (4 min), 02-01 (3 min)
- Trend: stable

*Updated after each plan completion*
| Phase 01-storage-foundation P01 | 2 | 2 tasks | 2 files |
| Phase 01-storage-foundation P02 | 4 | 3 commits | 4 files |
| Phase 02-core-save-load-switch P01 | 3 | 1 task (TDD) | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-Phase 1]: Dual storage (IndexedDB + server directory) — IDB for load latency, server for durability/portability
- [Pre-Phase 1]: Server endpoints for filesystem I/O — browser cannot write directories; extend existing FastAPI server
- [Pre-Phase 1]: User-initiated saves only — avoids unexpected writes and storage churn
- [Pre-Phase 1]: File blobs stored separately from project.json — JSON.stringify(File) produces {} silently
- [01-01]: blobId reuses chapter.blobId ?? crypto.randomUUID() — stable blob references across saves
- [01-01]: deserializeProject returns null (not undefined) for missing blob entries — explicit null is safer for downstream checks
- [01-01]: SCHEMA_VERSION = 1 exported as named const — callers can detect schema drift
- [Phase 01-01]: blobId reuses chapter.blobId ?? crypto.randomUUID() for stable blob references across saves
- [Phase 01-01]: deserializeProject returns null for missing blob entries — explicit null safer for downstream checks
- [Phase 01-01]: SCHEMA_VERSION = 1 exported as named const for schema drift detection
- [Phase 01-02]: vi.stubGlobal localStorage mock for Vitest node env — Node 25's localStorage stub is non-functional; Map-backed mock avoids jsdom dependency
- [Phase 01-02]: _resetDbForTest() calls close() + delete() — both required for test isolation with fake-indexeddb
- [Phase 01-02]: bulkPut for file blobs — single transaction over N, matches Dexie best practice
- [Phase 02-01]: savedSnapshotRef set from deserialized values (not React state) on load — prevents false-positive isDirty flicker
- [Phase 02-01]: buildSnapshot excludes file and _dragging — prevents phantom dirty detection from transient fields
- [Phase 02-01]: isDirty when savedSnapshotRef.current === null: dirty only if chapters.length > 0 || book.title !== ""
- [Phase 02-01]: Tests structured without @testing-library/react — exported buildSnapshot + direct IDB calls in fake-indexeddb

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Verify actual source file sizes before finalizing the 5 MB size gate (metadata in IDB vs. blobs server-side). If files are consistently under 5 MB, server dependency for file storage may be eliminated.
- [RESOLVED - 01-01]: The project.json schema v1 fields validated against App.jsx state shape — projectSerializer.js written and tested.

## Session Continuity

Last session: 2026-03-17T15:59:00Z
Stopped at: Completed 02-01-PLAN.md
Resume file: None
