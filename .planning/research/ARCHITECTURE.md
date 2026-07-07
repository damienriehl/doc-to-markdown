# Architecture Research

**Domain:** Browser workspace persistence for a React SPA with optional FastAPI backend
**Researched:** 2026-03-17
**Confidence:** HIGH (IndexedDB schema, File System Access API, FastAPI patterns verified against MDN, Chrome DevRel, and official FastAPI docs)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          React UI Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ ProjectList  │  │ WorkspaceView│  │  ProjectManagerModal     │  │
│  │   (switcher) │  │ (active proj)│  │  (create/rename/delete)  │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         └────────────────┬┘──────────────────────-┘                │
│                          ↓                                          │
│              ┌───────────────────────┐                              │
│              │   useProjectStore     │ ← single source of truth     │
│              │   (React state hook)  │   for active project         │
│              └───────────┬───────────┘                              │
├──────────────────────────┼──────────────────────────────────────────┤
│                  Persistence Service Layer                           │
│         ┌────────────────┴────────────────┐                        │
│         ↓                                 ↓                        │
│  ┌──────────────┐               ┌──────────────────┐               │
│  │ projectDb.js │               │  serverApi.js    │               │
│  │ (IndexedDB)  │               │  (FastAPI client)│               │
│  └──────┬───────┘               └────────┬─────────┘               │
│         │                                │                         │
│    blobs + metadata                 directory I/O                  │
│    instant reload                   source files                   │
│    offline cache                    zip export                     │
├─────────────────────────────────────────────────────────────────────┤
│                         Storage Layer                                │
│  ┌──────────────────────────────┐  ┌───────────────────────────┐   │
│  │  IndexedDB                   │  │  FastAPI Server (optional) │   │
│  │  projects / files / outputs  │  │  ./projects/<name>/        │   │
│  │  (browser-managed, ~GBs)     │  │  sources/, outputs/,       │   │
│  └──────────────────────────────┘  │  project.json              │   │
│                                    └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `ProjectList` | Enumerate saved projects, trigger load/switch | React component, reads project index from IndexedDB |
| `WorkspaceView` | Render active project files, results, UI state | Existing `App.jsx` behavior, lifted into project context |
| `ProjectManagerModal` | Create, rename, delete, export projects | Modal component, calls persistence service layer |
| `useProjectStore` | Active project state: files, results, settings, chapter assignments | Custom hook wrapping `useState` + persistence callbacks |
| `projectDb.js` | All IndexedDB reads/writes; project listing, CRUD, file blob storage | Pure JS module, no React dependencies |
| `serverApi.js` (extended) | Project save/load/list/export via FastAPI when server is running | Extends existing module with project endpoints |
| `server.py` (extended) | Filesystem I/O: read/write `./projects/` directory tree, ZIP export | Extends existing FastAPI app with `/projects/*` routes |

## Recommended Project Structure

```
src/
├── projectDb.js          # IndexedDB adapter — all IDB reads/writes
├── projectSerializer.js  # Serialize/deserialize project state ↔ JSON
├── serverApi.js          # Extended: existing convert API + project API calls
├── useProjectStore.js    # React hook: active project state + save/load triggers
├── App.jsx               # Lifted: consumes useProjectStore instead of raw useState
└── components/
    ├── ProjectList.jsx   # Project switcher sidebar or dropdown
    └── ProjectManager.jsx # Create / rename / delete / export modal

server.py                 # Extended: add /projects/* endpoints
projects/                 # Server-managed directory (gitignored or shared)
├── .gitkeep
└── <project-name>/
    ├── project.json      # Metadata + settings + UI state (no binaries)
    ├── sources/          # Original source files (DOCX, PDF, etc.)
    └── outputs/          # Generated markdown files
```

### Structure Rationale

- **`projectDb.js` separate from `useProjectStore.js`:** Storage logic (IndexedDB transactions, schema, versioning) must not live inside React hooks. Keeping it pure JS makes it testable, reusable, and swappable.
- **`projectSerializer.js` as a boundary:** Defines the canonical `project.json` schema in one place. Both IndexedDB writes and server saves pass through here, ensuring the two storage targets stay in sync.
- **`components/` subfolder:** The project UI components (list, manager) are new surface area. Isolating them prevents `App.jsx` from becoming a monolith.
- **`projects/` at repo root:** Keeps source files co-located with the tool, easy to gitignore for private work or commit for sharing.

## Architectural Patterns

