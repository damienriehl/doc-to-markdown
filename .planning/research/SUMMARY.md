# Project Research Summary

**Project:** doc-to-markdown — Browser Workspace Persistence
**Domain:** Local-first React SPA with project save/load/manage via IndexedDB + FastAPI
**Researched:** 2026-03-17
**Confidence:** HIGH

## Executive Summary

This feature adds project persistence to an existing doc-to-markdown converter: users can name, save, reload, and manage multiple conversion projects (e.g., "Trialbook Vol 1", "Trialbook Vol 2") without re-importing files each session. The well-documented pattern for this class of tool — offline-first browser apps like Excalidraw and VS Code web — is dual storage: IndexedDB as the fast browser-side cache for instant reload, and a server-side directory as the durable authoritative store. This project already has both halves (a React SPA and a FastAPI server), making the implementation a natural extension rather than an architectural shift.

The recommended approach is a four-layer build: define the `project.json` serialization schema first (this is the critical contract between browser and server), then build the IndexedDB adapter (`projectDb.js`), then wire it into React via `useProjectStore`, and finally extend `server.py` with `/projects/*` REST endpoints. The only new dependency is Dexie.js 4.3.0, a mature IndexedDB ORM with React hooks support. All other capabilities are already present in the stack. The FastAPI server already exists at port 9378 and already handles file uploads via `aiofiles` — it only needs new project-management routes.

The primary risks are architectural, not technical. Safari evicts IndexedDB storage after 7 days of inactivity — if IndexedDB is treated as the primary store, user data disappears silently. The server directory (`./projects/<name>/`) must be the authoritative store; IndexedDB is a load-time cache. The second critical risk is binary file serialization: `File` objects collapse to `{}` through `JSON.stringify()`, causing silent data loss. Separating serializable metadata from binary blobs must be decided before any save/load code is written. Both risks are fully preventable if the architecture is locked before implementation begins.

---

## Key Findings

### Recommended Stack

The existing stack (React 19, Vite 6, FastAPI, `aiofiles`) is complete for this feature with one addition. Dexie.js 4.3.0 is the correct IndexedDB wrapper — it provides schema versioning, migrations, transaction management, and the `useLiveQuery()` React hook. The raw IndexedDB API is too verbose to use directly; Dexie's abstraction costs nothing architecturally while eliminating a large category of boilerplate errors. All other capabilities are either browser-native (IndexedDB, `navigator.storage.persist()`, File API) or already present in the project.

For file storage, the right split is: source files above ~5 MB live server-side in `./projects/<name>/sources/`; IndexedDB holds metadata (name, size, MIME type, chapter number) and small outputs (Markdown text). This sidesteps both storage quota pressure and main-thread blocking from serializing 50 MB PDF blobs. The File System Access API is explicitly not viable as a primary storage path — Firefox has no implementation and its 33% global coverage makes it a progressive enhancement at best.

**Core technologies:**
- **Dexie.js 4.3.0:** IndexedDB ORM — schema versioning, migrations, `useLiveQuery()` React hook; the only new dependency needed
- **IndexedDB (via Dexie):** Browser-side persistent storage for project metadata, small file blobs, and Markdown output text; instant load, no server round-trip
- **FastAPI `UploadFile` + `aiofiles` 25.1.0:** Already in use; extend with `/projects/*` routes for directory I/O, file streaming, and ZIP export
- **`navigator.storage.persist()`:** Single call on first project save; marks origin storage as persistent against browser eviction

### Expected Features

Research drew on Figma, VS Code, Excalidraw, and Nielsen Norman Group patterns. The MVP must deliver the complete save/load loop plus the project management surface that makes switching between projects workable. Missing any one of these makes the feature feel incomplete.

