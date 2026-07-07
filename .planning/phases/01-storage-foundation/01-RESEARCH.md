# Phase 01: Storage Foundation - Research

**Researched:** 2026-03-17
**Domain:** Browser-side IndexedDB persistence — Dexie.js 4.x, project.json schema design, blob storage, schema migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema shape:**
- Persist these App.jsx state fields: `book` (title, author), `chapters` (array with file refs, inferred chapter numbers, titles, topics, key terms), `results` (converted markdown filename + content)
- DO NOT persist transient state: `converting`, `resolving`, `dragState`, `dragOver`, `preview`, `skippedFiles`, `importErrors` — these are runtime-only
- Add lightweight `uiState` object for restoring UI position (e.g., which sections are expanded)
- Project metadata: `id` (UUID), `name` (user-chosen), `createdAt`, `updatedAt`, `version` (schema version for future migrations)
- File references in chapters array point to blob IDs in the IndexedDB `files` store — never embed File objects in JSON

**Blob storage strategy:**
- Store ALL source files as IndexedDB blobs regardless of size — this phase does not require the server
- Each blob gets a unique ID; chapters reference blobs by ID
- Call `navigator.storage.persist()` on first save to prevent browser eviction
- Wrap IndexedDB writes in try/catch for `QuotaExceededError` — surface clear error if storage full
- Server-side file storage is Phase 3 scope, not Phase 1

**IndexedDB library choice:**
- Use Dexie.js 4.3.0 — justified exception to the "no new npm deps" preference
- Rationale: native blob storage, schema migrations via version bumps, `useLiveQuery()` React hook for Phase 2, 27kB gzipped
- Schema: two object stores — `projects` (metadata JSON) and `files` (binary blobs keyed by ID)
- Include `DB_VERSION = 1` and `onversionchange` handler from day one (pitfall research: missing this causes silent hangs with two tabs)

### Claude's Discretion
- Exact UUID generation approach (crypto.randomUUID() or fallback)
- Internal module file organization within `src/`
- Error message wording for quota exceeded
- Whether to use Dexie's `Table.bulkPut()` vs individual puts for file blobs

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STOR-01 | User can save current workspace to IndexedDB with a user-chosen name | `projectSerializer.js` maps App.jsx state to `project.json`; `projectDb.putProject()` writes to Dexie `projects` table |
| STOR-02 | User can load a saved project, restoring all files, settings, outputs, and UI state | `projectDb.getProject(id)` reads metadata; `projectDb.getFile(blobId)` reconstructs File objects; deserializer maps back to App.jsx state shape |
| STOR-03 | App automatically restores the last-opened project on page reload | Store last active project ID in a dedicated `settings` key (Dexie table or `localStorage`); read on `useEffect` mount |
| STOR-04 | Source files (DOCX/PDF/RTF/ODT/TXT) are stored as blobs so they can be re-converted later | Dexie `files` table stores `{ id, projectId, blob: File, name, size, type, lastModified }`; retrieved by ID and reconstructed as `new File([blob], name, { type, lastModified })` |
</phase_requirements>

---

## Summary

This phase builds two pure-JS modules: `projectSerializer.js` (schema definition + serialize/deserialize) and `projectDb.js` (Dexie.js CRUD + blob storage). No UI changes ship in Phase 1. The two modules form the stable API contract that Phase 2's `useProjectStore.js` hook will consume directly.

The critical design constraint is the serialization boundary: `File` objects in the `chapters` array from App.jsx's `useState` cannot pass through `JSON.stringify()` — they collapse to `{}` silently. The serializer must extract binary content to a separate blob store keyed by UUID, and only JSON-safe metadata travels in `project.json`. This separation is the entire point of having `projectSerializer.js` as a distinct module.

Dexie.js 4.3.0 is the locked library. It provides two object stores (`projects`, `files`), typed schema declarations, and a future `useLiveQuery()` hook surface for Phase 2. The schema must include `DB_VERSION = 1`, an `onversionchange` handler, and a `blocked` handler from the very first commit — retrofitting these is expensive and missing them causes silent two-tab hangs.

