# Roadmap: Doc-to-Markdown Project Save/Load

## Overview

Build a workspace persistence system on top of the existing doc-to-markdown converter. Start by locking the storage schema and IndexedDB primitives (Phase 1), then wire persistence into React with the full save/load/switch UX (Phase 2), then complete project management and add server-side durability (Phase 3), and finally deliver portable export/import (Phase 4). Each phase ships a complete, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Storage Foundation** - IndexedDB schema, serializer, and CRUD layer — no UI
- [ ] **Phase 2: Core Save / Load / Switch** - React hook, App.jsx lift, project list, save-state indicator, unsaved-changes guard
- [ ] **Phase 3: Project Management + Server Persistence** - Rename, delete w/ confirmation, FastAPI project routes, dual-store save
- [ ] **Phase 4: Export / Import** - ZIP export (full + outputs-only), ZIP import, export/import UI

## Phase Details

### Phase 1: Storage Foundation
**Goal**: A tested, UI-agnostic persistence layer exists that all future phases build on
**Depends on**: Nothing (first phase)
**Requirements**: STOR-01, STOR-02, STOR-03, STOR-04
**Success Criteria** (what must be TRUE):
  1. A `project.json` schema contract exists with fields for metadata, settings, and UI state — serializable without any `File` objects
  2. Source files (DOCX/PDF/etc.) are stored as binary blobs in IndexedDB separate from the JSON metadata, and can be retrieved by ID
  3. A project can be saved to IndexedDB and fully retrieved in a subsequent page load (all fields intact)
  4. The last-opened project ID is persisted and survives a browser refresh
  5. `navigator.storage.persist()` is called on first save and its result is handled gracefully
**Plans:** 1/2 plans executed

Plans:
- [ ] 01-01-PLAN.md — Define project.json schema contract and implement projectSerializer.js (serialize/deserialize with File extraction)
- [ ] 01-02-PLAN.md — Install Dexie.js, implement projectDb.js (IndexedDB CRUD, blob storage, last-project-ID, persistent storage)

### Phase 2: Core Save / Load / Switch
**Goal**: Users can name, save, reload, and switch between projects without re-importing files
**Depends on**: Phase 1
**Requirements**: STOR-01, STOR-02, STOR-03, STOR-04, STAT-01, STAT-02, PROJ-01, PROJ-04
**Success Criteria** (what must be TRUE):
  1. User can type a project name and save the current workspace; a confirmation appears when save completes
  2. User can select any saved project from a list and the full workspace (files, results, settings) is restored — no re-import needed
  3. After a page refresh, the last-opened project loads automatically without user action
  4. A visible badge in the header shows "Unsaved", "Saving...", or "Saved" based on actual state
  5. Switching to another project while unsaved changes exist shows a warning dialog; confirming discards changes, canceling stays on the current project
**Plans**: TBD

Plans:
- [ ] 02-01: Implement `useProjectStore.js` (boot hydration, load-sequence token, isDirty flag)
- [ ] 02-02: Refactor `App.jsx` state into `useProjectStore`
- [ ] 02-03: Build `ProjectList.jsx` with switcher, project cards (name, date, file count), save-state badge, and unsaved-changes modal

### Phase 3: Project Management + Server Persistence
**Goal**: Users can manage their project library (rename, delete) and projects are durably backed on the filesystem
**Depends on**: Phase 2
**Requirements**: PROJ-02, PROJ-03
**Success Criteria** (what must be TRUE):
  1. User can rename a project from the project list; the new name appears immediately and persists across page reloads
  2. User can delete a project; a confirmation dialog appears before deletion and the project is removed from the list afterward
  3. When the local FastAPI server is running, saving a project also writes `./projects/<name>/project.json` and source files to disk
  4. Server unavailability never blocks or fails an IndexedDB save — the UI save path succeeds independently
**Plans**: TBD

Plans:
- [ ] 03-01: Build `ProjectManager.jsx` (create/rename/delete modal with confirmation dialog)
- [ ] 03-02: Extend `server.py` with `/projects/*` REST endpoints and extend `serverApi.js` with project client methods

### Phase 4: Export / Import
**Goal**: Users can move projects between machines as portable ZIP archives
**Depends on**: Phase 3
**Requirements**: EXPT-01, EXPT-02
**Success Criteria** (what must be TRUE):
  1. User can export a project as a ZIP file downloaded to their machine; the ZIP contains at minimum all generated Markdown outputs
  2. User can choose "full project" export mode to include source files in the ZIP alongside outputs and settings
  3. User can import a project from a ZIP archive; the imported project appears in the project list and can be opened immediately
**Plans**: TBD

Plans:
- [ ] 04-01: Implement ZIP export (full and outputs-only modes) via server `StreamingResponse`
- [ ] 04-02: Implement ZIP import (rehydrate IndexedDB, optionally write server directory), add export/import UI to `ProjectManager.jsx`

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Storage Foundation | 1/2 | In Progress|  |
| 2. Core Save / Load / Switch | 0/3 | Not started | - |
| 3. Project Management + Server Persistence | 0/2 | Not started | - |
| 4. Export / Import | 0/2 | Not started | - |
