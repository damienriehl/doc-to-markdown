# Pitfalls Research

**Domain:** Browser workspace persistence — project save/load/manage for a local doc-to-markdown web app
**Researched:** 2026-03-17
**Confidence:** HIGH (IndexedDB/storage quotas), MEDIUM (File System Access API permissions), HIGH (serialization)

---

## Critical Pitfalls

### Pitfall 1: Storing File Objects Directly in IndexedDB State

**What goes wrong:**
The React app holds `File` objects in `useState`. When saving a project, developers serialize state to JSON and find that `File` objects collapse to `{}` — a silent, complete data loss. On reload, `files` is an array of empty objects with no name, size, or content.

**Why it happens:**
`JSON.stringify()` cannot handle `File` objects (they are not plain-serializable). `File` inherits from `Blob`, and structured clone (used by IndexedDB) _can_ preserve `File` objects, but `JSON.stringify()` — the natural choice for `project.json` or any text-based persistence — silently discards them. The distinction between "IndexedDB can store it via structured clone" and "my JSON serializer will lose it" is non-obvious.

**How to avoid:**
Separate the state model into two layers before writing any persistence code:

1. **Serializable metadata** (`project.json`): file names, sizes, MIME types, conversion results, settings, UI state — all plain JSON.
2. **Binary blobs** (IndexedDB or server `sources/`): `File`/`ArrayBuffer` keyed by a stable ID (e.g., SHA-256 content hash or UUID assigned at import time).

Never pass `File` objects through `JSON.stringify()`. In IndexedDB, store the `ArrayBuffer` directly (not Base64 — that inflates size ~33% and has no retrieval advantage).

**Warning signs:**
- `JSON.stringify(state)` produces `"files":[]` or `"files":[{}]`
- Loaded project shows file names but zero-byte content
- Console shows `DataCloneError` during any structured clone path

**Phase to address:** Storage Layer foundation phase — must be decided before any save/load UI is built.

---

### Pitfall 2: Treating IndexedDB as Durable — Safari Evicts Without Warning

**What goes wrong:**
IndexedDB data disappears after 7 days of inactivity on Safari (macOS and iOS). A user who opens the app weekly for a multi-week project returns to find their projects wiped. No error, no warning — the database simply no longer exists.

**Why it happens:**
Safari's Intelligent Tracking Prevention (ITP) deletes all script-writable storage (IndexedDB, localStorage, Cache API) if an origin has had no user interaction in 7 calendar days. This was introduced to prevent cross-site tracking, but it applies identically to legitimate PWAs and single-user tools. The `navigator.storage.persist()` call only partially mitigates this — Chrome auto-grants or auto-denies it silently based on engagement heuristics; Firefox prompts the user; Safari honors it only for installed (home-screen) apps.

**How to avoid:**
IndexedDB must be treated as a **performance cache**, not the authoritative store. The authoritative store must be the server-side `./projects/<name>/` directory (written via FastAPI endpoints). The dual-storage architecture described in `PROJECT.md` is the correct approach — but the design must be explicit: server = source of truth, IndexedDB = load-time cache. On every load, check if the cache matches the server state (compare a manifest checksum), not whether the cache exists.

Also: call `navigator.storage.persist()` on first project save and surface a clear message if denied. Do not silently assume it was granted.

**Warning signs:**
- App tested only in Chrome (Safari eviction never hit during development)
- IndexedDB treated as the primary store with server as backup
- No mechanism to detect "cache miss — reload from server"

**Phase to address:** Storage architecture phase — the server-first vs. cache-first decision must be locked before implementation.

---

### Pitfall 3: IndexedDB Schema Has No Migration Path

**What goes wrong:**
Version 1 of the schema is shipped. A later phase changes the stored shape (e.g., adds a `conversionQuality` field to each file record, or restructures from `files[]` to `files{}` keyed by ID). On load in the new version, reads against the old schema return malformed data, or the version upgrade blocks while old tabs are open, or — worst — the `onupgradeneeded` handler is missing and the database silently stays on the old schema.