**Primary recommendation:** Build `projectSerializer.js` first (schema + pure functions, zero deps, fully testable in Vitest), then `projectDb.js` (Dexie adapter, depends on serializer types). This order unblocks plan 01-01 before 01-02 and matches the build order already established in ARCHITECTURE.md.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dexie` | 4.3.0 (verified) | IndexedDB ORM — schema declaration, versioned migrations, `Table.put()` / `Table.get()` / `Table.bulkPut()`, native Blob storage | Locked decision. Adds `useLiveQuery()` React hook for Phase 2, typed migrations for schema evolution, `onversionchange` + `blocked` handlers out of the box |
| `dexie-react-hooks` | 4.2.0 (verified) | `useLiveQuery()` React hook — reactive project list in Phase 2 | Separate package (NOT bundled with Dexie 4). Install now or in Phase 2; listed here because Phase 2 depends on it and the versions must be compatible |
| `crypto.randomUUID()` | browser-native | UUID generation for project IDs and blob IDs | Available in all modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+). No library needed. Fallback: `Math.random()` hex string for environments without it |
| `navigator.storage.persist()` | browser-native | Prevent browser eviction of IndexedDB data | Single call on first project save. Returns a Promise resolving to boolean — handle denial explicitly, do not assume granted |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` | 6.2.5 (verified) | Mock IndexedDB in Vitest | Dev dependency. `import 'fake-indexeddb/auto'` replaces the real IndexedDB in Node/Vitest test environment. Required for `projectDb.js` unit tests |
| `jszip` | 3.10.1 (already installed) | ZIP archive manipulation | Phase 4 scope — already in package.json, no install needed now |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dexie` (locked) | `idb-keyval` + `idb` | Smaller bundle (~1.8kB total). Better fit if data were purely flat key-value. Dexie wins here because of `useLiveQuery()` for Phase 2, typed schema migrations, and the project already locked this decision |
| `crypto.randomUUID()` | `uuid` npm package | `crypto.randomUUID()` is available natively in all target browsers (no IE11 needed). Adding `uuid` package is unnecessary |
| Dexie `Table.bulkPut()` | Loop of `Table.put()` | `bulkPut()` is a single transaction (faster, atomic). Use it when writing multiple file blobs during a save. Individual `put()` is fine for single-file updates |

**Installation:**
```bash
npm install dexie
npm install -D fake-indexeddb
```

`dexie-react-hooks` is needed for Phase 2. Install either now or at the start of Phase 2 — both 4.3.0/4.2.0 are verified compatible.

**Version verification (confirmed against npm registry 2026-03-17):**
- `dexie`: 4.3.0
- `dexie-react-hooks`: 4.2.0
- `fake-indexeddb`: 6.2.5

---

## Architecture Patterns

### Recommended Project Structure

This phase adds exactly two new files:

```
src/
├── projectSerializer.js   # NEW — schema contract + serialize()/deserialize()
├── projectDb.js           # NEW — Dexie adapter: open, CRUD, blob storage
├── App.jsx                # UNCHANGED in Phase 1
├── serverApi.js           # UNCHANGED in Phase 1
├── inputResolver.js       # UNCHANGED
├── convertRtf.js          # UNCHANGED
└── __tests__/
    ├── projectSerializer.test.js  # NEW
    ├── projectDb.test.js          # NEW
    ├── inputResolver.test.js      # EXISTING
    └── convertRtf.test.js        # EXISTING
```

### Pattern 1: Schema-First Serializer (projectSerializer.js)

**What:** A pure module that defines the canonical `project.json` shape and provides `serializeProject(state)` → `{ projectRecord, blobs[] }` and `deserializeProject(projectRecord, blobs)` → `state`. No I/O, no Dexie, no React — purely data transformation. All blob extraction happens here; `projectDb.js` treats the blobs array as opaque bytes.

**When to use:** Every save path (IndexedDB, future server) calls this serializer so the schema stays in one place. This is the "schema contract" described in CONTEXT.md.

**Example:**
```javascript
// src/projectSerializer.js
// Source: ARCHITECTURE.md pattern + App.jsx state shape (lines 1141-1148)

