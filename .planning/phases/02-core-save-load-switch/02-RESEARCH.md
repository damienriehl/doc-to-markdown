# Phase 02: Core Save / Load / Switch - Research

**Researched:** 2026-03-17
**Domain:** React custom hooks, state lift, IndexedDB integration, save-state UX
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STOR-01 | User can save current workspace to IndexedDB with a user-chosen name | `useProjectStore.save(name)` calls `serializeProject` + `putProject` + `putFiles` |
| STOR-02 | User can load a saved project, restoring all files, settings, outputs, and UI state | `useProjectStore.load(id)` calls `getProject` + `getFiles` + `deserializeProject`, then replaces `book`/`chapters` state |
| STOR-03 | App automatically restores last-opened project on page reload | Boot effect in `useProjectStore` calls `getLastProjectId` then `load()` if non-null |
| STOR-04 | Source files stored as blobs so they can be re-converted later | Already handled by `putFiles`/`getFiles` from Phase 1; `useProjectStore` must pass blobs through correctly |
| STAT-01 | Visual indicator showing whether current state is saved or unsaved | `isDirty` flag in `useProjectStore`; header badge renders "Saved" / "Unsaved" / "Saving..." |
| STAT-02 | User warned before navigating away or switching projects with unsaved changes | `isDirty` guard in switch handler + `beforeunload` listener; confirmation modal in ProjectList |
| PROJ-01 | User can see a list of all saved projects sorted by last modified date | `listProjects()` from Phase 1 returns records sorted by `updatedAt` descending; ProjectList renders them |
| PROJ-04 | Project list shows name, last-modified date, and file count for each project | `projectRecord.chapters.length` provides file count; `updatedAt` provides date; both already in schema |
</phase_requirements>

---

## Summary

Phase 2 wires the Phase 1 storage primitives (`projectSerializer.js`, `projectDb.js`) into the React UI. The work breaks into three self-contained layers: a `useProjectStore` custom hook that owns all persistence logic, a state lift that moves `book`/`chapters` from `App.jsx` local state into the hook, and a `ProjectList.jsx` component that displays saved projects and mediates switching.

The core technical challenge is boot hydration sequencing: on mount the hook must read `getLastProjectId()`, fetch from IDB, and hydrate state before the empty-workspace UI flashes. A `bootStatus` state variable (`"idle" | "loading" | "ready"`) gates rendering and prevents the race condition where App renders before the last project is restored.

The secondary challenge is `isDirty` tracking. Because App.jsx state is lifted into the hook, the hook can compare current `book`/`chapters` values against the last-saved snapshot using a `savedSnapshotRef`. A shallow JSON comparison on the serialized form is the correct approach — comparing File objects by reference is unreliable after deserialization.

**Primary recommendation:** Implement `useProjectStore` as a single custom hook that returns `{ book, setBook, chapters, setChapters, save, load, projectList, activeProjectId, isDirty, bootStatus }`. App.jsx and ProjectList.jsx are consumers only — no persistence logic leaks out of the hook.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | Custom hooks (`useReducer`/`useState`/`useRef`/`useEffect`) | Already installed; hooks are the idiomatic React state pattern |
| Dexie | 4.3.0 | IndexedDB reads/writes via `projectDb.js` | Already installed; Phase 1 established this as the sole IDB interface |
| projectDb.js | Phase 1 output | All 9 IDB exports consumed by the hook | Tested, contracted API — zero new code needed in the DB layer |
| projectSerializer.js | Phase 1 output | `serializeProject` / `deserializeProject` | Tested, handles the File-object boundary cleanly |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fake-indexeddb | 6.2.5 | Test isolation for `useProjectStore` tests | Any test that calls IDB functions |
| vitest | 4.1.0 | Test runner | All unit tests for the hook |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom hook | Zustand or Jotai | External state managers add a dependency and abstraction layer; the hook pattern is simpler and already tested in this codebase |
| Custom hook | React Context + useReducer | Context causes full subtree re-renders on every state change; a single hook with fine-grained setters avoids that overhead |
| JSON snapshot for isDirty | Deep equality library (lodash.isEqual) | No new dependency needed; JSON.stringify on the serialized form is deterministic and sufficient for this data shape |