**Must have (table stakes — v1):**
- **Named project save** — users expect human-readable names, not anonymous IDs
- **Load / open project** — useless without this pairing to save
- **Full state restoration** — files, conversion results, settings, UI state; partial restore is perceived as data loss
- **Project list / management screen** — card or list view with name, date, file count
- **Delete project with confirmation** — destructive action requires confirmation dialog (NN/g best practice)
- **Last-opened restoration on page load** — reload must not feel like losing work
- **Visual save-state indicator** — "Unsaved / Saving... / Saved" badge in header; tracks dirty state
- **Unsaved-changes warning** — modal guard on project switch and page unload

**Should have (competitive — v1.x):**
- **Rename project** — naming mistakes happen; add once the list is stable
- **Export project as ZIP** — portability SaaS tools cannot offer; uses JSZip (already a dependency)
- **Import project from ZIP** — companion to export; machine-to-machine transfer
- **Server directory persistence** — extend FastAPI to write `./projects/<name>/` for file-system durability

**Defer (v2+):**
- **File System Access API directory binding** — complex session-scoped permission model; FastAPI routes are simpler and cross-browser
- **Keyboard shortcut for project switcher** — power-user polish for a later iteration
- **Project metadata (description, tags)** — premature for 5–15 project target; add when library grows

### Architecture Approach

The architecture follows the dual-storage pattern standard for local-first apps: IndexedDB is primary for read latency, the server directory is authoritative for durability. A clean service boundary (`projectDb.js` for IndexedDB, extended `serverApi.js` for the server) keeps storage logic out of React components. All persistence flows through a single `useProjectStore` React hook, which is the only point of contact between `App.jsx` and the storage layer. The `projectSerializer.js` module defines the canonical `project.json` schema and is the contract between both storage targets — everything passes through it.

**Build order (defined by component dependencies):**
1. **`projectSerializer.js` + `project.json` schema** — zero-UI work; unblocks everything else; define before writing any save/load code
2. **`projectDb.js`** — IndexedDB adapter with schema versioning, CRUD, and file blob storage; purely testable JS, no React
3. **`useProjectStore.js`** — React hook wrapping IDB calls; boot hydration, save/load/switch callbacks; first point the persistence layer becomes visible
4. **`App.jsx` lift** — migrate existing `useState` into `useProjectStore`; largest refactor; do after hook is stable
5. **`ProjectList.jsx` + `ProjectManager.jsx`** — UI components; build after state layer is correct; UI bugs are easier to fix than state bugs
6. **Server-side `/projects/*` routes** — extend `server.py`; can run in parallel with steps 3–5 since it has no React dependencies

**Major components:**
1. `projectSerializer.js` — canonical `project.json` schema; `serialize()`/`deserialize()` boundary between browser state and JSON
2. `projectDb.js` — all IndexedDB CRUD; object stores: `projects`, `files`, `outputs`, `projectIndex`; schema versioned from day one
3. `useProjectStore.js` — single source of truth for active project state; load-sequence token for race safety; `isDirty` flag for unsaved-changes guard
4. `ProjectList.jsx` / `ProjectManager.jsx` — project switcher and create/rename/delete/export modal; isolated from `App.jsx` to prevent monolith growth
5. `server.py` (extended) — `/projects/*` REST endpoints for directory I/O, file streaming, ZIP export/import; FastAPI with `aiofiles` for non-blocking writes
6. `serverApi.js` (extended) — client for server project endpoints; all calls gated by `isServerAvailable()`; server failure never blocks the IndexedDB save path

### Critical Pitfalls

All six critical pitfalls are preventable in Phase 1 if the architecture is locked first. The top five that affect implementation decisions:

1. **File objects lost in JSON serialization** — `JSON.stringify(File)` produces `{}`, silently destroying all file data on save. Prevention: define the serializer layer (metadata JSON + binary blobs stored separately in IndexedDB) before writing any persistence code. This must be in `projectSerializer.js` before the save API is designed.

