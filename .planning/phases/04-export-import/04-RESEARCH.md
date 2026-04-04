# Phase 04: Export / Import - Research

**Researched:** 2026-04-03
**Domain:** Browser-side ZIP archive export and import using JSZip; IndexedDB round-trip; UI integration in ProjectList
**Confidence:** HIGH

## Summary

Phase 4 is the narrowest and most self-contained phase in the v1 milestone. All required libraries are already installed (JSZip 3.10.1, Dexie 4.3.0). Both ZIP creation and ZIP reading patterns already exist in the codebase — `App.jsx` builds output ZIPs, `inputResolver.js` reads them. The task is to compose those existing patterns into two new store methods (`exportProject`, `importProject`) and wire them into the `ProjectList` UI.

The only novel engineering decisions are: (1) the exact ZIP structure for both export modes, (2) the import validation logic, and (3) the name-collision rename strategy. All three are already locked in the CONTEXT.md decisions. The implementation is assembly, not invention.

Test infrastructure is healthy — 109 tests pass, Vitest 4.1.2 runs in ~230ms. The new test file for export/import should follow the same fake-indexeddb + vi.stubGlobal pattern established in `useProjectStore.test.js` and `fileSaver.test.js`.

**Primary recommendation:** Add `exportProject(id, mode)` and `importProject(file)` to `useProjectStore.js`, following the exact same patterns already in that file. Add the export hover icon and import button to `ProjectList.jsx`. No new dependencies needed.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Two export modes: "Full project" (sources + outputs + settings + project.json) and "Outputs only" (just generated Markdown files).

**D-02:** ZIP structure mirrors server layout: `project.json` at root, `sources/` folder for originals, `outputs/` folder for Markdown. "Outputs only" mode produces a flat ZIP with just the .md files.

**D-03:** Export is entirely browser-side using JSZip (already installed). Builds ZIP from IndexedDB blobs. No server dependency.

**D-04:** Name collisions auto-rename: append " (2)", " (3)" etc. to imported project name. User can rename afterward.

**D-05:** Import writes to IDB first, then fires fire-and-forget server sync if server is available. Same dual-store pattern as Phase 3 save.

**D-06:** Validate ZIP before importing: check for project.json (or at minimum .md files in outputs/). Show clear error if ZIP structure is unrecognized. No partial imports.

**D-07:** Export button as a hover action on each project card in ProjectList (alongside existing rename/delete icons). Import button at top or bottom of the project list.

**D-08:** Export mode selection via small dropdown on export icon click: "Full project" / "Outputs only". Single extra click.

**D-09:** Simple spinner on button during export/import. Toast notification on completion/error. Operations typically <2 seconds for 5-15 chapter projects.

### Claude's Discretion

- Export icon choice (download arrow, share icon, or similar)
- Import icon/button styling
- Dropdown component implementation (inline vs extracted)
- Toast notification approach (inline message vs positioned toast)
- Exact validation rules for what constitutes a "valid" import ZIP
- Whether "Outputs only" ZIP includes the 00-index.md file (likely yes)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXPT-01 | User can export a project as a ZIP archive containing source files, outputs, and settings | JSZip `generateAsync({type:"blob"})` + `saveBlob()` + `getProject()` + `getFiles()` from IDB; D-01 / D-02 / D-03 lock the shape |
| EXPT-02 | User can import a project from a ZIP archive, restoring it as a new saved project | JSZip `loadAsync(arrayBuffer)` + `putProject()` + `putFiles()` + fire-and-forget server sync per D-05 / D-06 |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- No new npm dependencies (JSZip is already installed — fine).
- `useProjectStore.js` owns all persistence logic — export/import go here.
- Inline styles throughout (no CSS modules, no styled-components).
- CSS variables for theming: `--bg`, `--border`, `--accent`, `--muted`, `--text`.
- Dynamic JSZip import: `const JSZip = (await import("jszip")).default;` (lazy-loaded).
- ES Module imports with explicit `.js` extensions.
- JSDoc `@param`/`@returns` on all exported functions.
- Section separators: `// ─── Section Name ────────`.
- Tests structured without `@testing-library/react` — exported helpers + direct IDB calls in fake-indexeddb.
- After making code changes, run `npx vitest run` automatically.

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| jszip | 3.10.1 | Create and read ZIP archives in-browser | Already used in `App.jsx` and `inputResolver.js` |
| dexie | 4.3.0 | IndexedDB adapter | Already used via `projectDb.js` |
| fake-indexeddb | 6.2.5 | IDB mock for Vitest tests | Already used in all persistence tests |
| vitest | 4.1.2 | Test runner | `npx vitest run` |