**Why it happens:**
IndexedDB schema changes require incrementing `DB_VERSION` and handling all upgrade paths in `onupgradeneeded`. Developers often write the initial schema without thinking about upgrades, then discover mid-project that schema migrations are non-trivial. Multiple open tabs compound this: the new tab fires `blocked` because old tabs hold a connection at the lower version, and if those tabs don't handle `onversionchange` → `db.close()`, the upgrade never runs.

**How to avoid:**
From day one, version the schema (`DB_VERSION = 1`) and write the `onupgradeneeded` handler as if it will be extended. Register an `onversionchange` handler that closes the connection so future upgrades are never blocked:

```javascript
db.onversionchange = () => {
  db.close();
  // Optionally: notify user to reload
};
```

Also handle `blocked` in the open request with a user-visible "please close other tabs" message rather than a silent hang.

**Warning signs:**
- `DB_VERSION` is a magic number buried in one place with no comment about upgrade path
- No `onversionchange` handler anywhere in the codebase
- Schema was changed without incrementing the version number
- App hangs on load in a second tab after a code update

**Phase to address:** Storage Layer foundation phase — schema versioning costs nothing to add upfront, is very expensive to retrofit.

---

### Pitfall 4: File System Access API Permissions Expire Between Sessions

**What goes wrong:**
A directory handle obtained from `showDirectoryPicker()` is persisted in IndexedDB (handles are structured-cloneable). On next load, the handle is retrieved, but attempts to write immediately throw `NotAllowedError` — the permission was session-scoped, not persistent. The app appears to "know" where to save but silently fails.

**Why it happens:**
The File System Access API distinguishes "handle" (the reference to a directory, which persists) from "permission" (the grant to read/write it, which is session-scoped by default). Persistent permissions ("Allow on every visit") are a new Chrome 122+ feature that requires explicit user grant at the permission prompt — the user must choose "Always allow," not the default "Allow this time." Firefox does not support the API at all. Safari does not implement `showDirectoryPicker`.

**How to avoid:**
This project's architecture already routes filesystem writes through the FastAPI server (correct), which avoids this problem entirely for the primary write path. However, if any phase introduces direct browser-side directory writing:

1. Never assume a stored handle has write permission — always call `handle.queryPermission({ mode: 'readwrite' })` on load and prompt the user to re-grant if needed.
2. Build a fallback: if permission is denied, offer download-as-ZIP or server-side save.
3. For cross-browser support, restrict File System Access API usage to Chrome/Edge; never make it the only save path.

**Warning signs:**
- Code reads a handle from IndexedDB and immediately writes without calling `queryPermission()`
- Save functionality tested only in Chrome with "Allow on every visit" already set
- No error handling on `FileSystemWritableFileStream` operations

**Phase to address:** Export/import phase if ZIP export is added; also any phase that considers direct browser-to-disk writing.

---

### Pitfall 5: Main-Thread Blocking on Large File Serialization

**What goes wrong:**
PDFs and DOCX files in this project are 1–50 MB. When a project is saved, storing all source files in IndexedDB requires structured cloning each `ArrayBuffer` synchronously on the main thread. For a project with 10 × 10 MB PDFs, this causes a 2–5 second UI freeze. Users cannot interact with the app during the save. On slower devices, Chrome's "Aw, Snap" memory limit can be hit.

**Why it happens:**
IndexedDB's structured clone algorithm runs on the main thread. The transaction write itself is off-thread, but the serialization step — which must complete before the write is queued — blocks JavaScript execution. Storing one 50 MB file per transaction compounds this with transaction overhead on top of the serialization cost.