2. **Safari 7-day IndexedDB eviction** — Safari's ITP deletes all origin storage after 7 days of inactivity. Prevention: server directory is the authoritative store; IndexedDB is explicitly a cache. Call `navigator.storage.persist()` on first save; handle denial gracefully. Do not test only in Chrome.

3. **No IndexedDB schema migration path** — schema changes without `onupgradeneeded` handling corrupt the database or silently stay on the old schema. Prevention: version the schema at `DB_VERSION = 1` from day one; register `onversionchange` → `db.close()` to prevent blocked upgrades across tabs. Costs nothing to add upfront; expensive to retrofit.

4. **Main-thread blocking on large file serialization** — serializing 50 MB PDFs on the main thread causes a 2–5 second UI freeze. Prevention: files above 5 MB go server-side only; IndexedDB holds metadata. Batch multiple file writes into a single transaction (not one transaction per file).

5. **Race condition on rapid project switching** — two concurrent `loadProject()` calls complete in arbitrary order, blending state from both projects. Prevention: load-sequence token (`useRef(0)`) checked before applying any async state update; disable project list during active load.

---

## Implications for Roadmap

Based on the component dependency graph in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md, four phases are well-defined. All critical pitfalls land in Phase 1, which is the correct forcing function.

### Phase 1: Storage Foundation

**Rationale:** Every other feature depends on the persistence layer and the `project.json` schema contract. The serialization architecture (metadata JSON vs. binary blobs) must be locked before any save/load UI is built — changing it later requires re-writing all save paths and migrating stored data. This phase has no UI surface and is entirely testable in isolation.

**Delivers:** `projectSerializer.js` with stable v1 schema, `projectDb.js` with versioned IndexedDB schema and CRUD, `navigator.storage.persist()` call on first write, size-gate policy (metadata in IDB, blobs >5 MB server-side). Produces fully tested, UI-agnostic persistence primitives.

**Features (from FEATURES.md):** IndexedDB project store (foundational prerequisite for all other features)

**Must avoid:**
- File blobs embedded in `project.json` via base64 (Pitfall 1)
- Missing `onversionchange` handler (Pitfall 3)
- Main-thread blob serialization without size gate (Pitfall 5)
- Treating IndexedDB as authoritative rather than as a cache (Pitfall 2)

**Research flag:** Standard patterns — well-documented IndexedDB best practices; skip research-phase during planning.

---

### Phase 2: Core Save / Load / Switch

**Rationale:** With the storage layer stable, `useProjectStore` wires it into React and `App.jsx` is lifted to consume the hook. This is the largest refactor in the project — migrating existing `useState` into project-scoped state — and should be isolated to a single phase to minimize debugging surface. The project list UI and save-state indicator are built here because they are required to validate the core concept (switching between projects without re-importing files).

**Delivers:** `useProjectStore.js` with boot hydration, load-sequence token (race-safe), `isDirty` flag; `App.jsx` refactored to consume the hook; `ProjectList.jsx` with project switcher; save-state indicator badge in header; last-opened restoration from `localStorage`; unsaved-changes warning modal.

**Features (from FEATURES.md):** Named project save, Load/open project, Full state restoration, Project list/management screen, Visual save-state indicator, Unsaved-changes warning, Last-opened restoration on page load

**Must avoid:**
- Race condition on rapid project switching (load-sequence token required)
- Tight coupling between server availability and save success (IndexedDB save must never fail because the server is down)
- Flash of empty content on boot (loading state before hydration completes)

**Research flag:** Standard React patterns — custom hooks, state hydration, `beforeunload` guard are well-documented; skip research-phase during planning.

---

### Phase 3: Project Management + Server Persistence

**Rationale:** Once save/load is validated, complete the project management surface (create, rename, delete) and add the server-side directory store. The FastAPI extension can be developed in parallel with Phase 2 since it has no React dependencies — merge it here once the browser-side is stable. This phase also adds the delete confirmation dialog and the "saved to disk" secondary indicator.