### Pattern 1: Dual Storage with IndexedDB as Primary Cache

**What:** IndexedDB holds the complete project snapshot (metadata + file blobs + outputs). The server directory is a secondary persistence target, written on explicit user save and read on explicit user load. IndexedDB is always read first; the server is only consulted when the user requests a load from disk.

**When to use:** Any local-first app where instant load matters more than portability. The browser can open a project in milliseconds from IndexedDB; loading from the server requires a round-trip even on localhost.

**Trade-offs:** IndexedDB data is origin-bound (lost if browser data is cleared). Server directory is durable and portable. Both are needed — IndexedDB for speed, server directory for durability/sharing.

**Example:**
```javascript
// projectDb.js — load project from IDB, fall back to server
export async function loadProject(projectId) {
  const cached = await idbGetProject(projectId);
  if (cached) return cached;
  // Not in IDB: try server if available
  if (await isServerAvailable()) {
    const project = await serverApi.getProject(projectId);
    await idbPutProject(project); // warm the cache
    return project;
  }
  return null;
}
```

### Pattern 2: Project Serialization via a Stable project.json Schema

**What:** All project state serializes to a single canonical JSON document. Binary files (source documents, output markdown) are stored as adjacent files referenced by path in `project.json`. IndexedDB stores the same JSON plus blobs in separate object stores.

**When to use:** Always — this is the contract between the browser and the server, and between today's code and future migrations.

**Trade-offs:** A flat schema is easy to evolve. Nesting state deeply (e.g., per-file conversion results nested inside file objects) makes partial updates expensive (must re-serialize everything). Prefer shallow top-level keys.

**Example schema:**
```json
{
  "version": 1,
  "id": "trialbook-vol-1",
  "name": "Trialbook Volume 1",
  "createdAt": "2026-03-17T00:00:00Z",
  "updatedAt": "2026-03-17T12:00:00Z",
  "settings": {
    "pdfEngine": "marker",
    "outputDir": "outputs/"
  },
  "files": [
    {
      "id": "f-001",
      "name": "Chapter-01.docx",
      "size": 204800,
      "type": "application/vnd.openxmlformats...",
      "chapterNum": 1,
      "chapterNumConfidence": 1,
      "chapterNumStrategy": "chapter"
    }
  ],
  "outputs": [
    {
      "fileId": "f-001",
      "outputName": "01-chapter-one.md",
      "convertedAt": "2026-03-17T12:00:00Z",
      "quality": "server"
    }
  ],
  "ui": {
    "selectedFileIds": ["f-001"],
    "expandedSections": ["files", "results"]
  }
}
```

### Pattern 3: State Restoration via a Loading Phase

**What:** On app mount, `useProjectStore` enters a `loading` state while it reads the project index from IndexedDB. The UI renders a loading skeleton or empty state during this phase. Once hydrated, the UI switches to normal rendering. This prevents the "flash of empty content" problem.

**When to use:** Any time state must be restored from async storage before the UI is meaningful. This is the standard pattern for React apps with persistent state — identical to how Zustand/Redux Persist work, applied without those libraries.

**Trade-offs:** Adds a loading state the UI must handle (one extra conditional render path). The alternative — rendering with empty state and filling it in — causes visual jank and can trigger race conditions if the user interacts before hydration finishes.

**Example:**
```javascript
// useProjectStore.js
export function useProjectStore() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready'
  const [projectIndex, setProjectIndex] = useState([]);
  const [activeProject, setActiveProject] = useState(null);

  useEffect(() => {
    projectDb.listProjects().then(projects => {
      setProjectIndex(projects);
      setStatus('ready');
    });
  }, []);

  return { status, projectIndex, activeProject, loadProject, saveProject };
}
```

## Data Flow

### Save Project Flow

```
User clicks "Save"
    ↓
useProjectStore.saveProject(name)
    ↓
projectSerializer.serialize(state)  →  project.json + file blobs
    ↓                                        ↓
projectDb.putProject(...)            isServerAvailable()?
(IndexedDB — always)                    ↓ YES
                                  serverApi.saveProject(...)
                                  POST /projects/{id}/save
                                  (multipart: project.json + files)
                                        ↓
                                  server writes ./projects/<name>/
```

### Load Project Flow