**How to avoid:**
Use Web Workers for bulk binary writes to IndexedDB. The Worker serializes and writes; the main thread only updates UI progress. Additionally, batch multiple files into one transaction (not one transaction per file — readwrite transactions queue and each waits for the previous). For this project specifically: source files > 5 MB should prefer server-side storage via the FastAPI `POST /convert` endpoint rather than IndexedDB.

Implement a size gate: files under 5 MB can be cached in IndexedDB; files over 5 MB are always server-side only, with IndexedDB holding only the metadata (name, hash, server path).

**Warning signs:**
- `await db.put(largeArrayBuffer)` called directly from a React event handler
- One IndexedDB `put` call per file in a loop
- No progress indication during save — user sees a frozen UI

**Phase to address:** Storage Layer foundation phase — the size-gating policy must be decided before the save API is designed.

---

### Pitfall 6: Race Condition When Switching Projects Before Load Completes

**What goes wrong:**
User clicks "Load Project A", which starts an async IndexedDB read and server fetch. Before it completes, they click "Load Project B". Both async operations complete in arbitrary order. The app ends up in a state where the UI shows Project B's name but Project A's files (or a half-merged mix).

**Why it happens:**
React state updates from async operations are not automatically cancelled when stale. The first `loadProject()` call continues after the second has started, and its `setState` calls apply to the current render regardless of which project was most recently requested.

**How to avoid:**
Implement a load-sequence token (incrementing counter or AbortController). Each `loadProject()` call captures the current token at start. On completion, it checks whether its token is still current before applying state. If not, the update is discarded.

```javascript
const loadToken = useRef(0);
async function loadProject(id) {
  const myToken = ++loadToken.current;
  const data = await fetchProject(id);
  if (loadToken.current !== myToken) return; // stale
  setProjectState(data);
}
```

Additionally, disable the project list during an active load, or show a loading overlay that prevents switching.

**Warning signs:**
- `loadProject()` calls `setState` inside an async callback with no stale-check
- No loading state that prevents UI interaction during project switches
- Only tested with one project in the list (race never observed)