**Delivers:** `ProjectManager.jsx` (create/rename/delete modal); delete with confirmation dialog; server-side `/projects/*` FastAPI endpoints; `serverApi.js` extended with project routes; dual-store save flow (IndexedDB always + server when available); "saved to disk" status in UI.

**Features (from FEATURES.md):** Rename project, Delete project with confirmation, Server directory persistence (`./projects/<name>/`)

**Must avoid:**
- Path traversal via user-supplied project names — sanitize to `/^[a-zA-Z0-9_-]{1,64}$/` and assert `pathlib.Path.resolve()` stays within the projects root (PITFALLS.md security section)
- Server write-order bug — write to server first; write to IndexedDB only after server confirms success to prevent divergent states

**Research flag:** FastAPI file I/O and `pathlib` path safety are well-documented; skip research-phase. Path sanitization logic warrants careful unit testing.

---

### Phase 4: Export / Import

**Rationale:** Export and import are self-contained features that depend on a stable `project.json` schema (Phase 1) and a working project list (Phase 2). JSZip is already a project dependency. Both modes (full project with sources, outputs-only Markdown) are well-defined — the only complexity is the dual-export UX and the server-side ZIP streaming endpoint.

**Delivers:** Export project as ZIP (two modes: full project vs. outputs-only); Import project from ZIP (rehydrate IndexedDB + optionally write to server directory); Export and import UI in `ProjectManager.jsx`.

**Features (from FEATURES.md):** Export project as ZIP, Import project from ZIP

**Must avoid:**
- File System Access API as the export path — use server `StreamingResponse` + `zipfile` for cross-browser portability
- Exporting raw source blobs by default without user choice — offer explicit "full" vs. "outputs only" modes (PITFALLS.md UX section)

**Research flag:** Python `zipfile` stdlib and FastAPI `StreamingResponse` are standard patterns; skip research-phase. Browser-side ZIP import via JSZip already used in the project; skip research-phase.

---

### Phase Ordering Rationale

- **Foundation-first is mandatory:** The `project.json` schema is the contract between IndexedDB and the server. Changing it mid-build forces migration of stored data and re-writes of all save/load paths. It must be locked in Phase 1 before any UI ships.
- **State before UI:** `useProjectStore` must be stable before `ProjectList` is built. UI bugs are surface-level; state bugs cause data loss and race conditions. Phases 1 and 2 maintain this separation.
- **Server extension is decoupled:** The FastAPI routes have no React dependencies. They can be developed in parallel during Phase 2 and merged in Phase 3. This reduces Phase 3 to integration work rather than greenfield development.
- **Export/import is intentionally last:** It depends on a stable schema (Phase 1) and a complete project management surface (Phases 2–3). Attempting it earlier risks the schema changing under the export format.

### Research Flags

Phases that need deeper research during planning:
- **None identified.** All four phases use well-documented patterns (IndexedDB schema management, React custom hooks, FastAPI file I/O, JSZip). The pitfall research has already surfaced the non-obvious issues (Safari eviction, serialization boundary, schema versioning, path traversal).

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1:** IndexedDB best practices, Dexie schema versioning, binary blob storage — all thoroughly documented in MDN, Dexie docs, and web.dev
- **Phase 2:** React state hydration, `useRef` load-sequence token, `beforeunload` guard — standard React patterns
- **Phase 3:** FastAPI `UploadFile`, `aiofiles`, `pathlib` path safety — covered in FastAPI official docs
- **Phase 4:** Python `zipfile` stdlib, FastAPI `StreamingResponse`, JSZip browser import — all established patterns already used in the project

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All version numbers verified via npm registry, PyPI, and official release changelogs. Dexie 4.3.0 confirmed Jan 2025. `aiofiles` 25.1.0 confirmed on PyPI. Browser API coverage figures from caniuse.com. |
| Features | HIGH | Patterns derived from Figma, VS Code, Excalidraw reference implementations. Storage limits from MDN official spec documentation. UX conventions from Nielsen Norman Group. |
| Architecture | HIGH | Component boundaries verified against MDN IndexedDB spec, Chrome DevRel File System Access API docs, and official FastAPI documentation. All anti-patterns documented against known failure modes. |
| Pitfalls | HIGH (IDB/serialization), MEDIUM (FSAA permissions) | Safari 7-day eviction from official WebKit blog. IndexedDB pitfalls from web.dev best practices and RxDB research. FSAA permission model from Chrome DevRel — medium confidence because behavior varies by browser version and the API is still evolving. |