**Installation:** No new dependencies required for Phase 2. All needed packages are already in `package.json`.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── useProjectStore.js      # NEW — custom hook, all persistence logic
├── ProjectList.jsx         # NEW — project list component + switcher
├── App.jsx                 # MODIFIED — lift state into useProjectStore
├── projectDb.js            # Phase 1 — unchanged
├── projectSerializer.js    # Phase 1 — unchanged
└── __tests__/
    └── useProjectStore.test.js  # NEW — hook unit tests
```

### Pattern 1: Custom Hook as Single Persistence Owner

**What:** `useProjectStore` is the only file that imports from `projectDb.js` and `projectSerializer.js`. App.jsx receives `book`, `setBook`, `chapters`, `setChapters` from the hook just as if they were local state — no change to how components use them.

**When to use:** When persistence logic must be encapsulated away from render logic and testable independently.

**Shape:**
```javascript
// src/useProjectStore.js
export function useProjectStore() {
  const [book, setBook] = useState({ title: "", author: "" });
  const [chapters, setChapters] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projectList, setProjectList] = useState([]);
  const [bootStatus, setBootStatus] = useState("idle"); // "idle" | "loading" | "ready"
  const [saveStatus, setSaveStatus] = useState("saved"); // "saved" | "unsaved" | "saving"
  const savedSnapshotRef = useRef(null);

  // Boot hydration — runs once on mount
  useEffect(() => {
    async function boot() {
      setBootStatus("loading");
      const lastId = getLastProjectId();
      const list = await listProjects();
      setProjectList(list);
      if (lastId) {
        const record = await getProject(lastId);
        if (record) {
          const blobMap = await getFiles(lastId);
          const { book, chapters } = deserializeProject(record, blobMap);
          setBook(book);
          setChapters(chapters);
          setActiveProjectId(lastId);
          savedSnapshotRef.current = buildSnapshot(book, chapters);
        }
      }
      setBootStatus("ready");
    }
    boot();
  }, []);

  // isDirty derived from savedSnapshotRef vs. current state
  const isDirty = useMemo(() => {
    if (!savedSnapshotRef.current) return chapters.length > 0 || book.title !== "";
    return buildSnapshot(book, chapters) !== savedSnapshotRef.current;
  }, [book, chapters]);

  // ...save, load, switch handlers
  return { book, setBook, chapters, setChapters, activeProjectId, projectList,
           isDirty, saveStatus, bootStatus, save, load, switchProject };
}
```

### Pattern 2: Boot Hydration with Load-Sequence Token

**What:** A `loadToken` ref (incremented on every load call) lets async operations detect if a newer load started before they finish. This prevents stale async results from overwriting a freshly switched project.

**When to use:** Any time `load()` can be called again before a previous load resolves (e.g., rapid project switching).

**Example:**
```javascript
const loadTokenRef = useRef(0);

async function load(id) {
  const token = ++loadTokenRef.current;
  setSaveStatus("saving"); // show "Loading..."
  const record = await getProject(id);
  const blobMap = await getFiles(id);
  if (token !== loadTokenRef.current) return; // stale — a newer load is in flight
  const { book, chapters } = deserializeProject(record, blobMap);
  setBook(book);
  setChapters(chapters);
  setActiveProjectId(id);
  saveLastProjectId(id);
  savedSnapshotRef.current = buildSnapshot(book, chapters);
  setSaveStatus("saved");
}
```

### Pattern 3: isDirty Snapshot via JSON-Serialized Form

**What:** Rather than comparing File objects (which lose identity after deserialization), compare the serialized chapter shapes — everything `projectSerializer.serializeProject` would produce for the non-blob fields.

**When to use:** Any isDirty check in this codebase.

**Example:**
```javascript
function buildSnapshot(book, chapters) {
  // Serialize only the stable fields — omit File objects
  return JSON.stringify({
    book,
    chapters: chapters.map(({ file, _dragging, ...rest }) => rest),
  });
}
```

### Pattern 4: beforeunload Guard

**What:** A `useEffect` that registers a `beforeunload` listener when `isDirty` is true. This warns the user before they close the tab with unsaved changes.

**When to use:** Any app with unsaved-state tracking.

**Example:**
```javascript
useEffect(() => {
  if (!isDirty) return;
  const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}, [isDirty]);