**Phase to address:** Project management UI phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store everything as one large JSON blob in IndexedDB | Simple to implement | Main-thread freeze on save/load; any change rewrites entire blob; schema migration requires reading and rewriting all data | Never — break into records from the start |
| Use Base64 for binary storage in IndexedDB | Familiar string handling | 33% size inflation; slower encode/decode; loses MIME type info | Never for files over 1 MB |
| Skip `navigator.storage.persist()` | Fewer lines of code | Eviction on low-disk devices; Safari 7-day wipe; no user awareness | Never — call it unconditionally on first project save |
| Single IndexedDB version with no upgrade path | Faster initial build | Schema changes require clearing the database or shipping broken migrations | Only in a true throwaway prototype |
| Save files inline in `project.json` as Base64 | One-file portability | 50 MB file becomes 67 MB JSON; parsing blocks UI; git diffs become unreadable | Never for binary files > 100 KB |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FastAPI + project directory writes | User-supplied project name used directly in path: `./projects/{name}/` allows `../../../etc/passwd` traversal | Sanitize names: alphanumeric + hyphens only, max 64 chars, resolve path and assert it starts with the projects root: `assert resolved.startswith(BASE_DIR)` |
| IndexedDB + React 19 | Opening the database connection in the render body or a non-memoized effect, causing repeated opens and "connection already open" errors | Open once at app start (or in a singleton module), reuse the connection handle throughout the app lifetime |
| FastAPI server + IndexedDB dual-store | Write to IndexedDB first, then to server — if server write fails, IndexedDB has "saved" data that doesn't exist on disk | Write to server first; write to IndexedDB only after server confirms success |
| File System Access API + Vite dev server | `showDirectoryPicker()` works in Chrome but is undefined in Vitest (Node environment), causing test failures | Gate all FSAA calls behind `typeof window.showDirectoryPicker !== 'undefined'`; mock in tests |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One IndexedDB transaction per file during bulk save | Save of 10-file project takes 10+ seconds | Batch all file writes into a single readwrite transaction | Any project with more than 3 files |
| Reading all projects on every render to populate the project list | List takes 2+ seconds to appear after any state change | Read project manifest/metadata only (not file blobs) for the list; lazy-load file data on selection | Any project list with > 5 projects |
| Storing conversion output Markdown in IndexedDB alongside source files | Rapidly approaches quota when project has 30+ chapters | Store output as files on server only; IndexedDB holds metadata (file path, size, hash) not content | When total output exceeds ~20 MB across all projects |
| Synchronous `JSON.parse` of large `project.json` on the main thread | UI freezes for 100–500ms when loading a project with many file metadata entries | Keep `project.json` small (metadata only); for complex state, parse in chunks or use `structuredClone` in a Worker | Project files with > 100 entries |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using raw user input as the project directory name in FastAPI without sanitization | Path traversal: a project named `../../.env` writes outside the projects directory | Whitelist validation: `/^[a-zA-Z0-9_-]{1,64}$/`; then `pathlib.Path(BASE).joinpath(name).resolve()` and assert it starts with `BASE` |
| Serving project files from FastAPI without access controls | Any process on localhost can read/write any project | The existing server is already localhost-only (`server.py`); add a startup check that binding is not `0.0.0.0` |
| Storing sensitive document content in IndexedDB without considering browser profile sharing | Legal documents (Trialbook source material) visible to anyone with access to the browser's DevTools → Application → IndexedDB panel | Document that IndexedDB is unencrypted browser storage; ensure users understand this is a single-user local tool, not a shared-device tool |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback during project save (silent async operation) | User double-clicks Save, creating two concurrent writes; or navigates away thinking nothing happened | Show a save progress indicator; disable Save button while in progress; confirm with a brief "Saved" toast |
| Deleting a project with no confirmation and no undo | User accidentally deletes 3 hours of work with no recovery | Two-step delete: "Delete?" → confirm button; soft-delete: move to `./projects/_trash/` for 24 hours before permanent removal |
| Project list shows last-modified date but not file count or size | User cannot tell if a project is empty (just created) or fully loaded | Show file count, total size, and last-saved timestamp in project list entries |
| Switching projects clears current project state without asking if unsaved | User switches projects, losing work they intended to save | Track a `isDirty` flag; prompt "You have unsaved changes — save or discard?" before switching |
| Export as ZIP includes raw source files (DOCX/PDF 20+ MB) by default | Export is slow and produces a huge archive for what might be a simple "share my Markdown output" use case | Offer two export modes: "Full project (sources + outputs)" and "Outputs only (Markdown files)" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Project save:** Saving shows success toast — verify that closing the browser and re-opening restores exactly the same file list, file content, and settings (not just the project name in the list)
- [ ] **Large file handling:** Works with a 2-file project — verify with a 10-file project where total binary size is > 30 MB (quota, performance, and progress feedback all need stress-testing)
- [ ] **Schema migration:** Schema works in version 1 — verify that after a simulated version bump, an existing database is upgraded correctly rather than wiped
- [ ] **Safari persistence:** Works in Chrome — verify in Safari that projects are not silently lost after 7 days; verify that `navigator.storage.persist()` is called and its denial is handled gracefully
- [ ] **Dirty state guard:** Project switching works with saved projects — verify that switching away from a project with unsaved changes prompts the user
- [ ] **Race condition guard:** Loading one project works — verify that rapidly clicking between two projects in the list results in exactly the correct project being shown, not a blend
- [ ] **Path sanitization:** FastAPI save endpoint works with normal project names — verify that a project named `../test` or `../../etc` is rejected with a 400, not written to an unexpected path
- [ ] **IndexedDB not sole storage:** App works in Chrome — verify that it degrades gracefully when IndexedDB is unavailable (private browsing mode, storage quota exceeded) without losing user data

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| File objects serialized as `{}` in project.json | HIGH | Audit all save paths; replace JSON serialization of state with a serialization layer that extracts `ArrayBuffer` before stringify; re-test all save/load round-trips |
| IndexedDB schema corrupted by missing upgrade path | MEDIUM | Delete IndexedDB in DevTools → Application → Clear Storage; implement proper migration; users lose cached data but server-side projects survive if the server store was primary |
| Safari evicted all IndexedDB data | LOW (if server is primary) / HIGH (if IndexedDB was primary) | Re-sync from server: `GET /projects` to list, `GET /projects/{name}` to restore each; if server store was not implemented yet, data is unrecoverable |
| Path traversal allowed arbitrary file writes | HIGH | Immediately audit all FastAPI endpoints accepting project names; sanitize all existing project directories; check for unexpected files in filesystem |
| Race condition blended two project states | MEDIUM | Clear app state and force a reload from server; implement load-sequence token to prevent recurrence |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| File objects lost in JSON serialization | Storage Layer (Phase 1) | Round-trip save/load test: save project with binary files, reload, verify file count and content hash match |
| Safari 7-day eviction | Storage Layer (Phase 1) | Confirm server is primary store; test `navigator.storage.persist()` call; document for project README |
| No IndexedDB schema migration path | Storage Layer (Phase 1) | Schema versioned at `DB_VERSION = 1`; `onversionchange` handler present; `blocked` handler present |
| File System Access API permission expiry | Export/Import phase | Test loading a stored directory handle after closing and reopening the browser; verify `queryPermission()` is called before any write |
| Main-thread blocking on large file serialization | Storage Layer (Phase 1) | Profile save of 5+ large files in Chrome DevTools; no long tasks > 100ms on main thread |
| Race condition on project switch | Project Management UI phase | Automated test: trigger two `loadProject()` calls in rapid succession; assert final state matches second call only |
| Path traversal in FastAPI | Server extension phase | Unit test: POST to save endpoint with name `../../etc`; assert HTTP 400 response |
| Treating IndexedDB as primary store | Storage architecture design (pre-Phase 1) | Architecture document explicitly states "server = source of truth, IndexedDB = cache"; load path checks server first |