### No new dependencies needed.

**Version verification:** Confirmed via `npm view jszip version` (3.10.1) and `npm view vitest version` (4.1.2) on 2026-04-03.

---

## Architecture Patterns

### Recommended File Changes

```
src/
├── useProjectStore.js      # Add exportProject(id, mode), importProject(file)
├── ProjectList.jsx         # Add export icon (3rd hover action) + import button
└── __tests__/
    └── exportImport.test.js   # New test file (created in Wave 0)
```

No new source files. Both new methods live in `useProjectStore.js` alongside existing `save`, `load`, `renameProject`, `deleteProject`.

### Pattern 1: Export ZIP Assembly

**What:** Read project from IDB, assemble ZIP in memory using JSZip, trigger download via `saveBlob()`.

**When to use:** `exportProject(id, mode)` where `mode` is `"full"` or `"outputs-only"`.

```javascript
// Source: App.jsx lines 464-481 (existing generateZip pattern) + projectDb.js
async function exportProject(id, mode) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const record = await getProject(id);
  if (!record) throw new Error("Project not found");

  if (mode === "full") {
    // project.json at root
    zip.file("project.json", JSON.stringify(record, null, 2));

    // sources/ — original uploaded files as blobs
    const blobMap = await getFiles(id);
    const sourcesFolder = zip.folder("sources");
    for (const chapter of record.chapters) {
      const file = blobMap.get(chapter.blobId);
      if (file) sourcesFolder.file(chapter.fileName, file);
    }

    // outputs/ — generated Markdown
    const outputsFolder = zip.folder("outputs");
    for (const chapter of record.chapters) {
      if (chapter.markdownContent) {
        const fn = `${String(chapter.chapterNum).padStart(2, "0")}-${chapter.slug}.md`;
        outputsFolder.file(fn, chapter.markdownContent);
      }
    }
    // include 00-index.md in outputs/ (implied by "Outputs only" includes it too)

  } else {
    // "outputs-only": flat ZIP with .md files
    for (const chapter of record.chapters) {
      if (chapter.markdownContent) {
        const fn = `${String(chapter.chapterNum).padStart(2, "0")}-${chapter.slug}.md`;
        zip.file(fn, chapter.markdownContent);
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const filename = smartFilename("zip", { bookTitle: record.name });
  await saveBlob(filename, blob);
}
```

**Confidence:** HIGH — directly composes existing `getProject`, `getFiles`, JSZip, and `saveBlob` patterns.

### Pattern 2: Import ZIP Rehydration

**What:** Load ZIP from user-provided File, validate structure, assign new UUID, check for name collisions, write to IDB, fire-and-forget server sync.

**When to use:** `importProject(file)` where `file` is a `File` object from `<input type="file" accept=".zip">`.