```

### Pattern 5: ProjectList as Controlled Component

**What:** `ProjectList.jsx` receives `projectList`, `activeProjectId`, `isDirty`, and `onSwitch` / `onSave` callbacks as props. It owns its own modal state (`showConfirm`, `pendingSwitchId`) but calls parent callbacks for data mutations. No IDB imports.

**When to use:** Separating display state (which modal is open) from domain state (which project is active).

### Anti-Patterns to Avoid

- **Importing projectDb.js from App.jsx or ProjectList.jsx:** Only `useProjectStore.js` should touch storage. Cross-cutting persistence breaks the encapsulation.
- **Comparing File objects for isDirty:** `file === file` is false after deserialization because `new File([blob], name)` always creates a new reference. Use the JSON snapshot pattern instead.
- **Setting state in a stale async callback:** Without the load-sequence token, rapidly clicking between projects can write the wrong project's data. Always check the token before committing state.
- **Blocking render on boot:** Never await IDB before returning JSX. Set `bootStatus = "loading"` immediately and render a skeleton or nothing while waiting.
- **Auto-saving on every state change:** Explicitly out of scope per REQUIREMENTS.md. File blobs are 1–50 MB; constant writes cause quota pressure.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB CRUD | Custom IDB wrapper | `projectDb.js` (Phase 1) | Already tested, handles QuotaExceededError, cascade delete, bulkPut |
| File serialization | Custom File→blob logic | `serializeProject` / `deserializeProject` | Already handles blobId stability, null safety, schema version |
| Project list sort | Manual sort | `listProjects()` (returns sorted by `updatedAt` desc) | Already implemented in IDB query |
| Last-project tracking | Custom localStorage key | `saveLastProjectId` / `getLastProjectId` | Uses namespaced key `doc-to-markdown:lastProjectId`, handles private browsing |
| Persistent storage request | Inline `navigator.storage.persist()` call | `requestPersistentStorage()` | Handles API absence gracefully, never throws |

**Key insight:** Phase 1 delivered a complete, tested storage API. Phase 2 is purely integration work — the hook calls the Phase 1 API; it does not reimplement any storage logic.

---

## Common Pitfalls

### Pitfall 1: isDirty fires true immediately after load

**What goes wrong:** After loading a project, `isDirty` reports `true` because the saved snapshot was set before React batched all the `setBook`/`setChapters` state updates and the `useMemo` recomputed.

**Why it happens:** `savedSnapshotRef.current` is set synchronously in the `load()` function, but the `useMemo` for `isDirty` recomputes on the next render after state settles. If the snapshot is set before `setBook`/`setChapters` are called (wrong order), the first render after load compares new state against an already-updated snapshot — which should be fine. If the snapshot is set AFTER state calls, there's a brief render window where `isDirty` could flip true.

**How to avoid:** Set `savedSnapshotRef.current = buildSnapshot(book, chapters)` using the values returned from `deserializeProject`, not from the React state (which hasn't updated yet). The ref is synchronous; state updates are async.

**Warning signs:** Save badge flickers to "Unsaved" immediately after loading a project, then back to "Saved".

### Pitfall 2: bootStatus never reaches "ready" on empty first run

**What goes wrong:** The boot effect checks `getLastProjectId()` — if it returns null (first ever load), the effect must still set `bootStatus = "ready"` after loading the project list. A missing `finally` or early return skips this.

**How to avoid:** Wrap the entire boot async function in try/finally and always call `setBootStatus("ready")` in the finally block.

**Warning signs:** App shows a blank loading state permanently on first run.

### Pitfall 3: File objects in chapters survive a project switch (stale files)

**What goes wrong:** When switching projects, the old chapters array (with File references) is not garbage collected if any closure or ref still holds it. If the new chapters come back with null files (blob not found), the UI shows broken conversion states.

**Why it happens:** `deserializeProject` returns `null` for missing blob entries — this is correct behavior (blob may have been stored only on disk). The UI must handle `chapter.file === null` gracefully — it should not attempt to re-convert or show an error.

**How to avoid:** The `runConversion` logic in App.jsx already checks `ch.status === "pending"` before attempting conversion. Loaded chapters arrive with status `"done"` or `"done-basic"` — they will not be re-converted automatically.

**Warning signs:** After switching projects, previously-converted chapters suddenly show "converting" status again.

### Pitfall 4: `_dragging` field leaks into saved snapshot

**What goes wrong:** The `_dragging: true` field is a transient UI flag set during drag operations. If it's included in the `buildSnapshot` comparison, dragging a chapter always marks the project dirty even after dragging ends.

**How to avoid:** The `buildSnapshot` function must explicitly exclude `_dragging` (and any other `_`-prefixed transient fields) from the chapter shape before serializing.

**Warning signs:** isDirty becomes true whenever the user drags a chapter row.

### Pitfall 5: ProjectList mounts before boot completes

**What goes wrong:** If `ProjectList` renders before `bootStatus === "ready"`, it shows an empty project list even though projects exist. The user might create a duplicate project believing none are saved.

**How to avoid:** `App.jsx` must gate the ProjectList render on `bootStatus === "ready"`, or pass `projectList` down only after boot. Alternatively, show a loading skeleton in ProjectList when `bootStatus !== "ready"`.

---

## Code Examples

Verified patterns from project codebase:

### Calling the Phase 1 Storage API (from projectDb.js)

```javascript
// Save a project
import { putProject, putFiles, saveLastProjectId, listProjects } from "./projectDb.js";
import { serializeProject } from "./projectSerializer.js";