---

## Sources

- [Best Practices for Persisting Application State with IndexedDB — web.dev](https://web.dev/articles/indexeddb-best-practices-app-state)
- [IndexedDB Max Storage Size Limit — RxDB](https://rxdb.info/articles/indexeddb-max-storage-limit.html)
- [The pain and anguish of using IndexedDB: problems, bugs and oddities — GitHub Gist](https://gist.github.com/pesterhazy/4de96193af89a6dd5ce682ce2adff49a)
- [Solving IndexedDB Slowness for Seamless Apps — RxDB](https://rxdb.info/slow-indexeddb.html)
- [Keep storing large images, just don't index the binary data itself — Dexie.js / Medium](https://medium.com/dexie-js/keep-storing-large-images-just-dont-index-the-binary-data-itself-10b9d9c5c5d7)
- [Storage quotas and eviction criteria — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Updates to Storage Policy (Safari ITP) — WebKit Blog](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Persistent file handling with the File System Access API — Transloadit](https://transloadit.com/devtips/persistent-file-handling-with-the-file-system-access-api/)
- [Persistent permissions for the File System Access API — Chrome Developers](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- [The Many, Confusing File System APIs — Cloud Four](https://cloudfour.com/thinks/the-many-confusing-file-system-apis/)
- [Handling IndexedDB Upgrade Version Conflict — DEV Community](https://dev.to/ivandotv/handling-indexeddb-upgrade-version-conflict-368a)
- [StorageManager: persist() method — MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- [Path Traversal — OWASP](https://owasp.org/www-community/attacks/Path_Traversal)

---
*Pitfalls research for: Browser workspace persistence — doc-to-markdown project save/load*
*Researched: 2026-03-17*
