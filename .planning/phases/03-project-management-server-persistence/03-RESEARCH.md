# Phase 03: Project Management + Server Persistence - Research

**Researched:** 2026-03-17
**Domain:** React inline editing / confirmation modals / FastAPI REST + filesystem / fire-and-forget server sync
**Confidence:** HIGH

## Summary

This phase is almost entirely about wiring together existing, proven pieces — not introducing new architecture. The codebase already has `projectDb.deleteProject()`, `projectDb.putProject()`, `serverApi.isServerAvailable()`, and the unsaved-changes modal pattern. The plan work is to identify exactly where new code hooks into each existing file, not to design from scratch.

The two plans map cleanly to UI-only work (Plan 03-01: rename/delete in `ProjectList.jsx` + `useProjectStore.js`) and backend-only work (Plan 03-02: FastAPI `/projects/*` endpoints + `serverApi.js` client functions). These plans are independent and can execute in parallel or serially without blocking each other, since the server save is fire-and-forget from the IDB save path.

The critical architecture constraint is that server persistence NEVER blocks the user: IndexedDB is the primary store, server is a transparent enhancement. Any server I/O — save, rename, delete — must be fire-and-forget with `.catch(e => console.warn(e))` and must not affect `saveStatus` or surface errors to the user.

**Primary recommendation:** Keep the two plans fully isolated: 03-01 touches only frontend files (`ProjectList.jsx`, `useProjectStore.js`, `App.jsx`), 03-02 touches only backend/client-adapter files (`server.py`, `serverApi.js`). Integration is a one-liner hook inside `useProjectStore.save()`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rename/delete UX**
- Hover icon buttons (pencil, trash) appear on the right side of each project card on hover — minimal visual noise when not interacting
- Rename uses inline text editing directly on the card — name becomes an editable input field, Enter/blur to save, Escape to cancel, text pre-selected
- Rename and delete actions are available only in the expanded ProjectList, not in the header save area
- Header save input remains unchanged — only for naming when saving

**Delete behavior**
- Custom styled modal for delete confirmation (consistent with existing unsaved-changes guard)
- Modal shows project name, file count, and "This cannot be undone" warning
- Delete button styled in red/danger color, Cancel as default
- Deleting the active project resets workspace to blank state (same as `newProject()`)
- Delete removes from both IndexedDB AND server directory (if server available) — server failure is non-blocking

**Dual-store save flow**
- IDB first, server fire-and-forget: save to IndexedDB immediately, show "Saved", then fire background server save
- Server save failure: `console.warn` only — user sees "Saved" because IDB succeeded
- Server directory structure: `./projects/<slug>/project.json` + `./projects/<slug>/sources/` with original files
- Directory name derived from slugified project name (lowercase, spaces to hyphens, strip special chars)
- Slug collision for different project IDs handled with -2, -3 suffix
- Outputs NOT stored on server — they can be regenerated from sources
- Rename also renames the server directory (fire-and-forget, non-blocking)

**Server status UX**
- Small colored dot near the save area: green = server connected, gray = offline
- Tooltip on hover explains status ("Server connected — projects backed to disk" / "Server offline — saving to browser only")
- Server save failure is silent to the user (`console.warn` only) — IDB save already succeeded
- Reuse existing 30-second `serverApi.js` availability cache — no new polling or timers
- Dot updates naturally whenever cache refreshes (on save, on convert, or after 30s expiry)

### Claude's Discretion
- Exact icon choices for pencil/trash (SVG inline or unicode)
- Modal component structure (inline in ProjectList or extracted)
- Server endpoint naming and REST conventions
- Slug generation algorithm details
- How to structure the fire-and-forget server save (Promise.catch vs try/catch)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROJ-02 | User can rename a saved project | Rename via inline input in ProjectList card; `putProject()` handles the IDB write as a read-modify-write; server `PUT /projects/<slug>/rename` is fire-and-forget |
| PROJ-03 | User can delete a saved project with a confirmation dialog | `deleteProject()` already handles transactional IDB delete; delete modal mirrors existing unsaved-changes modal pattern; deleting active project calls `newProject()` |
</phase_requirements>

---

## Standard Stack

