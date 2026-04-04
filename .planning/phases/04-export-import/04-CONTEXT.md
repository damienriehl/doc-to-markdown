# Phase 4: Export / Import - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can move projects between machines as portable ZIP archives. Two export modes (full project, outputs only) and a validated import flow that rehydrates IndexedDB and optionally syncs to the server. All ZIP operations happen browser-side using JSZip.

</domain>

<decisions>
## Implementation Decisions

### ZIP contents & modes
- **D-01:** Two export modes: "Full project" (sources + outputs + settings + project.json) and "Outputs only" (just generated Markdown files)
- **D-02:** ZIP structure mirrors server layout: `project.json` at root, `sources/` folder for originals, `outputs/` folder for Markdown. "Outputs only" mode produces a flat ZIP with just the .md files.
- **D-03:** Export is entirely browser-side using JSZip (already installed). Builds ZIP from IndexedDB blobs. No server dependency.

### Import behavior
- **D-04:** Name collisions auto-rename: append " (2)", " (3)" etc. to imported project name. User can rename afterward.
- **D-05:** Import writes to IDB first, then fires fire-and-forget server sync if server is available. Same dual-store pattern as Phase 3 save.
- **D-06:** Validate ZIP before importing: check for project.json (or at minimum .md files in outputs/). Show clear error if ZIP structure is unrecognized. No partial imports.

### Export/Import UI
- **D-07:** Export button as a hover action on each project card in ProjectList (alongside existing rename/delete icons). Import button at top or bottom of the project list.
- **D-08:** Export mode selection via small dropdown on export icon click: "Full project" / "Outputs only". Single extra click.
- **D-09:** Simple spinner on button during export/import. Toast notification on completion/error. Operations typically <2 seconds for 5-15 chapter projects.

### Claude's Discretion
- Export icon choice (download arrow, share icon, or similar)
- Import icon/button styling
- Dropdown component implementation (inline vs extracted)
- Toast notification approach (inline message vs positioned toast)
- Exact validation rules for what constitutes a "valid" import ZIP
- Whether "Outputs only" ZIP includes the 00-index.md file (likely yes)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` -- Core value, dual storage decision, constraints (no new npm deps except Dexie)
- `.planning/REQUIREMENTS.md` -- EXPT-01 (export), EXPT-02 (import) requirements
- `.planning/ROADMAP.md` -- Phase 4 success criteria and plan structure

### Prior phase context
- `.planning/phases/01-storage-foundation/01-CONTEXT.md` -- Schema shape, blob storage strategy, JSZip reuse note
- `.planning/phases/03-project-management-server-persistence/03-CONTEXT.md` -- Fire-and-forget server sync pattern, slug generation, dual-store architecture

### Existing code (must read before implementing)
- `src/projectSerializer.js` -- serialize/deserialize with blob extraction; reuse for building export data
- `src/projectDb.js` -- IndexedDB CRUD; use for reading project data for export and writing imported data
- `src/useProjectStore.js` -- Central persistence hook; add export/import methods here
- `src/ProjectList.jsx` -- Project card UI with hover actions; add export icon and import button here
- `src/serverApi.js` -- `saveProjectToServer()` for fire-and-forget sync on import
- `src/fileSaver.js` -- `saveBlob()` with File System Access API; reuse for ZIP download
- `src/inputResolver.js` -- JSZip loading pattern (`JSZip.loadAsync(buf)`)
- `src/App.jsx` -- JSZip creation pattern (lines ~465-466), `saveBlob()` usage for ZIP download

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `JSZip` (already installed): Used in `inputResolver.js` for reading ZIPs, in `App.jsx` for creating ZIPs. Both patterns directly applicable.
- `projectSerializer.serializeProject()`: Returns `{ projectRecord, blobs }` -- projectRecord is JSON-safe, blobs have `{ id, file, name }`. Perfect for building export ZIP.
- `projectSerializer.deserializeProject()`: Reconstructs in-memory state from record + blobMap. Use for import rehydration.
- `projectDb.putProject()` + `projectDb.putFiles()`: Write imported project + blobs to IDB.
- `fileSaver.saveBlob()`: Handles File System Access API with fallback to anchor-click download. Reuse for ZIP download.
- `serverApi.saveProjectToServer()`: Fire-and-forget server sync. Call after successful IDB import.

### Established Patterns
- Dynamic JSZip import: `const JSZip = (await import("jszip")).default;` (lazy-loaded, not in initial bundle)
- Hover action icons on project cards: pencil (rename) and trash (delete) already exist in `ProjectList.jsx`
- CSS variables for theming: `--bg`, `--border`, `--accent`, `--muted`, `--text`
- Inline styles throughout (no CSS modules)
- `useProjectStore` owns all persistence logic -- export/import should be added here

### Integration Points
- `ProjectList.jsx`: Add export hover icon (3rd action alongside rename/delete) + import button
- `useProjectStore.js`: Add `exportProject(projectId, mode)` and `importProject(file)` methods
- Export reads from IDB via `projectDb.getProject()` + `projectDb.getFiles()`
- Import writes to IDB via `projectDb.putProject()` + `projectDb.putFiles()`, then fire-and-forget to server

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- user selected all recommended approaches. Implementation should follow established patterns from Phases 1-3.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 04-export-import*
*Context gathered: 2026-04-03*