export const SCHEMA_VERSION = 1;

/**
 * Serialize App.jsx state into a storable project record + blob array.
 * IMPORTANT: File objects cannot pass through JSON.stringify. They are
 * extracted here and stored separately in the Dexie `files` table.
 *
 * @param {Object} params
 * @param {string} params.id - Project UUID
 * @param {string} params.name - User-chosen project name
 * @param {{ title: string, author: string }} params.book
 * @param {Array} params.chapters - App.jsx chapters array (contains File objects)
 * @param {Object} params.uiState - Serializable UI position state
 * @returns {{ projectRecord: Object, blobs: Array<{ id: string, file: File, name: string }> }}
 */
export function serializeProject({ id, name, book, chapters, uiState = {} }) {
  const now = new Date().toISOString();
  const blobs = [];

  const serializedChapters = chapters.map(chapter => {
    // Extract the File object — never let it reach JSON.stringify
    const blobId = chapter.blobId ?? crypto.randomUUID();
    if (chapter.file) {
      blobs.push({ id: blobId, file: chapter.file, name: chapter.fileName });
    }

    return {
      id: chapter.id,
      blobId,
      fileName: chapter.fileName,
      fileType: chapter.fileType,
      title: chapter.title,
      slug: chapter.slug,
      chapterNum: chapter.chapterNum,
      topics: chapter.topics ?? [],
      keyTerms: chapter.keyTerms ?? [],
      markdownContent: chapter.markdownContent ?? "",
      status: chapter.status ?? "pending",
    };
  });

  const projectRecord = {
    id,
    name,
    version: SCHEMA_VERSION,
    createdAt: now, // will be overwritten on update — caller sets this
    updatedAt: now,
    book: { title: book.title ?? "", author: book.author ?? "" },
    chapters: serializedChapters,
    uiState,
  };

  return { projectRecord, blobs };
}

/**
 * Deserialize a stored project record back to App.jsx state shape.
 * Reconstructs File objects from stored blobs.
 *
 * @param {Object} projectRecord - Record from Dexie `projects` table
 * @param {Map<string, File>} blobMap - Map of blobId → File from Dexie `files` table
 * @returns {{ book: Object, chapters: Array, uiState: Object }}
 */
export function deserializeProject(projectRecord, blobMap = new Map()) {
  const chapters = (projectRecord.chapters ?? []).map(chapter => ({
    ...chapter,
    file: blobMap.get(chapter.blobId) ?? null,
    // Restore keyTerms alias used in App.jsx
    keyTerms: chapter.keyTerms ?? [],
    topics: chapter.topics ?? [],
  }));

  return {
    book: projectRecord.book ?? { title: "", author: "" },
    chapters,
    uiState: projectRecord.uiState ?? {},
  };
}
```

### Pattern 2: Dexie Schema with Version Guard (projectDb.js)

**What:** A singleton Dexie database instance with two object stores, `onversionchange` and `blocked` handlers set on open, and exported CRUD functions. The database is opened lazily (on first call) to avoid connection errors in test environments.

**When to use:** All Phase 2+ database reads/writes go through this module. It is the only file in the codebase that imports Dexie.

**Example:**
```javascript
// src/projectDb.js
// Source: Dexie.js official docs (https://dexie.org/docs/Tutorial/Getting-started)

import Dexie from "dexie";

export const DB_VERSION = 1;
const DB_NAME = "doc-to-markdown";

let _db = null;

/**
 * Open (or return cached) Dexie database instance.
 * onversionchange: closes this tab's connection so other tabs can upgrade.
 * blocked: fires if this tab is blocking an upgrade from another tab.
 */