### Core (all already in use — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Dexie | ^4.3.0 | IndexedDB adapter | Already used; `putProject()`, `deleteProject()` are the rename/delete IDB layer |
| React | ^19.0.0 | UI components | Project stack; inline editing is standard controlled-input pattern |
| FastAPI | 0.135.1 | Server REST endpoints | Already used for `/convert`; same pattern for `/projects/*` |
| Pydantic v2 | 2.12.5 | Request/response models | Already installed; model `ProjectSaveRequest` validates incoming JSON |
| Vitest | ^4.1.0 | Test runner | Already used; same patterns as `projectDb.test.js` and `useProjectStore.test.js` |

### No New Dependencies Required

The constraint from PROJECT.md is "no new npm dependencies". All required capabilities are covered:
- File blob to bytes: `File.arrayBuffer()` (browser native)
- Slug generation: 3-line regex (no slugify library needed)
- Icon rendering: inline SVG paths or Unicode (no icon library needed)

**Installation:** None required.

---

## Architecture Patterns

### File Modification Map

This phase touches exactly five files:

```
src/
├── ProjectList.jsx       # Add hover icons, inline rename input, delete modal
├── useProjectStore.js    # Add rename(), deleteProject(), server fire-and-forget hooks
├── serverApi.js          # Add saveProjectToServer(), renameProjectOnServer(), deleteProjectOnServer()
└── App.jsx               # Add server status dot + tooltip; wire onRename/onDelete props

server.py                 # Add /projects/* REST endpoints, slug helper, filesystem I/O
```

No new files need to be created. No existing logic needs to be refactored.

### Pattern 1: Inline Rename with Controlled Input

**What:** When the pencil icon is clicked, the project name text in the card is replaced with an `<input>` whose value is controlled local state pre-seeded with the current name.

**When to use:** Single field inline edit — avoids modal overhead.

**Key behaviors to get right:**
- `useRef` on the input + `autoFocus` or `useEffect(() => ref.current.select(), [])` to pre-select text
- `onKeyDown`: Enter key calls save, Escape calls cancel (restores original name without hitting IDB)
- `onBlur` calls save — user clicks away = confirm intent
- Optimistic update: update `projectList` in React state immediately; IDB write and server rename happen asynchronously

```javascript
// Source: controlled input pattern — React 19 docs
const [editingId, setEditingId] = useState(null);
const [editName, setEditName] = useState("");
const editRef = useRef(null);

// on pencil click:
setEditingId(project.id);
setEditName(project.name);
// after setState, focus+select via useEffect or autoFocus

// in card render:
{editingId === project.id ? (
  <input
    ref={editRef}
    value={editName}
    autoFocus
    onChange={e => setEditName(e.target.value)}
    onKeyDown={e => {
      if (e.key === "Enter") handleRenameConfirm(project.id, editName);
      if (e.key === "Escape") setEditingId(null);
    }}
    onBlur={() => handleRenameConfirm(project.id, editName)}
    onClick={e => e.stopPropagation()} // prevent card click = project switch
  />
) : (
  <span>{project.name}</span>
)}
```

**Critical:** `onClick={e => e.stopPropagation()}` on the input prevents the card's `onClick` (which calls `onSwitch`) from firing when the user clicks into the rename input.

### Pattern 2: Hover Icon Buttons

**What:** Pencil and trash icons appear only when the card is hovered, using existing `hovered` state already present in `ProjectList.jsx`.

**Current state:** `ProjectList.jsx` already has `const [hovered, setHovered] = useState(null)` and per-card `onMouseEnter`/`onMouseLeave` handlers. The icons slot directly into the existing right side of the card layout.

```javascript
// Source: existing ProjectList.jsx hover pattern
{hovered === project.id && editingId !== project.id && (
  <div style={{ display: "flex", gap: 4 }}>
    <button onClick={e => { e.stopPropagation(); startRename(project); }}
      title="Rename" style={{ /* ... */ }}>
      {/* pencil SVG or ✏ unicode */}
    </button>
    <button onClick={e => { e.stopPropagation(); setDeleteTarget(project); }}
      title="Delete" style={{ /* ... */ }}>
      {/* trash SVG or 🗑 unicode */}
    </button>
  </div>
)}
```

**Critical:** `e.stopPropagation()` on both buttons prevents the card's `onClick` from triggering a project switch.

### Pattern 3: Delete Confirmation Modal

**What:** Matches the existing unsaved-changes modal pattern in `App.jsx` exactly — same overlay, same box styling, same button treatment.

**Existing modal structure (from App.jsx lines 1561-1595):**
```javascript
// pattern already in codebase:
{showSwitchConfirm && (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
    display: "flex", justifyContent: "center", alignItems: "center",
  }}>
    <div style={{
      background: "var(--bg)", borderRadius: 12, padding: 24, maxWidth: 400,
      border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    }}>
      ...
      <button style={{ background: "#dc2626", color: "#fff", ... }}>Danger action</button>
    </div>
  </div>
)}
```