```javascript
// Source: inputResolver.js extractZip pattern + projectDb.js + serverApi.js
async function importProject(file) {
  const JSZip = (await import("jszip")).default;
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // --- Validation (D-06) ---
  const hasProjectJson = !!zip.files["project.json"];
  const hasMdFiles = Object.keys(zip.files).some(
    name => !zip.files[name].dir && name.endsWith(".md")
  );
  if (!hasProjectJson && !hasMdFiles) {
    throw new Error("Unrecognized ZIP format: expected project.json or .md files.");
  }

  // --- Parse project record ---
  let projectRecord;
  if (hasProjectJson) {
    const raw = await zip.files["project.json"].async("string");
    projectRecord = JSON.parse(raw);
  } else {
    // Outputs-only ZIP: construct minimal projectRecord from .md filenames
    // (no book metadata available — use ZIP filename as project name)
    projectRecord = buildMinimalRecord(zip.files, file.name);
  }

  // --- Assign new UUID (always — never overwrite existing project) ---
  const newId = crypto.randomUUID();
  projectRecord = { ...projectRecord, id: newId };

  // --- Name collision resolution (D-04) ---
  projectRecord.name = await resolveImportName(projectRecord.name);

  // --- Write to IDB ---
  await putProject(projectRecord);

  // --- Write source blobs (full project ZIPs only) ---
  const blobs = [];
  for (const chapter of projectRecord.chapters ?? []) {
    const path = `sources/${chapter.fileName}`;
    if (zip.files[path]) {
      const blob = await zip.files[path].async("blob");
      const fileObj = new File([blob], chapter.fileName);
      blobs.push({ id: chapter.blobId, file: fileObj, name: chapter.fileName });
    }
  }
  if (blobs.length > 0) await putFiles(newId, blobs);

  // --- Fire-and-forget server sync (D-05) ---
  fireAndForget(
    isServerAvailable().then(up => {
      if (up) return saveProjectToServer(slugify(projectRecord.name), projectRecord);
    })
  );

  // --- Refresh project list ---
  const list = await listProjects();
  setProjectList(list);

  return newId;
}
```

**Confidence:** HIGH — composites existing store + serverApi patterns directly.

### Pattern 3: Name Collision Resolution

**What:** Before importing, check if a project with the same name exists in `projectList`. If so, append " (2)", " (3)", etc.

```javascript
// Runs inside useProjectStore where projectList is in scope
async function resolveImportName(baseName) {
  const existingNames = new Set(projectList.map(p => p.name));
  if (!existingNames.has(baseName)) return baseName;
  let counter = 2;
  while (existingNames.has(`${baseName} (${counter})`)) counter++;
  return `${baseName} (${counter})`;
}
```

**Confidence:** HIGH — pure string logic, no new APIs.

### Pattern 4: Export Dropdown in ProjectList

**What:** Third hover action button. On click, shows an inline dropdown with "Full project" and "Outputs only" options. Single extra click per D-08.

**Approach (discretion area):** Inline dropdown positioned relative to the button, controlled by local `exportMenuId` state (similar to how `deleteTarget` is managed). No portal needed.

```javascript
// ProjectList.jsx — new local state
const [exportMenuId, setExportMenuId] = useState(null); // project.id or null

// On export icon click:
onClick={e => { e.stopPropagation(); setExportMenuId(project.id); }}

// Dropdown (rendered inline, positioned absolute):
{exportMenuId === project.id && (
  <div style={{ position: "absolute", top: 28, right: 0, zIndex: 100,
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)", minWidth: 140 }}>
    <button onClick={() => { onExport(project.id, "full"); setExportMenuId(null); }}>
      Full project
    </button>
    <button onClick={() => { onExport(project.id, "outputs-only"); setExportMenuId(null); }}>
      Outputs only
    </button>
  </div>
)}
```

Close on outside click: add a `useEffect` that adds a `mousedown` listener on `document` when `exportMenuId !== null`, similar to common dropdown patterns.

**Confidence:** MEDIUM — standard React dropdown pattern; no library verification needed.

### Pattern 5: Import File Input

**What:** Hidden `<input type="file" accept=".zip">` with a ref, triggered by a visible "Import" button at the bottom of the ProjectList expanded view.

```javascript
const importInputRef = useRef(null);

// Button:
<button onClick={() => importInputRef.current?.click()}>Import project</button>

// Hidden input:
<input ref={importInputRef} type="file" accept=".zip" style={{ display: "none" }}
  onChange={async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be imported again
    await onImport(file);
  }} />
```

**Confidence:** HIGH — this is the standard browser file input pattern; same approach used in `App.jsx` for source file imports.

### Pattern 6: Toast / Status Feedback

**What:** Inline status message near the import button (or the triggering card) rather than a global toast. Uses local `importStatus` state: `null | "importing" | "done" | "error"`. Auto-clears after 3 seconds via `setTimeout`.

**Rationale:** Avoids global toast infrastructure (no new component). Consistent with the project's preference for inline state (e.g., saveStatus indicator in header). The message appears beneath the import button and auto-dismisses.

