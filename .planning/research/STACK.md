# Stack Research

**Domain:** Browser workspace persistence — React 19 + Vite + FastAPI document converter
**Researched:** 2026-03-17
**Confidence:** HIGH (all key claims verified via official docs, npm registry, and PyPI)

## The Core Tension

PROJECT.md states: *"Prefer browser-native APIs (IndexedDB, File System Access API) over adding libraries."*

This forces a real choice: `idb-keyval` (600 bytes, zero abstraction, key-value only) vs `dexie` (feature-rich ORM, schema migrations, React hooks, ~27kB). The project stores flat project metadata objects keyed by ID — this is a key-value problem, not a relational query problem. **Recommendation: `idb-keyval` for metadata, raw `idb` for binary blobs, no Dexie.**

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `idb-keyval` | 6.2.2 | IndexedDB key-value store for project metadata, settings, UI state | 600-byte bundle. Zero-config. Pure Promise/async API. Perfect for flat `{ id, name, settings, outputs, fileManifest }` objects. No schema, no migrations, no boilerplate. Aligns with project's "prefer native APIs" constraint. |
| `idb` | 8.0.3 | IndexedDB with cursor access for binary file blobs | 1.19kB brotli'd. Needed when storing `File`/`Blob` objects with batch puts and keyed retrieval. Same author as `idb-keyval`, same idiom. Use only if source file blobs are stored browser-side (see "If source files are small" variant below). |
| IndexedDB (browser-native) | browser-native | Persistent browser storage for project state + file blobs | Up to 60-80% of free disk depending on browser. Stores `Blob` objects natively — no base64 encoding needed. Survives page refresh. Eviction-resistant via `navigator.storage.persist()`. |
| FastAPI + `aiofiles` | aiofiles 25.1.0 | Server-side async file write to `./projects/<name>/` | Server already runs at port 9378. `aiofiles` is the standard non-blocking file I/O companion for FastAPI — streams 50MB PDFs to disk without loading into memory. Source files stay server-side, outside the browser storage quota problem. |
| `navigator.storage.persist()` | browser-native | Prevent browser eviction of IndexedDB data | Single API call. Marks the origin as persistent — browser will not silently evict the project cache. Call on first project save. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jszip` | 3.10.1 (already installed) | Build portable project ZIP archives for export/import | Already in `package.json`. Use for export (bundle `project.json` + source files + outputs into a ZIP) and import (extract and validate structure). Do NOT add a second archive library. |
| `dexie` | 4.3.0 | IndexedDB ORM with schema migrations and `useLiveQuery()` React hook | Upgrade path only — if project complexity grows to require reactive live queries or compound indexes. Not needed for MVP. Adds ~27kB. |
| `dexie-react-hooks` | 4.2.0 (separate package) | `useLiveQuery()` hook for reactive project list rendering | Only needed if upgrading to Dexie. Install separately: `npm install dexie dexie-react-hooks`. NOT bundled with Dexie 4. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `fake-indexeddb` (dev) | Mock IndexedDB in Vitest tests | `import 'fake-indexeddb/auto'` in test setup replaces real IndexedDB. Works with both `idb-keyval` and `idb`. Add as dev dependency. |
| `navigator.storage.estimate()` | Debug storage quota headroom | Call before large writes in dev mode; warn if available < 200MB |

## Installation

```bash
# New JS dependencies (minimal — two tiny packages)
npm install idb-keyval idb

# Dev: IndexedDB test mock
npm install -D fake-indexeddb