**For delete modal**, state shape should be: `deleteTarget: { id, name, chapters }` or `null`. Setting to `null` = modal closed.

**Modal placement decision:** The delete modal state (`deleteTarget`) can live in `ProjectList.jsx` as local state since it's triggered from within that component — no need to lift to App.jsx. `onDelete` prop fires from `ProjectList` after confirmation and triggers the actual deletion in `useProjectStore`.

### Pattern 4: `renameProject` in `projectDb.js`

**What:** A new `renameProject(id, newName)` function that does a read-modify-write through `putProject`.

```javascript
// Source: existing putProject pattern in projectDb.js
export async function renameProject(id, newName) {
  const record = await getProject(id);
  if (!record) return;
  await putProject({ ...record, name: newName, updatedAt: new Date().toISOString() });
}
```

`putProject` uses Dexie's `.put()` which is an upsert — safe for in-place updates.

### Pattern 5: Fire-and-Forget Server Sync

**What:** After IDB operations succeed, attempt the equivalent server operation without blocking or surfacing errors.

**Canonical pattern to use throughout:**
```javascript
// Fire-and-forget — call with no await, failures are silent
function fireAndForget(promise) {
  promise.catch(e => console.warn("[server sync]", e));
}

// In save():
await putProject(projectRecord);
// ... IDB done, show "Saved" ...
fireAndForget(saveProjectToServer(slug, projectRecord, blobs));

// In rename():
await renameProject(id, newName);
// ... IDB done, update UI ...
fireAndForget(renameProjectOnServer(oldSlug, newSlug));

// In deleteProject():
await projectDb.deleteProject(id);
// ... IDB done, update UI ...
fireAndForget(deleteProjectOnServer(slug));
```

This pattern keeps the UX save path entirely synchronous from the user's perspective.

### Pattern 6: Slug Generation

**What:** Convert project name to a filesystem-safe directory name.

```javascript
// Simple, no library needed
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}
```

**Collision handling:** The server endpoint returns the actual directory name used (including `-2`, `-3` suffixes). The client stores the resolved slug alongside the project ID so subsequent renames/deletes can target the correct directory. The `projectRecord` should store a `serverSlug` field after first server save.

**Where to store slug:** Add `serverSlug: string | null` to the project record in IDB. Default `null` until first server save succeeds. Update via `putProject()` after the server confirms the slug.

### Pattern 7: FastAPI Project Endpoints

**What:** Three new routes in `server.py` following the existing endpoint style.