function getDb() {
  if (_db) return _db;

  const db = new Dexie(DB_NAME);

  db.version(DB_VERSION).stores({
    // projects: metadata JSON (no blobs — File objects live in `files`)
    // ++id = auto-increment NOT used; id is our UUID string
    projects: "id, name, updatedAt",

    // files: binary blobs keyed by blobId
    // projectId index allows bulk-delete when a project is removed
    files: "id, projectId",
  });

  db.on("versionchange", () => {
    db.close();
    // Notify user if needed: window.dispatchEvent(new Event("db-outdated"))
  });

  db.on("blocked", () => {
    console.warn("[projectDb] IndexedDB upgrade blocked — close other tabs to proceed.");
  });

  _db = db;
  return db;
}

// ─── Project CRUD ────────────────────────────────────────────────────────────

/** Save or replace a project record (metadata only — no blobs). */
export async function putProject(projectRecord) {
  try {
    await getDb().projects.put(projectRecord);
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      throw new Error("Storage full. Free up browser storage and try again.");
    }
    throw err;
  }
}

/** Get a single project record by UUID. Returns undefined if not found. */
export async function getProject(id) {
  return getDb().projects.get(id);
}

/** List all projects sorted by most recently updated. */
export async function listProjects() {
  return getDb().projects.orderBy("updatedAt").reverse().toArray();
}

/** Delete a project record AND all its associated file blobs. */
export async function deleteProject(id) {
  await getDb().transaction("rw", [getDb().projects, getDb().files], async () => {
    await getDb().projects.delete(id);
    await getDb().files.where("projectId").equals(id).delete();
  });
}

// ─── File Blob Storage ────────────────────────────────────────────────────────

/**
 * Store multiple file blobs in a single transaction.
 * Uses bulkPut for efficiency (one transaction, not N).
 *
 * @param {string} projectId
 * @param {Array<{ id: string, file: File, name: string }>} blobs
 */
export async function putFiles(projectId, blobs) {
  const records = blobs.map(({ id, file, name }) => ({
    id,
    projectId,
    blob: file,        // Dexie stores File/Blob natively via structured clone
    name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  }));

  try {
    await getDb().files.bulkPut(records);
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      throw new Error("Storage full. Free up browser storage and try again.");
    }
    throw err;
  }
}

/** Retrieve all file blobs for a project, keyed by blobId. */
export async function getFiles(projectId) {
  const records = await getDb().files.where("projectId").equals(projectId).toArray();
  const map = new Map();
  for (const rec of records) {
    // Reconstruct a proper File object from the stored blob
    const file = new File([rec.blob], rec.name, {
      type: rec.type,
      lastModified: rec.lastModified,
    });
    map.set(rec.id, file);
  }
  return map;
}

// ─── Storage Persistence ──────────────────────────────────────────────────────

/**
 * Request persistent storage on first project save.
 * Returns true if granted, false if denied/unavailable.
 * Never throws — browser may not support the API.
 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // No-op — not a blocking error
  }
  return false;
}

// ─── Last Active Project ──────────────────────────────────────────────────────

const LAST_PROJECT_KEY = "doc-to-markdown:lastProjectId";

export function saveLastProjectId(id) {
  try { localStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* private browsing */ }
}

export function getLastProjectId() {
  try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
}
```

### Pattern 3: Last-Opened Project Restoration

**What:** On app mount, read `localStorage` for the last active project ID, then load it from IndexedDB. `localStorage` is used (not IndexedDB) for this single pointer because it is synchronous and avoids an async cascade on app boot.

**When to use:** STOR-03 requirement — auto-restore last project on page reload.

**Trade-off:** `localStorage` has a 5–10 MB limit and is synchronous. For a single UUID string (36 bytes), these limits are irrelevant. If `localStorage` is unavailable (private browsing, quota exceeded), `getLastProjectId()` returns `null` and no project is auto-loaded — graceful degradation.

### Pattern 4: Complete Save Operation (both modules together)

```javascript
// How Phase 2's useProjectStore will call Phase 1's modules
import { serializeProject } from "./projectSerializer.js";
import { putProject, putFiles, saveLastProjectId, requestPersistentStorage } from "./projectDb.js";