```javascript
const [importStatus, setImportStatus] = useState(null); // null | {state, message}

// On import:
setImportStatus({ state: "importing", message: "Importing..." });
try {
  const newId = await onImport(file);
  setImportStatus({ state: "done", message: "Project imported." });
  setTimeout(() => setImportStatus(null), 3000);
} catch (err) {
  setImportStatus({ state: "error", message: err.message });
  setTimeout(() => setImportStatus(null), 5000);
}
```

**Confidence:** HIGH — uses existing React state pattern, no new infrastructure.

### Anti-Patterns to Avoid

- **Embedding blobs in project.json:** File objects cannot be JSON-serialized. The same blobId indirection used in `serializeProject` must be used in the ZIP (blobId links chapter record in project.json to file in `sources/`).
- **Importing without a new UUID:** Always generate a fresh `crypto.randomUUID()` for imported projects. Reusing the original ID would silently overwrite an existing project if one was previously imported.
- **Partial writes on validation failure:** Validate the full ZIP structure before writing any IDB records. If validation fails at any step, write nothing (D-06: no partial imports).
- **Awaiting the server sync:** The `saveProjectToServer` call must be fire-and-forget. The import should feel instant once IDB write completes.
- **Using `zip.files` keys with OS-artifact paths:** Import ZIPs created by this app will have clean paths, but user-supplied ZIPs may contain `__MACOSX/` entries. Skip non-`.json` / non-`.md` / non-source entries during import (same OS artifact filtering already in `inputResolver.js`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP creation | Custom byte assembly | JSZip `zip.generateAsync({type:"blob"})` | Already installed; handles compression, encoding, binary |
| ZIP reading | Manual ArrayBuffer parsing | JSZip `loadAsync(buf)` | Already used in `inputResolver.js` |
| File download | `fetch` POST or server roundtrip | `saveBlob()` from `fileSaver.js` | Already handles File System Access API + fallback |
| IDB writes | Raw IndexedDB transactions | `putProject()`, `putFiles()` from `projectDb.js` | Already handles QuotaExceededError, uses Dexie bulkPut |
| Server sync | New fetch patterns | `saveProjectToServer()` + `fireAndForget()` from `serverApi.js` and `useProjectStore.js` | Established pattern, already tested |

**Key insight:** This phase is pure composition of existing primitives. Any custom solution for the above problems re-introduces edge cases already solved.

---

## Common Pitfalls

### Pitfall 1: JSZip File Entry Access — Key Format Matters

**What goes wrong:** `zip.files["project.json"]` returns `undefined` because the file was stored as `"./project.json"` or a subfolder entry has a trailing slash.

**Why it happens:** JSZip normalizes paths but the exact key depends on how the ZIP was built. Entries added via `zip.file("project.json", ...)` use `"project.json"` as the key. Folder entries added via `zip.folder("sources")` create a `"sources/"` key (with trailing slash) — not a file.

**How to avoid:** When reading by known path, use exact key. When iterating, filter out directory entries with `!zip.files[name].dir`. When checking existence, use `Object.keys(zip.files).includes("project.json")` or iterate with `.dir` check.

**Warning signs:** `zip.files["project.json"]` returns `undefined` even though the ZIP visually contains the file; iterating `zip.files` finds `"sources/"` (directory) entries.

### Pitfall 2: Missing blobId Linkage in Exported project.json

**What goes wrong:** The exported `project.json` contains chapter entries with `blobId` fields, but the blobs in `sources/` are keyed by `chapter.fileName` instead of by `blobId`. On import, `deserializeProject` can't reattach the files because `blobMap.get(chapter.blobId)` returns `undefined`.

**Why it happens:** Building the export ZIP by filename is intuitive (human-readable), but the serializer contract requires blobs to be stored under their `blobId` key.

**How to avoid:** When writing `putFiles()` on import, use the `blobId` from `projectRecord.chapters[n].blobId` as the record `id` — not the filename. The import pattern above does this correctly.

### Pitfall 3: Same-File Re-Import Shows No File Picker

**What goes wrong:** User imports a file, then tries to import the same file again. The `onChange` on the `<input>` never fires because the browser considers the selection unchanged.

**Why it happens:** `<input type="file">` only fires `onChange` when the value changes. Re-selecting the same file produces no event.

**How to avoid:** Reset `e.target.value = ""` inside the `onChange` handler immediately after capturing the file. This is shown in the Pattern 5 code above.

### Pitfall 4: Importing from a Non-This-App ZIP

**What goes wrong:** User imports an arbitrary ZIP (e.g., a ZIP of Markdown files they edited manually). Import fails or produces an empty project because there is no `project.json`.

**Why it happens:** Validation rule D-06 requires checking for `project.json` OR `.md files in outputs/`. "Outputs only" mode ZIPs from this app have a flat structure with `.md` files directly at root (not in `outputs/`).

**How to avoid:** Accept as valid: (a) ZIP with `project.json` at root, (b) ZIP with at least one `.md` file at any path. For case (b), build a minimal `projectRecord` from the filenames (no book metadata). Document the fallback behavior in the error path. The exact rules are in Claude's Discretion but the research confirms the two viable structural forms.

### Pitfall 5: Export with No Converted Outputs

**What goes wrong:** User tries to export a project that has source files loaded but no conversions run yet. The "Outputs only" ZIP is empty (no `.md` files). "Full project" ZIP has `sources/` but empty `outputs/`.

**Why it happens:** `chapter.markdownContent` is empty string for unconverted chapters.

**How to avoid:** In `exportProject`, check that at least one chapter has non-empty `markdownContent`. If mode is "outputs-only" and nothing is converted, show an error message: "No converted outputs to export. Convert files first." The "Full project" mode should always succeed (sources are always present if the project is saved).

### Pitfall 6: Name Collision Check Uses Stale In-Memory List

**What goes wrong:** `resolveImportName()` reads `projectList` from the hook closure. If multiple imports happen in rapid succession, the second import might not see the project created by the first, causing duplicate names.

**Why it happens:** `projectList` is React state — it doesn't update between synchronous calls.

**How to avoid:** After each successful import, call `listProjects()` from `projectDb.js` to refresh the list before the next import. Since typical usage is one-import-at-a-time, this is low risk but should be documented.

---

## Code Examples

Verified patterns from existing codebase:

### ZIP Creation (from App.jsx lines 464-481)

```javascript
// Source: src/App.jsx generateZip function
async function generateZip(chapters, book) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const ch of done) {
    zip.file(fn, refreshYaml(ch, book));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  await saveBlob(fn, blob);
}
```

### ZIP Reading (from inputResolver.js extractZip)

```javascript
// Source: src/inputResolver.js extractZip function
export async function extractZip(zipFile) {
  const JSZip = (await import("jszip")).default;
  const buf = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.values(zip.files).filter(f => !f.dir);
  for (const entry of entries) {
    const blob = await entry.async("blob");
    const file = new File([blob], finalName, { type: blob.type });
  }
}
```

### Fire-and-Forget Server Sync (from useProjectStore.js)

```javascript
// Source: src/useProjectStore.js save()
fireAndForget(
  isServerAvailable().then(up => {
    setServerConnected(up);
    if (up) return saveProjectToServer(slug, projectRecord);
  })
);
```

### IDB Write Pattern (from useProjectStore.js save())

```javascript
// Source: src/useProjectStore.js save()
await putProject(projectRecord);
if (blobs.length > 0) await putFiles(id, blobs);
saveLastProjectId(id);
const list = await listProjects();
setProjectList(list);
```

### Hover Action Button (from ProjectList.jsx — existing pencil button)

```javascript
// Source: src/ProjectList.jsx
<button
  tabIndex={showActions ? 0 : -1}
  onClick={e => { e.stopPropagation(); startRename(project); }}
  title="Rename project"
  style={{ width: 28, height: 28, /* ... */ }}
>
  <svg .../>
</button>
```

### Test Skeleton (from useProjectStore.test.js)

```javascript
// Source: src/__tests__/useProjectStore.test.js
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
vi.stubGlobal("localStorage", localStorageMock);
// Direct IDB + serializer calls — no React needed
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is browser-side only. All dependencies (JSZip, Dexie, Vitest) are already installed as npm packages in the project. No external services, CLIs, or system tools are required beyond what's already present.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | None (default Vitest config via package.json `"test": "vitest run"`) |
| Quick run command | `npx vitest run src/__tests__/exportImport.test.js` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXPT-01 | `exportProject("full")` builds ZIP with project.json, sources/, outputs/ | unit | `npx vitest run src/__tests__/exportImport.test.js` | Wave 0 |
| EXPT-01 | `exportProject("outputs-only")` builds flat ZIP with only .md files | unit | `npx vitest run src/__tests__/exportImport.test.js` | Wave 0 |
| EXPT-01 | `exportProject` with no converted outputs throws/returns error | unit | `npx vitest run src/__tests__/exportImport.test.js` | Wave 0 |
| EXPT-02 | `importProject` from a "full" ZIP writes project + blobs to IDB with new UUID | unit | `npx vitest run src/__tests__/exportImport.test.js` | Wave 0 |
| EXPT-02 | `importProject` from "outputs-only" ZIP creates minimal project record | unit | `npx vitest run src/__tests__/exportImport.test.js` | Wave 0 |
| EXPT-02 | `importProject` with name collision appends " (2)" suffix | unit | `npx vitest run src/__tests__/exportImport.test.js` | Wave 0 |
| EXPT-02 | `importProject` with invalid ZIP throws with clear message | unit | `npx vitest run src/__tests__/exportImport.test.js` | Wave 0 |
| EXPT-02 | Import round-trip: exported ZIP can be re-imported with correct chapter data | integration | `npx vitest run src/__tests__/exportImport.test.js` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/__tests__/exportImport.test.js`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (`npx vitest run` — all 109+ tests pass) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/exportImport.test.js` — covers all EXPT-01 and EXPT-02 behaviors above
  - Requires `fake-indexeddb/auto` import (already used in `useProjectStore.test.js`)
  - Requires `vi.stubGlobal("localStorage", localStorageMock)` (copy from existing test)
  - JSZip must be imported; Vitest ESM handles it natively without mocking

---

## Open Questions

1. **00-index.md inclusion in "Outputs only" mode**
   - What we know: D-02 says "flat ZIP with just the .md files"; Claude's Discretion notes "likely yes" for 00-index.md
   - What's unclear: Whether 00-index.md is among `chapter.markdownContent` fields or is generated separately (in `App.jsx`, `buildIndexFile()` is called separately from chapter content)
   - Recommendation: Include 00-index.md in both modes. In `exportProject`, iterate chapters for individual chapter `.md` files, then call the same `buildIndexFile()` helper from `App.jsx` (or reconstruct equivalent logic) to generate `00-index.md`. This is a detail for the planner to decide — if `buildIndexFile` is exported from App.jsx or a shared utility, it can be reused; otherwise inline the logic.

2. **Outputs-only import — minimal record shape**
   - What we know: If a ZIP has no `project.json`, only `.md` files exist. We need a `projectRecord` to store.
   - What's unclear: What `book.title` and `book.author` to use (ZIP filename? Empty?)
   - Recommendation: Use the ZIP filename (strip `.zip`) as `name`, leave `book: { title: "", author: "" }`, build `chapters` array from `.md` filenames using slug/chapterNum inference from filenames like `01-jury-selection.md`. The project will be importable and the user can convert again or use the Markdown directly.

---

## Sources

### Primary (HIGH confidence)

- Existing codebase (`src/App.jsx`, `src/useProjectStore.js`, `src/projectDb.js`, `src/projectSerializer.js`, `src/fileSaver.js`, `src/inputResolver.js`, `src/serverApi.js`) — read directly
- JSZip official docs — [generateAsync](https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html), [loadAsync](https://stuk.github.io/jszip/documentation/api_jszip/load_async.html), [read ZIP how-to](https://stuk.github.io/jszip/documentation/howto/read_zip.html)
- npm registry: `jszip` 3.10.1 confirmed, `vitest` 4.1.2 confirmed

### Secondary (MEDIUM confidence)

- Phase CONTEXT.md locked decisions (D-01 through D-09) — all architectural choices pre-verified by user

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture patterns: HIGH — direct composition of existing code; no new patterns
- Pitfalls: HIGH — derived from close reading of existing code edge cases
- Test plan: HIGH — mirrors test patterns already established in 8 existing test files

**Research date:** 2026-04-03
**Valid until:** 2026-06-01 (JSZip 3.x API is stable; no breaking changes expected)