**Endpoint design (Claude's discretion — recommended):**

```
POST   /projects/{slug}           — create/overwrite project directory
PUT    /projects/{slug}/rename    — rename directory (body: { new_slug })
DELETE /projects/{slug}           — remove project directory
```

**Pydantic v2 request models** (already installed):
```python
from pydantic import BaseModel

class ProjectSaveRequest(BaseModel):
    project_id: str
    name: str
    book: dict
    chapters: list[dict]   # metadata only, no blobs
    # source files arrive as multipart alongside this JSON

class RenameRequest(BaseModel):
    new_name: str          # human name
    new_slug: str          # pre-slugified by client
```

**File upload pattern:** Use `UploadFile` list alongside form JSON (same pattern as existing `/convert`):
```python
@app.post("/projects/{slug}")
async def save_project(
    slug: str,
    metadata: str = Form(...),   # JSON string of ProjectSaveRequest
    files: list[UploadFile] = File(default=[]),
):
    data = ProjectSaveRequest.model_validate_json(metadata)
    ...
```

**Filesystem structure:**
```
./projects/
└── <slug>/
    ├── project.json      # metadata (no blobs — just JSON)
    └── sources/
        ├── chapter-01.docx
        └── chapter-02.pdf
```

**CORS:** Existing CORS middleware allows all localhost origins with all methods. Adding DELETE requires adding `"DELETE"` to `allow_methods`. Current setting is `["GET", "POST"]` — extend to `["GET", "POST", "PUT", "DELETE"]`.

### Pattern 8: Server Status Dot

**What:** A small dot in the header area indicating server connectivity.

**Placement:** Inside the existing `<div style={{ display: "flex", alignItems: "center", gap: 8 }}>` that contains the save-state badge (App.jsx line 1474). The dot sits next to the Saved/Unsaved badge.

**State source:** `isServerAvailable()` from `serverApi.js`. The dot needs to read this value. The cleanest approach is to call `isServerAvailable()` inside `useProjectStore` once on mount and store it as state — or call it lazily on each save and keep a `serverConnected` state in the hook returned to `App.jsx`.

**Recommended approach:** Add `serverConnected: boolean` to `useProjectStore` return. Populate it by calling `isServerAvailable()` in the boot effect (no extra network round-trip since it would have already fired on first page load if server was checked).

```javascript
// In useProjectStore boot effect:
const serverUp = await isServerAvailable();
setServerConnected(serverUp);
// Updates naturally on next save (when isServerAvailable() is called again)
```

**Dot rendering (inline SVG dot):**
```javascript
<span
  title={serverConnected
    ? "Server connected — projects backed to disk"
    : "Server offline — saving to browser only"
  }
  style={{
    display: "inline-block", width: 8, height: 8,
    borderRadius: "50%",
    background: serverConnected ? "#10b981" : "#9ca3af",
    cursor: "default",
  }}
/>
```

### Anti-Patterns to Avoid

- **Awaiting server calls in the save path** — breaks the "IDB first, server fire-and-forget" contract; user would see "Saving..." hang if server is slow or offline
- **Lifting delete modal to App.jsx** — unnecessary; `deleteTarget` state belongs in `ProjectList.jsx` where the trigger lives
- **Card click fires on rename input** — missing `e.stopPropagation()` on the rename input's `onClick` will trigger project switch while editing
- **Polling server availability** — the CONTEXT.md explicitly says "reuse existing 30-second cache — no new polling or timers"
- **Storing output files on server** — CONTEXT.md explicitly says "Outputs NOT stored on server — they can be regenerated from sources"
- **Slug collision ignored** — not returning/storing the resolved slug means rename/delete will target wrong directory if collision occurred

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inline text editing | Custom contenteditable | Controlled `<input>` with autoFocus | `contenteditable` has cursor/selection bugs; controlled input is the React pattern |
| Slug generation | npm slugify | 3-line regex | No new npm deps constraint; regex covers the ASCII use case |
| Transactional IDB delete | Manual multi-table delete | `projectDb.deleteProject()` (already exists) | Already handles the projects + files transaction atomically |
| Project record update | Manual field merge | `putProject({ ...record, name, updatedAt })` | Dexie `.put()` is an upsert; read-modify-write is the established pattern |
| Server status polling | setInterval | 30s cache in `isServerAvailable()` (already exists) | Cache already implemented; reuse it |

---

## Common Pitfalls

### Pitfall 1: Card onClick Fires During Rename
**What goes wrong:** User clicks into the rename input field, triggering the card's `onClick` handler, which calls `onSwitch(project.id)` — switching to a different project or triggering the unsaved-changes modal unexpectedly.
**Why it happens:** The input is a child of the card div which has `onClick`.
**How to avoid:** Add `onClick={e => e.stopPropagation()}` to the inline rename input AND to both hover-action buttons.
**Warning signs:** Testing rename on a non-active project causes a project switch.

### Pitfall 2: Rename onBlur Fires After Escape
**What goes wrong:** User presses Escape to cancel rename, but the `onBlur` handler fires immediately after (input loses focus), triggering a save with the partially-edited name.
**Why it happens:** `onBlur` fires on any focus loss, including via keyboard Escape.
**How to avoid:** Use a `cancelledRef = useRef(false)`. Set it to `true` in the Escape handler before `setEditingId(null)`. Check it in `onBlur` before calling save.

```javascript
// Pattern to avoid double-fire on Escape:
const cancelledRef = useRef(false);
onKeyDown={e => {
  if (e.key === "Escape") {
    cancelledRef.current = true;
    setEditingId(null);
  }
  if (e.key === "Enter") handleRenameConfirm(project.id, editName);
}}
onBlur={() => {
  if (!cancelledRef.current) handleRenameConfirm(project.id, editName);
  cancelledRef.current = false;
}}
```

### Pitfall 3: Server CORS Blocks DELETE/PUT
**What goes wrong:** Browser preflight (OPTIONS) for DELETE and PUT requests gets rejected because `allow_methods` in `server.py` is currently `["GET", "POST"]` only.
**Why it happens:** Browser sends CORS preflight for non-simple methods (DELETE, PUT).
**How to avoid:** Update `allow_methods` in the CORS middleware to `["GET", "POST", "PUT", "DELETE", "OPTIONS"]` in Plan 03-02.
**Warning signs:** Browser console shows `CORS policy` error on project save/rename/delete.

### Pitfall 4: Slug Stored Only in Memory
**What goes wrong:** On first save, server creates `./projects/my-project/`. User renames to "My Project 2" in a later session (after page reload). Client has no slug stored — it re-slugifies the OLD name (because IDB only has `name: "My Project"`), sending delete to wrong directory.
**Why it happens:** Slug is computed at save time but not persisted.
**How to avoid:** After successful server save, store `serverSlug` in the project record in IDB via `putProject({ ...record, serverSlug: resolvedSlug })`. Server endpoint should return the resolved slug in its response.
**Warning signs:** Server directory is not deleted/renamed; old directory persists.

### Pitfall 5: Deleting Active Project Without State Reset
**What goes wrong:** User deletes the currently active project. The `chapters` and `book` state still reflect that project in memory. The deleted project no longer exists in IDB, but UI shows it as active.
**Why it happens:** `deleteProject(id)` removes from IDB but doesn't reset React state.
**How to avoid:** In the `deleteProject` handler in `useProjectStore`, after IDB delete succeeds, check `if (id === activeProjectId) { newProject(); }`.
**Warning signs:** After deleting active project, the project still appears "active" even though it's gone from the project list.

### Pitfall 6: Large File Upload to Server (Multipart Body Size)
**What goes wrong:** Source files (DOCX/PDF) can be 1–50MB each. FastAPI's default body size limit or the browser's fetch might time out.
**Why it happens:** Default FastAPI config has no hard limit but uvicorn's default max request body is 1MB (undocumented behavior with some middleware).
**How to avoid:** For initial Phase 3 implementation, defer large-file server upload (the CONTEXT.md says "Outputs NOT stored on server" — sources should still be sent). Use chunked or streaming upload if needed, but for Phase 3 scope, metadata-only server persistence (no source file bytes) is a valid initial implementation. The `project.json` is always small. Source file bytes can be a Phase 4 enhancement.
**Alternative:** Send only `project.json` in Phase 3, with a note that source file server upload is deferred. This aligns with the CONTEXT.md decision that server is a "transparent background enhancement" — even partial persistence (just metadata) is useful.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing Modal Pattern (App.jsx lines 1561-1595)
```javascript
// Reuse this exact structure for delete confirmation modal
{showSwitchConfirm && (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
    display: "flex", justifyContent: "center", alignItems: "center",
  }}>
    <div style={{
      background: "var(--bg)", borderRadius: 12, padding: 24, maxWidth: 400,
      border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>...</h3>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.5 }}>...</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={{ padding: "6px 16px", border: "1px solid var(--border)",
          borderRadius: 6, background: "var(--bg)", color: "var(--text)", cursor: "pointer" }}>
          Cancel
        </button>
        <button style={{ padding: "6px 16px", border: "1px solid #dc2626",
          borderRadius: 6, background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
          Delete
        </button>
      </div>
    </div>
  </div>
)}
```

### Existing FastAPI Endpoint Pattern (server.py)
```python
# Pattern already used for /convert — replicate for /projects/*
@app.post("/convert")
async def convert_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"...")
    try:
        contents = await file.read()
        ...
        return {"filename": safe_filename, "markdown": markdown}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"...")
```

### Existing serverApi.js Pattern (serverApi.js)
```javascript
// Reuse this fetch + error handling pattern for new project endpoints
export async function convertViaServer(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);
  const res = await fetch(`${SERVER_URL}/convert`, { method: "POST", body: formData });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Server error: ${res.status}`);
  }
  return res.json();
}
```

### renameProject in projectDb.js (new function)
```javascript
// Read-modify-write via existing putProject upsert
export async function renameProject(id, newName) {
  const record = await getProject(id);
  if (!record) return;
  await putProject({ ...record, name: newName, updatedAt: new Date().toISOString() });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `allow_methods=["GET","POST"]` in CORS | Add `"PUT"`, `"DELETE"` | Phase 3 | Required for rename/delete endpoints |
| ProjectList has no management actions | Add hover icons + inline rename + delete modal | Phase 3 | Addresses PROJ-02 and PROJ-03 |
| useProjectStore has no rename/delete | Add `renameProject`, `deleteProject`, server fire-and-forget | Phase 3 | Central persistence hook owns all persistence actions |
| server.py has only `/health` and `/convert` | Add `/projects/*` endpoints | Phase 3 | Enables filesystem-backed persistence |

---

## Open Questions

1. **Source file bytes: send to server or metadata-only?**
   - What we know: source files can be 1–50MB; server directory is `./projects/<slug>/sources/`; browser-side blobs are stored in IDB already
   - What's unclear: whether the Phase 3 plan should include sending actual file bytes to the server, or just `project.json` metadata
   - Recommendation: Phase 3 plan should send ONLY `project.json` (no source bytes). This keeps the server save call trivially small, eliminates the large-file upload concern, and still delivers meaningful persistence (metadata + settings). Source file server upload can be Phase 4. The CONTEXT.md says "durably backed on the filesystem" — project.json satisfies this for the purposes of this phase.

2. **Where does `deleteTarget` state live — ProjectList or App?**
   - What we know: delete is triggered inside `ProjectList`; `onDelete(id)` is a prop the caller provides
   - What's unclear: the modal confirmation UI — is it cleaner inside `ProjectList` or lifted to `App.jsx`?
   - Recommendation: Keep `deleteTarget` as local state in `ProjectList.jsx`. The modal JSX goes at the bottom of `ProjectList`'s return, above the `</div>`. `onDelete` prop is only called AFTER the user confirms. This avoids prop drilling the modal state.

3. **autoFocus vs useEffect for rename input focus**
   - What we know: `autoFocus` attribute works in most browsers but can be unreliable in React when the element conditionally renders
   - Recommendation: Use `autoFocus` as the primary mechanism, with a `useEffect(() => { editRef.current?.select(); }, [editingId])` as a fallback to ensure text is pre-selected.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.0 |
| Config file | vite.config.js (Vitest is configured via `test` key, or via `npx vitest run` default discovery) |
| Quick run command | `npx vitest run src/__tests__/projectDb.test.js` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-02 | `renameProject(id, newName)` updates record name + updatedAt in IDB | unit | `npx vitest run src/__tests__/projectDb.test.js` | ❌ Wave 0 |
| PROJ-02 | `renameProject(id, newName)` on nonexistent id is a no-op (no error) | unit | `npx vitest run src/__tests__/projectDb.test.js` | ❌ Wave 0 |
| PROJ-02 | `useProjectStore.renameProject` updates `projectList` in React state | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | ❌ Wave 0 |
| PROJ-03 | `deleteProject(id)` removes project AND all associated file blobs | unit | `npx vitest run src/__tests__/projectDb.test.js` | ✅ (existing test coverage for deleteProject) |
| PROJ-03 | Deleting active project resets `activeProjectId` to null | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | ❌ Wave 0 |
| SRVR (Phase 3) | `saveProjectToServer` is non-blocking — resolves even if server unreachable | unit | `npx vitest run src/__tests__/serverApi.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/projectDb.test.js src/__tests__/useProjectStore.test.js`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/projectDb.test.js` — add `renameProject` test cases (file exists, add describe block)
- [ ] `src/__tests__/useProjectStore.test.js` — add `renameProject`, `deleteProject` active-project-reset tests (file exists, add describe blocks)
- [ ] `src/__tests__/serverApi.test.js` — new file; covers `saveProjectToServer`, `renameProjectOnServer`, `deleteProjectOnServer` with mocked fetch

---

## Sources

### Primary (HIGH confidence)
- Existing codebase — `src/ProjectList.jsx`, `src/useProjectStore.js`, `src/projectDb.js`, `src/serverApi.js`, `server.py` — read directly; all patterns confirmed from live code
- `package.json` — confirmed Vitest ^4.1.0, Dexie ^4.3.0, no new deps available
- `pip show fastapi` — confirmed FastAPI 0.135.1, Pydantic 2.12.5

### Secondary (MEDIUM confidence)
- React 19 controlled input pattern — `autoFocus`, `onBlur`/`onKeyDown` for inline editing is the canonical React pattern; no library needed
- FastAPI Pydantic v2 `model_validate_json` — verified against Pydantic v2 docs convention; `.parse_raw()` is v1 deprecated

### Tertiary (LOW confidence — no verification needed; patterns are in live code)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; versions confirmed from package.json and pip
- Architecture: HIGH — all integration points confirmed from reading live code; no assumptions
- Pitfalls: HIGH — identified from direct code inspection (CORS methods list, existing modal pattern, card onClick propagation)
- Validation: HIGH — existing test files confirmed; test patterns confirmed from projectDb.test.js

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable stack; no fast-moving dependencies)