async function saveProject(id, name, book, chapters, uiState) {
  const { projectRecord, blobs } = serializeProject({ id, name, book, chapters, uiState });

  // Store blobs first (larger writes) — if this fails, metadata is not written
  if (blobs.length > 0) {
    await putFiles(id, blobs);
  }
  await putProject(projectRecord);
  saveLastProjectId(id);

  // Request persistent storage on first save (non-blocking)
  requestPersistentStorage(); // intentionally not awaited — fire and forget
}
```

### Anti-Patterns to Avoid

- **Passing `File` objects through `JSON.stringify()`:** They silently serialize to `{}`. All File objects must be extracted in the serializer before any stringify call.
- **One IndexedDB transaction per file blob:** Ten files = ten transactions, each with overhead. Use `bulkPut()` to batch all file writes into one transaction.
- **Opening Dexie in the React render body:** Creates multiple connections. Open once in `getDb()` singleton, reuse throughout.
- **Hardcoding `DB_VERSION` without a migration handler:** The `onversionchange` handler costs two lines and prevents silent hangs when a second tab opens after a schema update.
- **Using `localStorage` for binary blobs:** 5 MB limit, synchronous, string-only. Only use `localStorage` for the single-pointer last-project-ID key.
- **Storing base64-encoded blobs:** Inflates 50 MB files to ~67 MB, unnecessary CPU cost for encode/decode, and no advantage over native Blob storage in IndexedDB.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB schema migrations | Custom version check + manual object store creation | Dexie `db.version(N).stores({...})` | Dexie handles `onupgradeneeded` correctly, including index renames, deletions, and multi-version upgrades. Raw IDBOpenRequest upgrade logic has subtle edge cases (e.g., recreating stores vs. upgrading them) |
| IndexedDB transaction batching | `for (const blob of blobs) { await db.put(blob) }` | `db.files.bulkPut(records)` | `bulkPut` wraps all writes in one readwrite transaction. A loop creates N sequential transactions with full overhead per transaction |
| File/Blob native storage encoding | `btoa(arrayBuffer)` / `atob()` + serialize to string | Store raw `File`/`Blob` via Dexie's structured clone | IndexedDB stores Blob natively. Base64 inflation is 33%, with no retrieval benefit |
| UUID generation | Custom `Math.random()` hex concatenation | `crypto.randomUUID()` | `crypto.randomUUID()` is CSPRNG-backed, RFC 4122 compliant, available in all target browsers |
| Storage quota check | Poll `navigator.storage.estimate()` in a loop | Call once before large writes; catch `QuotaExceededError` in `put`/`bulkPut` | `QuotaExceededError` is the authoritative signal. `estimate()` is useful for warning UX but not a replacement for try/catch on writes |

**Key insight:** Dexie.js earns its 27 kB by handling exactly the four hardest parts of raw IndexedDB: schema versioning, transaction management, native Blob storage, and the React hook surface (`useLiveQuery`) Phase 2 needs.

---

## Common Pitfalls

### Pitfall 1: File Objects Silently Lost in JSON Serialization

**What goes wrong:** `JSON.stringify(chapters)` produces `[{"id":"...","file":{}}]` — the File objects collapse to empty objects. On reload, files appear in the list but have zero content.

**Why it happens:** `JSON.stringify()` cannot handle `File` objects (they are non-serializable). This is distinct from IndexedDB's structured clone (which CAN store Files) — but any code path that passes through `JSON.stringify` loses them silently.

**How to avoid:** The `serializeProject()` function is the single extraction point. It maps every `chapter.file` to a `blobId` string in the JSON record, and returns the `File` objects separately as a `blobs[]` array. `projectDb.putFiles()` stores the blobs via Dexie's structured clone (native — no stringify).

**Warning signs:** `JSON.stringify(state)` produces `"file":{}` in any chapter entry; loaded project shows file names but zero-byte content; `DataCloneError` appears during structured clone of state.

### Pitfall 2: Missing `onversionchange` Handler — Silent Two-Tab Hang

**What goes wrong:** User has the app open in two tabs. A code update bumps `DB_VERSION`. The new tab fires an `onblocked` event and hangs indefinitely — the old tab holds a connection at the lower version and never closes it.

**Why it happens:** IndexedDB upgrades require all existing connections to close before `onupgradeneeded` can fire. If the old tab's `onversionchange` callback doesn't call `db.close()`, the upgrade never runs.

**How to avoid:** Register both handlers in `getDb()` before the database is opened. Both handlers must be registered in the same call that creates the `Dexie` instance.

**Warning signs:** App hangs on page load in a second tab after deploying a schema change; Chrome DevTools shows a pending `versionchange` event; no `onversionchange` handler in `projectDb.js`.

### Pitfall 3: `QuotaExceededError` Not Handled

**What goes wrong:** A user with a full disk (or a Firefox origin that has hit its 10 GB quota) triggers a save. The Dexie `put()` rejects with `QuotaExceededError`. Without a try/catch, this surfaces as an unhandled promise rejection — the user sees a blank error or nothing.

**Why it happens:** IndexedDB writes throw `QuotaExceededError` synchronously inside the transaction when storage is full. Dexie propagates this as a rejected Promise.

**How to avoid:** Wrap `putFiles()` and `putProject()` calls in try/catch blocks that specifically detect `err.name === "QuotaExceededError"` and rethrow a user-friendly message. The `projectDb.js` functions do this internally; callers still receive a thrown Error (now with a human-readable message).

**Warning signs:** Unhandled promise rejection logs in console; save silently fails with no user feedback; app tested only with abundant free disk.

### Pitfall 4: Dexie Opened Multiple Times (Connection Leak)

**What goes wrong:** Calling `new Dexie(DB_NAME)` inside a React hook or component body creates a new connection on every render. This hits "connection already open" errors or leaks connection handles, and Dexie emits warnings about multiple open instances.

**Why it happens:** Dexie instances should be singletons per database name. Creating one per render destroys the connection pooling Dexie manages internally.

**How to avoid:** The `getDb()` singleton pattern in `projectDb.js` (see example above) ensures one Dexie instance per app lifetime. React components call `projectDb.*` functions, never `new Dexie()` directly.

**Warning signs:** `Multiple Dexie instances for the same database` warnings in console; `InvalidStateError` on concurrent reads; Dexie instance created inside `useEffect` or component render.

### Pitfall 5: `navigator.storage.persist()` Return Value Ignored

**What goes wrong:** `persist()` is called but its Promise resolves to `false` (denied). The code treats denial as success and does not communicate anything to the user. On Safari or low-engagement origins, data can be silently evicted after 7 days.

**Why it happens:** Chrome auto-grants or auto-denies based on engagement heuristics (no user prompt). Firefox prompts the user. Safari only grants for installed PWAs. The return value is the only signal.

**How to avoid:** Store the result in a project record field (`persistenceGranted: boolean`). Phase 2's save UI can show a subtle "Browser storage not protected" warning if `false`. Do not block the save flow on denial — just record and surface it.

---

## Code Examples

Verified patterns from official sources and existing project conventions:

### Dexie Schema Declaration (official pattern)
```javascript
// Source: https://dexie.org/docs/Tutorial/Getting-started
const db = new Dexie("doc-to-markdown");
db.version(1).stores({
  projects: "id, name, updatedAt",  // id = primary key (our UUID string)
  files: "id, projectId",           // projectId = index for bulk delete
});
```

### Dexie bulkPut (official pattern)
```javascript
// Source: https://dexie.org/docs/Table/Table.bulkPut()
// One transaction for N blobs — not N transactions
await db.files.bulkPut([
  { id: "blob-1", projectId: "proj-abc", blob: file1, name: "ch01.docx", ... },
  { id: "blob-2", projectId: "proj-abc", blob: file2, name: "ch02.pdf", ... },
]);
```

### Dexie Transaction (for atomic save)
```javascript
// Source: https://dexie.org/docs/Dexie/Dexie.transaction()
await db.transaction("rw", [db.projects, db.files], async () => {
  await db.projects.put(projectRecord);
  await db.files.bulkPut(blobRecords);
});
```

### Reconstruct File from Stored Blob
```javascript
// Dexie stores File natively via structured clone; retrieve and reconstruct
const record = await db.files.get(blobId);
const restoredFile = new File([record.blob], record.name, {
  type: record.type,
  lastModified: record.lastModified,
});
```

### navigator.storage.persist() Pattern
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
const granted = await navigator.storage?.persist?.() ?? false;
// granted === true  → browser will not evict this origin's data
// granted === false → eviction still possible (surface UI warning in Phase 2)
```

