# Phase 3: Project Management + Server Persistence - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can manage their project library (rename, delete) and projects are durably backed on the filesystem when the local FastAPI server is running. IndexedDB remains the primary store; server persistence is a transparent background enhancement that never blocks the UI save path.

</domain>

<decisions>
## Implementation Decisions

### Rename/delete UX
- Hover icon buttons (pencil, trash) appear on the right side of each project card on hover — minimal visual noise when not interacting
- Rename uses inline text editing directly on the card — name becomes an editable input field, Enter/blur to save, Escape to cancel, text pre-selected
- Rename and delete actions are available only in the expanded ProjectList, not in the header save area
- Header save input remains unchanged — only for naming when saving

### Delete behavior
- Custom styled modal for delete confirmation (consistent with existing unsaved-changes guard)
- Modal shows project name, file count, and "This cannot be undone" warning
- Delete button styled in red/danger color, Cancel as default
- Deleting the active project resets workspace to blank state (same as newProject())
- Delete removes from both IndexedDB AND server directory (if server available) — server failure is non-blocking

### Dual-store save flow
- IDB first, server fire-and-forget: save to IndexedDB immediately, show "Saved", then fire background server save
- Server save failure: console.warn only — user sees "Saved" because IDB succeeded
- Server directory structure: `./projects/<slug>/project.json` + `./projects/<slug>/sources/` with original files
- Directory name derived from slugified project name (lowercase, spaces to hyphens, strip special chars)
- Slug collision for different project IDs handled with -2, -3 suffix
- Outputs NOT stored on server — they can be regenerated from sources
- Rename also renames the server directory (fire-and-forget, non-blocking)

### Server status UX
- Small colored dot near the save area: green = server connected, gray = offline
- Tooltip on hover explains status ("Server connected — projects backed to disk" / "Server offline — saving to browser only")
- Server save failure is silent to the user (console.warn only) — IDB save already succeeded
- Reuse existing 30-second serverApi.js availability cache — no new polling or timers
- Dot updates naturally whenever cache refreshes (on save, on convert, or after 30s expiry)

### Claude's Discretion
- Exact icon choices for pencil/trash (SVG inline or unicode)
- Modal component structure (inline in ProjectList or extracted)
- Server endpoint naming and REST conventions
- Slug generation algorithm details
- How to structure the fire-and-forget server save (Promise.catch vs try/catch)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — Core value, dual storage decision, constraints (no new npm deps except Dexie)
- `.planning/REQUIREMENTS.md` — PROJ-02 (rename), PROJ-03 (delete with confirmation) requirements
- `.planning/ROADMAP.md` — Phase 3 success criteria and plan structure

### Prior phase context
- `.planning/phases/01-storage-foundation/01-CONTEXT.md` — Schema shape, blob storage strategy, Dexie.js choice, serverApi.js reuse pattern

### Existing code (must read before implementing)
- `src/ProjectList.jsx` — Current project card UI (no management actions yet — add hover icons here)
- `src/useProjectStore.js` — Central persistence hook (add rename/delete/serverSave methods here)
- `src/projectDb.js` — IndexedDB CRUD layer (already has deleteProject(); add renameProject())
- `src/serverApi.js` — Server availability check pattern (reuse for project endpoints)
- `server.py` — FastAPI server (add /projects/* REST endpoints here)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `projectDb.deleteProject()`: Already implements transactional delete of project + file blobs from IDB — wire into UI
- `projectDb.putProject()`: Handles project record upserts — rename is a read-modify-write through this
- `serverApi.isServerAvailable()`: Cached availability check with 30s TTL — reuse for server save gating and status dot
- `serverApi.clearServerCache()`: Available if manual recheck needed
- Existing unsaved-changes modal pattern in `App.jsx` — reuse structure for delete confirmation modal

### Established Patterns
- `useProjectStore.js` owns all persistence logic — rename/delete/serverSave should be added here as new callbacks
- Fire-and-forget pattern: `save()` already does async IDB work; server save can be appended as a non-awaited promise chain
- CSS uses CSS variables (`--bg`, `--border`, `--accent`, `--muted`, `--text`) — hover icons and modal should use these
- Inline styles throughout (no CSS modules or styled-components)

### Integration Points
- `ProjectList.jsx` receives props from `App.jsx` via `useProjectStore` — add `onRename` and `onDelete` props
- `server.py` needs new routes: POST /projects/<slug>, PUT /projects/<slug>/rename, DELETE /projects/<slug>
- `serverApi.js` needs new functions: `saveProjectToServer()`, `renameProjectOnServer()`, `deleteProjectOnServer()`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for all implementation details.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-project-management-server-persistence*
*Context gathered: 2026-03-17*