async function save(id, name, book, chapters) {
  const { projectRecord, blobs } = serializeProject({ id, name, book, chapters, uiState: {} });
  await putProject(projectRecord);
  if (blobs.length > 0) await putFiles(id, blobs);
  saveLastProjectId(id);
  return projectRecord;
}
```

### Loading a Project (from projectDb.js + projectSerializer.js)

```javascript
import { getProject, getFiles } from "./projectDb.js";
import { deserializeProject } from "./projectSerializer.js";

async function load(id) {
  const record = await getProject(id);
  if (!record) return null;
  const blobMap = await getFiles(id);
  return deserializeProject(record, blobMap);
}
```

### File Count from projectRecord

```javascript
// PROJ-04: file count is already in the stored record
const fileCount = projectRecord.chapters.length;
// No extra IDB query needed — chapters array is in project metadata
```

### Project Card Data (for PROJ-01 and PROJ-04)

```javascript
// listProjects() returns full projectRecord objects, sorted by updatedAt desc
const projects = await listProjects();
projects.map(p => ({
  id: p.id,
  name: p.name,
  updatedAt: p.updatedAt,          // ISO string — format with toLocaleDateString()
  fileCount: p.chapters.length,    // PROJ-04: file count
}));
```

---

## App.jsx State Inventory (for 02-02 state lift)

The following state variables live in `RAGConverter()` and must be considered for the lift:

| Variable | Lift to useProjectStore? | Reason |
|----------|--------------------------|--------|
| `book` | YES | Core project state — must persist |
| `chapters` | YES | Core project state — must persist |
| `converting` | NO | Transient UI — in-flight conversion flag |
| `preview` | NO | Transient UI — modal open state |
| `dragState` | NO | Transient UI — drag-and-drop tracking |
| `resolving` | NO | Transient UI — ZIP/folder extraction in progress |
| `skippedFiles` | NO | Transient UI — dismissible notice state |
| `importErrors` | NO | Transient UI — dismissible notice state |

The refs (`chaptersRef`, `bookRef`, `convertingRef`, `conversionTimeoutRef`) are implementation details that follow their corresponding state. `chaptersRef`/`bookRef` should reference the hook's values after lift.

**Lift strategy:** Replace `const [book, setBook] = useState(...)` and `const [chapters, setChapters] = useState([])` with destructuring from `useProjectStore()`. All other state stays local in App.jsx.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| useReducer for complex state | Custom hook with multiple useState | React 18+ | Fine-grained updates, no action boilerplate |
| Context for cross-component state | Hook passed as props | React 19 | Simpler for 2-component tree (App + ProjectList) |
| Synchronous IDB in useEffect | Async/await in effect | Dexie 4+ | Cleaner boot sequence, no callback nesting |

**Deprecated/outdated:**

- IndexedDB via `window.indexedDB` directly: Phase 1 already established Dexie as the sole IDB interface. No raw IDB code in Phase 2.
- `localStorage` for full project state: Explicitly rejected in pre-phase decisions (File objects, size limits). `localStorage` is used only for the `lastProjectId` pointer.

---

## Open Questions

1. **Should `uiState` capture anything from App.jsx in Phase 2?**
   - What we know: `projectRecord.uiState` exists in the schema (Phase 1) and `serializeProject` accepts it. App.jsx currently has no UI state worth persisting (no expanded panel, no tab selection).
   - What's unclear: Whether future phases will add tab state or scroll position worth saving.
   - Recommendation: Pass `uiState: {}` for now. The schema supports it whenever needed.

2. **Should the save operation be triggered by a button or implicitly?**
   - What we know: REQUIREMENTS.md explicitly rules out auto-save ("User-initiated saves only"). Phase 2 plans describe a "Save" button flow.
   - What's unclear: Whether the project name is entered inline in the header or in a modal.
   - Recommendation: Simplest first — inline text input in header for project name, "Save" button adjacent to it.

3. **Does `crypto.randomUUID()` work in all target environments?**
   - What we know: It's used in `projectSerializer.js` already (Phase 1 is passing all tests). It requires a secure context (HTTPS or localhost).
   - What's unclear: Whether the app is ever served over plain HTTP in production.
   - Recommendation: The existing usage in `projectSerializer.js` validates the assumption. No change needed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.js` (Vitest is configured via Vite) |