### App.jsx Chapter Shape (lines 1141–1190 — what the serializer maps FROM)
```javascript
// Existing chapter object shape in App.jsx useState
{
  id: crypto.randomUUID(),       // ← stable ID already exists
  file: item.file,               // ← File object — MUST be extracted
  fileName: item.file.name,      // ← safe to serialize
  fileType: "docx" | "pdf" | "rtf" | "odt" | "txt",
  title: item.title,
  slug: slugify(item.title),
  chapterNum: num,
  topics: [],
  keyTerms: [],
  markdownContent: "",
  status: "pending",
}
```

### Vitest Test Pattern with fake-indexeddb
```javascript
// Source: https://github.com/dumbmatter/fakeIndexedDB
// In test setup or at top of projectDb.test.js:
import "fake-indexeddb/auto";
// After this import, window.indexedDB is replaced with the fake
// Dexie works transparently — no code changes needed
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `localForage` (IndexedDB + localStorage abstraction) | `idb-keyval` / `idb` / Dexie directly | ~2022 — native IDB APIs stabilized across browsers | localForage adds overhead without benefit on modern browsers; direct IDB libs are smaller and more capable |
| Manual `IDBOpenRequest` + `onupgradeneeded` | Dexie `db.version(N).stores({...})` | Ongoing — Dexie has been the standard since ~2018 | Raw IDB API is verbose; Dexie migrations are 1/10th the code with fewer upgrade edge cases |
| Base64-encoding blobs for IndexedDB storage | Native Blob/ArrayBuffer storage (structured clone) | ~2018 — structured clone became universal | Base64 inflated storage by 33%; native storage is faster and smaller |
| `dexie-react-hooks` bundled with Dexie | `dexie-react-hooks` as a separate package (Dexie 4+) | Dexie 4.0 (2024) | Must install `dexie-react-hooks@4.2.0` separately for `useLiveQuery()` — NOT included in the main Dexie 4 bundle |

**Deprecated/outdated:**
- `localForage`: Still maintained but no advantage over direct IDB libraries for modern browsers
- `idb` v7 and below: v8 brought cleaner Promise API; `idb@8.0.3` is current
- Dexie 3.x: Version 4 brings improved TypeScript generics and the separated React hooks package; do not use v3 patterns

---

## Open Questions

1. **`blobId` vs reusing `chapter.id` as the blob key**
   - What we know: CONTEXT.md says "each blob gets a unique ID" and chapters reference "blob IDs in the files store"
   - What's unclear: Whether `blobId` should equal `chapter.id` (simpler) or be a separate UUID (allows future many-to-one relationships — e.g., same source file in multiple chapters)
   - Recommendation: Use a separate `blobId` field on each chapter record, generated at serialization time if not already present. This costs one UUID and prevents coupling between chapter identity and file identity.

2. **`dexie-react-hooks` install timing**
   - What we know: Phase 2's `useProjectStore.js` uses `useLiveQuery()`; Phase 1 does not
   - What's unclear: Whether to install it now (in Phase 1 plan) or in Phase 2 plan
   - Recommendation: Include `dexie-react-hooks` installation as a task in plan 01-02 (alongside Dexie itself) to keep both installs in one npm operation and prevent a "missing package" surprise at the start of Phase 2.

3. **`createdAt` field management during updates**
   - What we know: `projectRecord.updatedAt` changes on every save; `createdAt` must stay fixed after first creation
   - What's unclear: The `serializeProject()` function shown above sets `createdAt: now` on every call, which would reset it on updates
   - Recommendation: `serializeProject()` should accept an optional `createdAt` parameter. If provided (from a loaded project), it is preserved. If absent (new project), `now` is used. The serializer signature becomes `serializeProject({ id, name, book, chapters, uiState, createdAt? })`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.js` (Vitest reads this; no separate `vitest.config.js` exists) |