```
User selects project from ProjectList
    ↓
useProjectStore.loadProject(projectId)
    ↓
projectDb.getProject(projectId) — IDB cache check
    ↓ HIT                          ↓ MISS
deserialize → set state     isServerAvailable()?
                                ↓ YES
                          serverApi.getProject(id)
                          GET /projects/{id}
                          (returns project.json + file blobs)
                                ↓
                          projectDb.putProject(...)  ← warm cache
                                ↓
                          deserialize → set state
```

### App Boot / State Restoration Flow

```
App.jsx mounts
    ↓
useProjectStore initializes (status = 'loading')
    ↓
projectDb.listProjects() — reads IndexedDB project index
    ↓
status → 'ready', projectIndex populated
    ↓
IF activeProjectId in localStorage:
    auto-load last active project from IDB
    ↓
UI renders with restored state
```

### Key Data Flows

1. **File blob storage:** Source files are stored as `Blob` objects in IndexedDB's `files` object store, keyed by `projectId + fileId`. They are NOT stored inside `project.json` (binary data as base64 inflates JSON enormously). The JSON holds only metadata (name, size, type, chapter number).

2. **Output markdown storage:** Generated markdown is stored as plain text in IndexedDB's `outputs` object store. On server save, written to `./projects/<name>/outputs/*.md`.

3. **Project index:** A lightweight index of `{ id, name, updatedAt }` records is kept in a separate `projectIndex` object store (or as a well-known key in a settings store). This allows `ProjectList` to enumerate projects without loading all file blobs.

4. **Server sync signal:** When the server writes successfully, `project.json` gets a `savedToServer: true` flag and `serverSavedAt` timestamp. The UI can display a "saved to disk" indicator.

## Scaling Considerations