**Overall confidence:** HIGH

### Gaps to Address

- **Safari ITP 7-day eviction is unverifiable in development without simulating time.** The design decision (server = authoritative, IDB = cache) mitigates this at the architecture level, but the specific behavior of `navigator.storage.persist()` on Safari for installed PWAs vs. regular browser tabs should be documented in the project README rather than assumed.

- **File size distribution for this project is estimated, not measured.** The 5 MB size gate (metadata in IDB vs. blobs server-side) is based on the stated "1–50 MB per file" range. If actual source files are consistently under 5 MB, all blobs can go in IndexedDB and the server dependency for file storage is eliminated. Measure actual file sizes in Phase 1 before finalizing the size gate.

- **The `project.json` schema version 1 is illustrative, not finalized.** The schema in ARCHITECTURE.md is a well-structured starting point, but the exact fields for chapter assignment confidence, conversion quality indicators, and UI state must be validated against `App.jsx`'s actual state shape before `projectSerializer.js` is written.

---

## Sources

### Primary (HIGH confidence)
- [Dexie.js GitHub Releases](https://github.com/dexie/Dexie.js/releases) — v4.3.0 confirmed Jan 2025
- [dexie.org](https://dexie.org) — React integration, `useLiveQuery()` hook, schema versioning
- [aiofiles PyPI](https://pypi.org/project/aiofiles/) — v25.1.0 release date and API
- [Using IndexedDB — MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) — schema, versioning, `onupgradeneeded`
- [Storage quotas and eviction criteria — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — per-browser quota figures
- [StorageManager: persist() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) — persistence API behavior
- [Persistent permissions for FSAA — Chrome Developers](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) — Chrome 122+ permission model
- [Can I Use: File System Access API](https://caniuse.com/native-filesystem-api) — 32.88% global support, no Firefox/Safari
- [Request Files — FastAPI official docs](https://fastapi.tiangolo.com/tutorial/request-files/) — `UploadFile` + `aiofiles` patterns
- [Best Practices for Persisting App State with IndexedDB — web.dev](https://web.dev/articles/indexeddb-best-practices-app-state) — serialization boundary, blob storage
- [Confirmation Dialogs Can Prevent User Errors — Nielsen Norman Group](https://www.nngroup.com/articles/confirmation-dialog/) — UX patterns for destructive actions
- [Updates to Storage Policy (Safari ITP) — WebKit Blog](https://webkit.org/blog/14403/updates-to-storage-policy/) — 7-day eviction policy
- [Path Traversal — OWASP](https://owasp.org/www-community/attacks/Path_Traversal) — sanitization requirements

### Secondary (MEDIUM confidence)
- [IndexedDB Max Storage Size Limit — RxDB](https://rxdb.info/articles/indexeddb-max-storage-limit.html) — per-browser quota synthesis
- [Solving IndexedDB Slowness — RxDB](https://rxdb.info/slow-indexeddb.html) — transaction batching, main-thread blocking
- [Offline-first frontend apps in 2025 — LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) — architecture patterns
- [Handling IndexedDB Upgrade Version Conflict — DEV Community](https://dev.to/ivandotv/handling-indexeddb-upgrade-version-conflict-368a) — `blocked` event handling

### Tertiary (LOW confidence)
- None identified. All research claims are backed by primary or secondary sources.

---

*Research completed: 2026-03-17*
*Ready for roadmap: yes*