| Quick run command | `npx vitest run src/__tests__/projectSerializer.test.js src/__tests__/projectDb.test.js` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOR-01 | `serializeProject()` extracts File objects to blobs array; JSON record is serializable | unit | `npx vitest run src/__tests__/projectSerializer.test.js` | ❌ Wave 0 |
| STOR-01 | `putProject()` writes and `getProject()` retrieves a project record | unit | `npx vitest run src/__tests__/projectDb.test.js` | ❌ Wave 0 |
| STOR-02 | `deserializeProject()` reconstructs `book`, `chapters`, `uiState` correctly from stored record | unit | `npx vitest run src/__tests__/projectSerializer.test.js` | ❌ Wave 0 |
| STOR-02 | `getFiles()` returns a Map of blobId → File with correct name/type/size | unit | `npx vitest run src/__tests__/projectDb.test.js` | ❌ Wave 0 |
| STOR-03 | `saveLastProjectId()` persists ID; `getLastProjectId()` returns it | unit | `npx vitest run src/__tests__/projectDb.test.js` | ❌ Wave 0 |
| STOR-04 | `putFiles()` stores a Blob with `bulkPut`; `getFiles()` returns reconstructed File objects | unit | `npx vitest run src/__tests__/projectDb.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/__tests__/projectSerializer.test.js src/__tests__/projectDb.test.js`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/projectSerializer.test.js` — covers STOR-01, STOR-02 (serialization round-trip)
- [ ] `src/__tests__/projectDb.test.js` — covers STOR-01, STOR-02, STOR-03, STOR-04 (requires `fake-indexeddb` dev dep)
- [ ] `fake-indexeddb` dev dependency: `npm install -D fake-indexeddb` — required for projectDb.test.js to run in Vitest/Node

---

## Sources

### Primary (HIGH confidence)

- Dexie.js official docs — https://dexie.org/docs/Tutorial/Getting-started (schema, versioning, migrations)
- Dexie.js Table.bulkPut() — https://dexie.org/docs/Table/Table.bulkPut() (batch write API)
- Dexie.js Transaction API — https://dexie.org/docs/Dexie/Dexie.transaction() (atomic multi-table writes)
- MDN StorageManager.persist() — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist (eviction prevention)
- MDN Storage Quotas — https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria (quota limits per browser)
- npm registry — `dexie@4.3.0`, `dexie-react-hooks@4.2.0`, `fake-indexeddb@6.2.5` (verified 2026-03-17)
- `.planning/research/STACK.md` — library comparison, quota analysis (researched 2026-03-17, HIGH confidence)
- `.planning/research/ARCHITECTURE.md` — component boundaries, data flow patterns (researched 2026-03-17, HIGH confidence)
- `.planning/research/PITFALLS.md` — serialization gotcha, schema migration, main-thread blocking (researched 2026-03-17, HIGH confidence)
- `src/App.jsx` lines 1141–1190 — exact App.jsx chapter state shape (source of truth for schema)

### Secondary (MEDIUM confidence)

- Dexie.js GitHub Releases — https://github.com/dexie/Dexie.js/releases (v4.3.0 released Jan 2025; v4.2.0 for react-hooks)
- fake-indexeddb README — https://github.com/dumbmatter/fakeIndexedDB (Vitest/Node compatibility confirmed)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — Dexie 4.3.0 is the locked decision; versions verified against npm registry 2026-03-17
- Architecture: HIGH — patterns derived from ARCHITECTURE.md (itself HIGH confidence) + App.jsx source truth
- Pitfalls: HIGH — File serialization pitfall is verified against MDN; schema versioning pitfall is Dexie docs; QuotaExceededError is IndexedDB spec behavior
- Validation: HIGH — Vitest 4.1.0 confirmed in package.json; fake-indexeddb version confirmed from npm registry

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable — Dexie 4.x API is stable; fake-indexeddb is a dev tool with infrequent breaking changes)