This is a single-user local tool; traditional scale concerns do not apply. The relevant scaling dimension is **project count × file size**.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1–5 projects, small files (<5MB each) | All blobs in IndexedDB; no server required; simplest path |
| 5–15 projects, medium files (5–50MB each) | IndexedDB handles this; ~750MB total well within browser limits. Server directory adds redundancy. |
| 15+ projects or files >50MB each | IndexedDB storage quota pressure. Load blobs lazily (don't preload all files on project switch — load on first use). Server becomes the authoritative store; IDB is just a hot cache. |

### Scaling Priorities

1. **First constraint:** IndexedDB quota. Chrome allows up to ~80% of available disk, but the soft eviction threshold is lower. For projects with large PDFs, load file blobs on demand rather than eagerly on project load. Store only metadata in the project index.

2. **Second constraint:** Project switch latency. Loading all file blobs synchronously on project switch will feel slow at 15+ projects. Solve with lazy loading: load metadata first, load blobs only when the user triggers a conversion.

## Anti-Patterns

### Anti-Pattern 1: Storing File Blobs Inside project.json

**What people do:** Serialize File objects by base64-encoding them and embedding in the JSON.

**Why it's wrong:** A 10MB DOCX becomes ~13.5MB of base64 text. Loading the project requires parsing the entire blob before any rendering. IndexedDB is slower for large text values than for native Blob objects. The JSON becomes unreadable for debugging.

**Do this instead:** Store file metadata (name, size, type, chapter number) in `project.json`. Store the actual binary in IndexedDB's `files` object store as a `Blob`, referenced by `fileId`. On server save, write the file to `sources/<filename>` as a binary file.

### Anti-Pattern 2: Writing to IndexedDB on Every State Change

**What people do:** Treat IndexedDB like a reactive store — update IDB on every `setState` call (e.g., every keystroke in a chapter number field).

**Why it's wrong:** IndexedDB writes are asynchronous but not free. Rapid sequential writes can queue up and cause visible lag. The schema requires transaction-level consistency — partial writes leave the database in an inconsistent state.

**Do this instead:** Keep React state as the single source of truth during a session. Write to IndexedDB only on explicit user save actions, and on graceful unload (`beforeunload` event). If autosave is needed later, debounce it (e.g., 2 seconds of inactivity).

### Anti-Pattern 3: Tight Coupling Between Server Availability and Core UX

**What people do:** Make the save/load flow require the server to be running. Show errors when the server is unavailable.

**Why it's wrong:** The server is optional. Users may run the web app standalone (without `python server.py`). If save/load requires the server, the feature is broken for standalone users.

**Do this instead:** IndexedDB save/load must work completely without the server. Server directory persistence is an enhancement that runs in parallel when available. On server failure, the save still succeeds (IndexedDB), and the UI notes "saved to browser cache only" rather than showing an error.

### Anti-Pattern 4: Storing FileSystemDirectoryHandle Without Permission Re-Check

**What people do:** Persist a `FileSystemDirectoryHandle` in IndexedDB across sessions and use it directly without querying permissions first.

**Why it's wrong:** Permissions reset between sessions in most browsers before Chrome 122. Even with Chrome 122+ persistent permissions, the `queryPermission()` check is required before use. Without the check, operations silently fail or throw `SecurityError`.

**Do this instead:** On session restore, call `handle.queryPermission({ mode: 'readwrite' })` first. If it returns `'prompt'`, call `handle.requestPermission({ mode: 'readwrite' })` before attempting any file writes. This is the pattern VS Code uses.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| FastAPI `server.py` | REST calls via extended `serverApi.js`; server remains optional | All new endpoints follow same CORS config as existing `/convert` |
| IndexedDB | Direct browser API via `projectDb.js` abstraction | No library needed; native API is sufficient for this use case |
| File System Access API | `showDirectoryPicker()` for user-chosen export location | Chromium-only (Chrome/Edge). Not baseline — treat as progressive enhancement |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `App.jsx` ↔ `useProjectStore` | React hook API (`status`, `activeProject`, callbacks) | App.jsx must not call `projectDb.js` directly — all persistence goes through the hook |
| `useProjectStore` ↔ `projectDb.js` | Async function calls | `projectDb.js` is pure JS, no React. Keeps storage logic independently testable |
| `useProjectStore` ↔ `serverApi.js` | Async function calls; gated by `isServerAvailable()` | Server calls are always optional — never block the happy path |
| `projectDb.js` ↔ `projectSerializer.js` | `serialize(state)` → plain object; `deserialize(data)` → state shape | Serializer defines the schema contract; DB module is schema-agnostic |
| `server.py` ↔ filesystem | Path operations via Python `pathlib`; ZIP via `zipfile` stdlib | No new Python dependencies needed for basic project I/O |

## Suggested Build Order

Dependencies between components determine which phases must come before others:

1. **`projectSerializer.js` + schema** — Everything else depends on the serialization contract. Define `project.json` shape, version field, and `serialize()`/`deserialize()` functions first. Write unit tests. This is zero-UI work and unblocks all other components.

2. **`projectDb.js`** — IndexedDB adapter. Depends on the serializer schema. Build schema (object stores: `projects`, `files`, `outputs`, `projectIndex`), versioning, and CRUD operations. Test independently with raw IDB calls. This is the persistence foundation for the entire feature.

3. **`useProjectStore.js`** — React integration hook. Depends on `projectDb.js`. Wraps IDB calls in React lifecycle (`useEffect` for boot hydration, callbacks for save/load/switch). This is when the persistence layer first becomes visible in the UI.

4. **`App.jsx` lift** — Migrate existing `useState` hooks into `useProjectStore`. This is the largest refactor. The hook from step 3 defines the exact API `App.jsx` consumes. Do this after step 3 is stable to minimize debugging two things at once.

5. **`ProjectList.jsx` + `ProjectManager.jsx`** — UI components. Depend on `useProjectStore`. Build the switcher and management modal only after the state layer works correctly. UI bugs are easier to fix than state bugs.

6. **Server-side project endpoints** — Extend `server.py` with `/projects/*` routes. Depends on the `project.json` schema from step 1. Can be developed in parallel with steps 3–5 since it has no React dependencies. Integrate into `serverApi.js` last.

## Sources

- [Using IndexedDB — MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) (HIGH confidence — official spec documentation)
- [IndexedDB API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) (HIGH confidence — official spec documentation)
- [Persistent permissions for the File System Access API — Chrome Developers](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) (HIGH confidence — official Chrome DevRel)
- [Window: showDirectoryPicker() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) (HIGH confidence — official spec documentation)
- [Offline-first frontend apps in 2025: IndexedDB and SQLite — LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) (MEDIUM confidence — editorial, architecture patterns section verified against MDN)
- [Browser Storage in React SPAs — mikihands.com](https://blog.mikihands.com/en/whitedec/2025/11/17/spa-react-browser-storage-complete-guide/) (MEDIUM confidence — editorial, recommendations consistent with MDN)
- [Request Files — FastAPI official docs](https://fastapi.tiangolo.com/tutorial/request-files/) (HIGH confidence — official FastAPI documentation)
- [Storage quotas and eviction criteria — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) (HIGH confidence — official spec documentation)

---
*Architecture research for: browser workspace persistence (React SPA + IndexedDB + FastAPI)*
*Researched: 2026-03-17*
