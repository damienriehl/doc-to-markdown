---
phase: 03-project-management-server-persistence
plan: "02"
subsystem: api
tags: [fastapi, server-sync, indexeddb, fire-and-forget, slugify, rest-endpoints]

# Dependency graph
requires:
  - phase: 03-01
    provides: useProjectStore with save/renameProject/deleteProject callbacks, isServerAvailable in serverApi.js

provides:
  - FastAPI POST /projects/{slug} endpoint writing project.json to ./projects/<slug>/
  - FastAPI PUT /projects/{slug}/rename endpoint renaming project directory with collision handling
  - FastAPI DELETE /projects/{slug} endpoint removing project directory recursively (idempotent)
  - serverApi.js slugify() — filesystem-safe slug generation
  - serverApi.js saveProjectToServer / renameProjectOnServer / deleteProjectOnServer — fire-and-forget client functions
  - useProjectStore fire-and-forget server sync hooks in save, renameProject, deleteProject paths
  - 13 new serverApi.test.js tests covering slugify and all three client functions

affects:
  - phase-04 (any future phase using server directory listing or project restore from disk)
  - server.py (CORS now allows PUT and DELETE methods)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fire-and-forget pattern: fireAndForget(promise) wraps non-blocking side-effects that must never fail the primary path"
    - "dual-store pattern: IndexedDB is primary (always awaited); server directory is secondary (never awaited, errors swallowed)"
    - "resolve_slug() collision avoidance: appends -2/-3 if target directory already exists"
    - "idempotent DELETE: returns success even if directory already gone"

key-files:
  created:
    - src/__tests__/serverApi.test.js
  modified:
    - server.py
    - src/serverApi.js
    - src/useProjectStore.js

key-decisions:
  - "fireAndForget wraps isServerAvailable().then(up => ...) — server check and sync are bundled in one non-blocking promise chain"
  - "save callback updates setServerConnected(up) inside fireAndForget — keeps server status indicator current without extra round-trip"
  - "renameProject captures oldName before IDB update via projectList.find() — list is still in pre-rename state at that point"
  - "handleDeleteProject captures deletedName before deleteProjectFromDb() call — same pattern as rename for consistency"
  - "resolve_slug() uses exclude_dir parameter so rename to same slug is a no-op, not a collision"

patterns-established:
  - "Pattern: fireAndForget(isServerAvailable().then(up => { setServerConnected(up); if (up) return syncFn(); })) — standard server sync invocation"
  - "Pattern: capture-before-mutate for rename/delete when server needs the old identifier"

requirements-completed: [PROJ-02, PROJ-03]

# Metrics
duration: 2min
completed: 2026-04-04
---

# Phase 03 Plan 02: Server-Side Project Persistence Summary

**FastAPI /projects/* REST endpoints with fire-and-forget server sync wired into all three IndexedDB persistence paths (save, rename, delete)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-04T01:58:53Z
- **Completed:** 2026-04-04T02:01:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Three new FastAPI endpoints (POST/PUT/DELETE) write project directories to ./projects/<slug>/ on disk
- CORS middleware updated to allow PUT and DELETE methods
- slugify(), saveProjectToServer(), renameProjectOnServer(), deleteProjectOnServer() added to serverApi.js
- fireAndForget() utility added to useProjectStore — server sync never blocks IDB saves
- 13 new tests in serverApi.test.js cover slugify edge cases and all three client functions (network error, server error, success paths)
- Full test suite: 109 tests passing across 8 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Add /projects/* endpoints + project client functions + tests** - `d1efee1` (feat)
2. **Task 2: Wire fire-and-forget server sync into useProjectStore** - `c6fd1ff` (feat)

## Files Created/Modified

- `server.py` — CORS update + PROJECTS_DIR + slugify/resolve_slug helpers + 3 new endpoints
- `src/serverApi.js` — slugify + saveProjectToServer + renameProjectOnServer + deleteProjectOnServer
- `src/useProjectStore.js` — fireAndForget utility + server sync in save/renameProject/handleDeleteProject
- `src/__tests__/serverApi.test.js` — 13 tests for slugify and all three client functions (created)

## Decisions Made

- `fireAndForget` wraps `isServerAvailable().then(up => ...)` — server availability check and sync bundled in one non-blocking promise chain to avoid an extra round-trip
- `save` callback updates `setServerConnected(up)` inside `fireAndForget` — keeps the server status indicator current without an extra check
- `renameProject` captures `oldName` before the IDB update via `projectList.find()` — the list is still in pre-rename state at capture time
- `handleDeleteProject` captures `deletedName` before `deleteProjectFromDb()` — same capture-before-mutate pattern for consistency
- `resolve_slug(new_slug, exclude_dir=source)` on rename ensures same-slug renames are no-ops rather than triggering collision suffix

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dual-store architecture is complete: IndexedDB primary + server directory secondary
- Server directory persistence is fully non-blocking — the UI is never degraded by server unavailability
- Endpoints can be manually tested: `curl -X POST -F 'metadata={"id":"test","name":"Test"}' http://127.0.0.1:9378/projects/test-project`
- Phase 03 is now complete — both plans (03-01 inline rename/delete UI, 03-02 server persistence) delivered

---
*Phase: 03-project-management-server-persistence*
*Completed: 2026-04-04*