| Quick run command | `npx vitest run src/__tests__/useProjectStore.test.js` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOR-01 | `save()` persists project record and blobs to IDB | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | Wave 0 |
| STOR-02 | `load(id)` restores book + chapters + files | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | Wave 0 |
| STOR-03 | Boot effect hydrates from `getLastProjectId` on mount | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | Wave 0 |
| STOR-04 | File blobs round-trip through save/load without corruption | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | Wave 0 |
| STAT-01 | `isDirty` is false after save, true after mutation | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | Wave 0 |
| STAT-02 | `isDirty` guard blocks switch when true; modal confirms discard | manual-only | visual inspection | N/A |
| PROJ-01 | `projectList` returned from hook is sorted by updatedAt desc | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | Wave 0 |
| PROJ-04 | `projectList` entries include name, updatedAt, and fileCount | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | Wave 0 |

STAT-02 confirmation modal is manual-only because it requires user interaction to trigger; the `isDirty` flag itself is unit-testable, but the modal flow requires a browser.

### Sampling Rate

- **Per task commit:** `npx vitest run src/__tests__/useProjectStore.test.js`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/useProjectStore.test.js` — covers STOR-01, STOR-02, STOR-03, STOR-04, STAT-01, PROJ-01, PROJ-04
  - Note: `renderHook` from React Testing Library is needed to test custom hooks in Vitest. No RTL is installed. The hook can be tested by calling it as a plain async function (not as a React hook) if it returns async functions that can be invoked directly — OR by installing `@testing-library/react`. Check whether the hook needs React rendering context before deciding.

**RTL dependency decision (Wave 0):** If `useProjectStore` uses only React primitives (`useState`, `useRef`, `useMemo`, `useEffect`) and the test needs to verify hook state changes across renders, `@testing-library/react` is required. If tests can be written by calling the exported async functions directly (save, load, etc.) without needing React's render cycle, RTL is not needed. Recommend scoping the test to the async functions only and keeping component rendering tests to manual/browser verification for this phase.

---

## Sources

### Primary (HIGH confidence)

- `src/projectDb.js` (Phase 1 output) — complete API: `putProject`, `getProject`, `listProjects`, `deleteProject`, `putFiles`, `getFiles`, `requestPersistentStorage`, `saveLastProjectId`, `getLastProjectId`
- `src/projectSerializer.js` (Phase 1 output) — `serializeProject`, `deserializeProject`, `SCHEMA_VERSION`
- `src/App.jsx` — full state inventory (lines 1140–1375), confirmed state variables and refs
- `.planning/phases/01-storage-foundation/01-01-SUMMARY.md` — schema contract and blobId decisions
- `.planning/phases/01-storage-foundation/01-02-SUMMARY.md` — Dexie API and test patterns
- `.planning/REQUIREMENTS.md` — canonical requirement text and out-of-scope decisions
- `package.json` — confirmed React 19.2.4, Dexie 4.3.0, Vitest 4.1.0, fake-indexeddb 6.2.5

### Secondary (MEDIUM confidence)

- React custom hook patterns: standard React documentation patterns; the `useRef` + async snapshot approach for isDirty is a widely-used React pattern verified against the codebase's own use of `chaptersRef`/`bookRef` in App.jsx (lines 1150–1153)
- `beforeunload` guard: standard browser API, no library needed

### Tertiary (LOW confidence)

- None — all claims in this research are grounded in the Phase 1 codebase artifacts, which are directly readable.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages are already installed and tested in Phase 1
- Architecture: HIGH — patterns derived directly from reading the existing codebase and Phase 1 contracts
- Pitfalls: HIGH — derived from the actual Phase 1 implementation decisions (blobId stability, null vs. undefined, snapshot comparison)

**Research date:** 2026-03-17
**Valid until:** Stable for the duration of Phase 2 (no fast-moving dependencies)
