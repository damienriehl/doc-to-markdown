---
phase: 01-storage-foundation
plan: "01"
subsystem: storage
tags: [serialization, indexeddb, file-api, schema, vitest, tdd]

# Dependency graph
requires: []
provides:
  - "SCHEMA_VERSION constant (v1) as versioned contract anchor for all storage paths"
  - "serializeProject() — extracts File objects into blobs array, returns JSON-safe projectRecord"
  - "deserializeProject() — reconstructs chapters/book/uiState, reattaches File objects via blobMap"
affects:
  - 01-02-PLAN (IDB persistence layer will call serializeProject/deserializeProject)
  - 01-03-PLAN (server save will use the same projectRecord shape)
  - 02-project-switcher (project list loading will call deserializeProject)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Serialization boundary pattern: File objects extracted to side-channel blobs array keyed by blobId"
    - "blobId as stable cross-layer key: generated once on first serialize, preserved on all subsequent serializations"
    - "TDD RED/GREEN commit split: test file committed before implementation"

key-files:
  created:
    - src/projectSerializer.js
    - src/__tests__/projectSerializer.test.js
  modified: []

key-decisions:
  - "blobId uses chapter.blobId ?? crypto.randomUUID() — reuses existing ID to keep blob references stable across saves"
  - "file property deliberately omitted from serialized chapter — the whole point of the serializer"
  - "deserializeProject returns null file (not undefined) when blobMap has no entry — explicit null is safer for downstream checks"
  - "SCHEMA_VERSION = 1 exported as named const — callers can compare to detect schema drift"

patterns-established:
  - "Section separator style: // --- Schema --------- // --- Serialize --------- // --- Deserialize ---------"
  - "JSDoc @param/@returns on all exports matching serverApi.js convention"
  - "Test helper fakeFile(name, content) pattern for File API mocking in vitest"

requirements-completed: [STOR-01, STOR-02]

# Metrics
duration: 2min
completed: 2026-03-17
---

# Phase 1 Plan 01: Project Serializer Summary

**Schema-first serialization boundary: serializeProject() extracts File objects to side-channel blobs array, deserializeProject() reattaches them via blobMap, with 12-test TDD coverage**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-17T15:13:03Z
- **Completed:** 2026-03-17T15:14:44Z
- **Tasks:** 2 (RED phase + GREEN phase)
- **Files modified:** 2

## Accomplishments

- Established the project.json schema contract with SCHEMA_VERSION = 1
- Implemented the File-object serialization boundary — the critical blocker identified in STATE.md blockers section
- 12 unit tests proving serialize/deserialize round-trip fidelity across all edge cases
- Full test suite remains green (24/24 tests across 3 files)

## Task Commits

1. **Task 1: Create projectSerializer.test.js (RED phase)** — `6420e7d` (test)
2. **Task 2: Implement projectSerializer.js (GREEN phase)** — `bed5360` (feat)

_TDD plan: test file committed first in RED, implementation committed in GREEN_

## Files Created/Modified

- `/home/damienriehl/Coding Projects/doc-to-markdown/src/projectSerializer.js` — Schema contract + serializeProject() + deserializeProject() with JSDoc and section separators
- `/home/damienriehl/Coding Projects/doc-to-markdown/src/__tests__/projectSerializer.test.js` — 12 test cases in 3 describe blocks covering serialization, deserialization, and round-trip

## Decisions Made

- `blobId` reuses `chapter.blobId` when present — ensures blob references stay stable across multiple saves of the same project
- `file` is deliberately absent from the serialized chapter object (not set to null, not omitted via delete — just never included in the returned spread)
- `deserializeProject` returns `null` (not `undefined`) for missing blob entries — explicit null is safer for downstream `if (chapter.file)` checks in App.jsx
- No migration logic in v1 — `SCHEMA_VERSION` is the anchor; migration belongs in a separate module when v2 is needed

## Deviations from Plan

None — plan executed exactly as written. Implementation matched spec in plan action block one-to-one.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `src/projectSerializer.js` is ready to be consumed by plan 01-02 (IndexedDB persistence layer)
- The `blobs` array shape (`{ id, file, name }`) is the contract the IDB blob store must implement
- The `projectRecord` shape is the contract the IDB metadata store must implement
- STATE.md blocker "File blobs stored separately from project.json" is resolved by this module

---
*Phase: 01-storage-foundation*
*Completed: 2026-03-17*