# Python: async file I/O for new FastAPI project endpoints
pip install aiofiles==25.1.0
```

`jszip` is already installed at 3.10.1. No other JS dependencies are needed.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `idb-keyval` + `idb` | `dexie` 4.3.0 | When you need reactive live queries (`useLiveQuery()`), schema migrations across versions, or compound indexes. For this project's flat project metadata, it is over-engineered. Revisit if the data model gets complex. |
| `idb-keyval` + `idb` | `localForage` | If targeting legacy browsers that predate modern IndexedDB (IE11-era). Not relevant here — modern browser features already required by the app. |
| FastAPI endpoints for dir writes | File System Access API (`showDirectoryPicker`) | ONLY acceptable as an optional enhancement for users known to be on Chrome/Edge. Firefox has no implementation (Mozilla position: "harmful"). Safari: no support. 32% global coverage. Cannot be the primary save mechanism. |
| IndexedDB for outputs (markdown text) | OPFS (Origin Private File System) | OPFS gives better raw byte throughput for large binary files (SQLite in browser, etc.). For storing markdown text strings and small metadata objects, IndexedDB is simpler. OPFS is also browser-sandboxed — files are invisible to the Python CLI tools, which disqualifies it for source file storage. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `File System Access API` as primary path | Firefox: no implementation (flagged "harmful"). Safari: no support. Only 32.88% of browsers support it globally. Breaks silently on ~67% of the audience. | FastAPI `POST /projects` endpoints for directory writes |
| `localStorage` for project state | 5-10MB limit, synchronous (blocks UI thread), string-only. Cannot store `Blob` or `File` objects. | IndexedDB via `idb-keyval` / `idb` |
| Base64-encoding file blobs before storage | Inflates 50MB files to ~67MB. Hits quotas faster. CPU cost for encode/decode. Completely unnecessary — IndexedDB stores `Blob` natively. | Store raw `Blob` / `ArrayBuffer` directly in `idb` |
| `localForage` | Adds storage-agnostic abstraction over IndexedDB without adding the schema, migration, or reactive features that would justify the overhead. Effectively worse than `idb-keyval` for this use case. | `idb-keyval` |
| `rxdb` | Entire sync/replication infrastructure. Designed for multi-device, multi-user, offline-first apps. This is a single-user local tool. | Dexie (if ORM needed), or `idb-keyval` (sufficient) |
| Auto-save on every state change | Excessive IndexedDB writes; risk of partial-state corruption on rapid input. PROJECT.md already excludes this. | User-initiated saves only |
| OPFS for source file storage | Files stored in browser sandbox — invisible to OS and to `python convert.py`. The `./projects/<name>/sources/` directory must be user-accessible for the CLI tools to work. | FastAPI endpoints writing to `./projects/` |

## Stack Patterns by Variant

**If source files are small (< 5MB each, few files per project):**
- Store file blobs directly in IndexedDB using `idb` with a `project-files` object store
- Key: `${projectId}/${filename}`, Value: `File` object
- Schema: `projects` store (idb-keyval) + `files` store (idb)
- No server involvement needed for the load path — browser is self-contained
- Guard with `navigator.storage.estimate()` before each write

**If source files are large (PDF chapters 20-50MB, 10+ per project — the likely case here):**
- Store only metadata + file manifest + generated markdown outputs in IndexedDB
- Store source file blobs server-side in `./projects/<name>/sources/`
- On load: read metadata from IndexedDB, fetch blobs from FastAPI, reconstruct `File` objects
- This pattern sidesteps the storage quota problem entirely — markdown text is tiny vs PDF binaries
- This is the recommended default for this project

**If server is unavailable (offline or not running):**
- Fall back to IndexedDB-only mode for previously-cached projects
- Disable "save to directory" and "full-quality export" features
- Show "Server offline — changes saved to browser cache only"
- Mirrors existing graceful degradation pattern in `serverApi.js`

**For project export (portable ZIP):**
- Export = serialize `project.json` + markdown outputs + source files into ZIP using `jszip` (already installed)
- Trigger download via `URL.createObjectURL(blob)` + `<a download>` pattern
- No server needed for export — all data available in IndexedDB + memory
- Alternative server-side path: FastAPI `StreamingResponse` wrapping Python `zipfile.ZipFile` — no new Python deps

**For project import (from ZIP):**
- Read ZIP with existing `jszip` dependency (already used in `inputResolver.js` for ZIP import)
- Validate presence of `project.json` before accepting
- Extract files into IndexedDB and/or POST to FastAPI for directory restoration
- Reuse the existing ZIP-handling code path

## FastAPI Endpoint Pattern

The server already runs at port 9378. New project-management endpoints follow REST conventions:

```
POST   /projects                    Create project directory, write project.json
GET    /projects                    List all saved projects (scan project.json files)
GET    /projects/{slug}             Load project metadata + file manifest
PUT    /projects/{slug}             Update project metadata/settings
DELETE /projects/{slug}             Delete project directory (irreversible)
POST   /projects/{slug}/files       Upload source file → ./projects/{slug}/sources/
GET    /projects/{slug}/files/{f}   Download source file (for cache reload)
GET    /projects/{slug}/export      Stream ZIP of full project
POST   /projects/import             Accept ZIP upload, extract, register
```

All file writes use `aiofiles` for non-blocking I/O. Path traversal protection via `pathlib.Path.resolve()` + parent assertion is mandatory on every endpoint that accepts a user-supplied name or path.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `idb-keyval@6.2.2` | React 19, Vite 6, ES modules | ESM-native. Import: `import { get, set, del, keys } from 'idb-keyval'` |
| `idb@8.0.3` | React 19, Vite 6, ES modules | ESM-native. Full TypeScript generics, optional — project is JS |
| `jszip@3.10.1` (existing) | Blob, ArrayBuffer, Uint8Array | Already in package.json. No version change needed. |
| `aiofiles@25.1.0` | Python 3.10+, FastAPI (any recent) | Standard pairing. FastAPI official docs use aiofiles in upload examples. |
| `fake-indexeddb` (dev) | Vitest 4.x | `import 'fake-indexeddb/auto'` in test setup. Compatible with both `idb` and `idb-keyval`. |
| `dexie@4.3.0` (upgrade path) | React 19, Vite 6 | ESM-first. No known React 19 incompatibilities. `dexie-react-hooks@4.2.0` is a SEPARATE package — install both if upgrading to Dexie. |

## Storage Quota Reality Check

For this project's file profile (1-50MB PDFs/DOCX per project, 5-15 projects):

- **Worst case in IndexedDB**: 15 projects × 10 files × 50MB = 7.5GB raw
- **Chrome quota**: ~60% of free disk — well above this on modern laptops
- **Firefox quota**: ~10% of disk or 10GB, whichever is smaller — tight for worst case
- **Recommended mitigation**: Store source file blobs server-side only. IndexedDB holds metadata + markdown outputs (text = kilobytes, not megabytes). This eliminates the quota concern entirely.

Call `navigator.storage.persist()` on first project save. Call `navigator.storage.estimate()` before large blob writes and warn if headroom is < 200MB.

## Sources

- [idb-keyval npm — v6.2.2, last published ~10 months ago](https://www.npmjs.com/package/idb-keyval) — HIGH confidence
- [idb npm — v8.0.3, no known vulnerabilities](https://www.npmjs.com/package/idb) — HIGH confidence
- [Dexie.js GitHub Releases — v4.3.0 released Jan 2025](https://github.com/dexie/Dexie.js/releases) — HIGH confidence
- [dexie-react-hooks npm — v4.2.0, separate package](https://www.npmjs.com/package/dexie-react-hooks) — HIGH confidence
- [Can I Use: File System Access API — 32.88% global, Chrome/Edge only, no Firefox/Safari](https://caniuse.com/native-filesystem-api) — HIGH confidence
- [MDN: Origin Private File System — browser-sandboxed, Web Worker sync access](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) — HIGH confidence
- [MDN: File System API — Firefox "harmful" position, OPFS vs full API distinction](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) — HIGH confidence
- [MDN: Storage Quotas and Eviction Criteria — per-browser quota figures](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — HIGH confidence
- [RxDB: IndexedDB Max Storage Limits — browser quota synthesis](https://rxdb.info/articles/indexeddb-max-storage-limit.html) — MEDIUM confidence (third-party synthesis)
- [aiofiles PyPI — v25.1.0](https://pypi.org/project/aiofiles/) — HIGH confidence
- [FastAPI file upload streaming patterns](https://oneuptime.com/blog/post/2026-01-26-fastapi-file-uploads/view) — MEDIUM confidence (third-party blog, Jan 2026)
- [idb vs dexie vs idb-keyval npm trends comparison](https://npmtrends.com/dexie-vs-idb-vs-idb-keyval-vs-localforage-vs-pouchdb) — MEDIUM confidence (popularity data)

---
*Stack research for: Browser workspace persistence — doc-to-markdown project save/load*
*Researched: 2026-03-17*
