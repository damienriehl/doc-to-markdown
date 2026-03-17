# Feature Research

**Domain:** Browser-based document workspace with project save/load/manage
**Researched:** 2026-03-17
**Confidence:** HIGH (patterns confirmed via Figma, Overleaf, VS Code, Excalidraw, MDN/web.dev, Cloudscape Design System official sources)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Named project save | Every tool from Figma to VS Code associates a workspace with a human-readable name; anonymous state is unacceptable | LOW | Name captured at first save or via prompt; stored in `project.json` |
| Load / open project | If you can save, you must be able to reopen; one without the other is useless | LOW | List stored projects, user picks one, full state restores |
| Full state restoration | Users expect their exact workspace back: file list, conversion results, settings, UI layout — not just a partial restore | MEDIUM | State shape in `project.json` must cover `files` refs, `results`, server preference |
| Project list / management screen | Users with 5–15 projects need a home screen to see all of them, not just the last one opened | MEDIUM | Card or list layout; shows name, last-modified date, file count |
| Rename project | Naming mistakes happen; rename is expected at any time — Figma, Overleaf, VS Code all support it | LOW | Inline edit on project card (double-click or pencil icon); Enter confirms, Escape cancels |
| Delete project with confirmation | Stale projects accumulate; deletion is expected but must require explicit confirmation dialog — universally enforced across Figma, Overleaf, Jira, Azure DevOps | LOW | Modal: "Delete [name]? This cannot be undone." — hard delete for v1; soft delete (trash) is a v2 consideration |
| Unsaved-changes warning | Navigating away or switching projects without saving triggers a "you have unsaved changes" guard; Cloudscape Design System defines this as critical for preventing data-loss trust failures | LOW | `beforeunload` event + in-app modal when switching projects; modal text: "Are you sure you want to leave? Changes won't be saved." |
| Visual save-state indicator | Users need to know whether current state is saved; VS Code uses dot on tab, Figma shows "Saved" in toolbar, GitHub uses a blue dot | LOW | Status badge in header: "Unsaved" / "Saving..." / "Saved"; only show warning when dirty state is true (unnecessary friction otherwise) |
| Last-opened restoration | On page reload or revisit, the last-opened project reloads automatically — a blank slate is disorienting | LOW | Store `lastProjectId` in `localStorage`; rehydrate on mount |
| Project list sorted by last modified | Default sort by recency so most recent work is always at top; Overleaf and Figma both default to this | LOW | Secondary sort option: alphabetical by name |

### Differentiators (Competitive Advantage)

Features that set this tool apart. Not required by convention, but add meaningful value for a local-first, multi-book workflow.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Export project as ZIP archive | Portability that SaaS tools can't offer — send your full project (source files + outputs + settings) to a colleague or back it up externally; Overleaf pioneered this for local-first LaTeX tools | MEDIUM | Zip sources/ + outputs/ + project.json; FastAPI can stream a `zipfile` response, or browser can use JSZip (already a dependency) for IndexedDB-only projects |
| Import project from ZIP archive | Companion to export; enables project sharing and migration between machines; Overleaf and Figma both support this | MEDIUM | Extract in-browser (JSZip already available), re-populate IndexedDB and optionally write to server directory; reuse existing `inputResolver.js` ZIP logic |
| Dual storage (IndexedDB + server directory) | IndexedDB provides instant browser load; server directory provides portable filesystem files outside the browser — most local-first tools pick one, not both | HIGH | Store file metadata + markdown outputs in IndexedDB for fast load; store source blobs server-side for large files; reconcile on load via server availability check |
| Project cards with metadata preview | Quick contextual identification — last-modified date, file count, output count, last conversion engine — so users pick the right project without opening it; analogous to Figma file cards | LOW | All metadata stored in `project.json` at save time; zero extra computation at list render time |
| Archive / hide projects | Keep completed or paused projects out of the active list without deleting them; Overleaf, Jira, and ClickUp all support archive as a distinct state from delete | LOW | Boolean `archived` flag in `project.json`; "Show archived" toggle on project list; no data deletion; reversible |
| Duplicate project | Copy a project as a starting point for a new book volume or a variation; Figma and Overleaf both support this | MEDIUM | Deep copy of `project.json` with new name + timestamp; source file blobs must be copied in IndexedDB or server-side |
| File System Access API for directory binding | Users can bind a project to an arbitrary directory on disk — enabling integration with git repos or existing folder structures; optional Chrome/Edge-only enhancement | HIGH | `showDirectoryPicker()` requires secure context + user gesture; `FileSystemDirectoryHandle` serialized to IndexedDB for re-use; permission must be re-requested each session; Chrome 122+ supports "persistent permissions" opt-in; Firefox has no support — degrade gracefully to server path |
| Project metadata (description, tags) | Makes 15-project libraries manageable; useful once a user's collection stabilizes | LOW | Optional fields in project creation/edit flow; tags enable filter; adds no complexity to core storage |
| Keyboard shortcut for project switcher | Power-user feature for switching books without reaching for the mouse; VS Code (`Ctrl+R`), IntelliJ, Sublime all support quick-switch | MEDIUM | `Cmd/Ctrl+Shift+P` or dedicated shortcut opens fuzzy-search project picker overlay |

### Anti-Features (Commonly Requested, Often Problematic)

Features that surface as reasonable asks but create real problems in this specific context.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-save on every action | Feels modern; Google Docs and Notion do it | Source files (DOCX/PDF) are large (1–50MB); constant IndexedDB writes on every React state change cause quota pressure and perceived sluggishness; auto-save to directory requires constant FastAPI round-trips; risk of partial-state corruption if write overlaps a user action | User-initiated save with clear visual state indicator; `Cmd+S` shortcut makes manual save frictionless; optionally auto-save metadata-only (not blobs) on a 30-second debounce as a v2 enhancement |
| Version history within a project | "Undo across sessions" feels valuable | Full version history multiplies storage N×: 10MB projects × 20 versions = 200MB per project; IndexedDB quota pressure becomes real; complexity is disproportionate to value for a single-user local tool; PROJECT.md explicitly excludes this | Single snapshot save; document "export ZIP before overwriting" as the manual versioning workflow |
| Cloud sync / remote storage | "Access from any machine" | Explicitly out of scope (PROJECT.md); introduces auth, backend, CORS, and privacy/legal surface for legal content (Trialbook); fundamentally changes architecture | ZIP export is the portability story; note in UI that projects are local-only |
| Real-time collaboration | Google Docs/Notion pattern | Single-user tool (PROJECT.md); adding CRDTs or OT, WebSockets, and conflict resolution adds months of work with near-zero user benefit | ZIP export/import for handoff to a colleague |
| Project templates | "Reduce setup time for new books" | Premature — this tool has one primary use case; templates add UI complexity before the base workflow is validated | Let `chapters.yaml` configuration serve as the "template"; document how to duplicate an existing project |
| Nested project folders / subfolders | Power-user request by analogy to Figma | Figma explicitly does NOT support subfolders in projects (confirmed in their docs); nesting creates navigation complexity that overwhelms the benefit for 5–15 projects | Tags/metadata for organization; archive for old ones |
| Trash / soft-delete with restore period | "I accidentally deleted a project" | Full trash lifecycle (move → 30-day hold → permanent delete) adds state management and storage overhead; for 5–15 projects, accidental deletion is rare and recoverable via ZIP import | Hard delete with "Undo" toast (30-second window) for v1; revisit soft delete if user research shows accidental deletions are a real problem |
| Drag-to-reorder project list | Feels polished | Saves no time for 5–15 projects; ordering preference is quickly forgotten; custom ordering must be persisted separately | Sort controls (name A–Z, last modified) cover the actual need |

---

## Feature Dependencies

```
[Named project save]
    └──requires──> [project.json schema] ──requires──> [state shape definition]
    └──requires──> [IndexedDB store setup]

[Load / open project]
    └──requires──> [Named project save]
    └──requires──> [Full state restoration]

[Project list / management screen]
    └──requires──> [Named project save]
    └──enhances──> [Project cards with metadata preview]
    └──enhances──> [Archive / hide projects]
    └──enhances──> [Project metadata (description, tags)]

[Delete project]
    └──requires──> [Project list / management screen]
    └──requires──> [Unsaved-changes warning] (to guard current project)

[Rename project]
    └──requires──> [Named project save]

[Archive / hide projects]
    └──requires──> [Project list / management screen]
    └──conflicts──> [Project metadata (description, tags)] (two parallel organizational schemes; build one before adding the other)

[Export project as ZIP]
    └──requires──> [Named project save] (project must exist before export)
    └──enhances──> [Import project from ZIP]

[Import project from ZIP]
    └──requires──> [Named project save] (to store imported project under a name)
    └──requires──> [IndexedDB store setup]
    └──reuses──> [inputResolver.js ZIP extraction]

[Duplicate project]
    └──requires──> [Named project save]
    └──requires──> [IndexedDB store setup] (blobs must be copied)

[File System Access API directory binding]
    └──enhances──> [Dual storage]
    └──conflicts──> [Auto-save on every action] (permission re-request per session prevents seamless auto-save)

[Last-opened restoration]
    └──requires──> [Named project save]
    └──requires──> [IndexedDB store setup]

[Unsaved-changes warning]
    └──requires──> [Visual save-state indicator] (both track same dirty flag)
```

### Dependency Notes

- **Full state restoration requires a stable state schema.** The `project.json` format must be defined before any save/load code ships. Changing it post-ship forces a migration strategy.
- **IndexedDB store setup is foundational.** Every other persistence feature depends on it. Must land in Phase 1.
- **Export ZIP does not require the server directory path.** It can work from IndexedDB alone if file blobs are stored there; server directory is an enhancement, not a prerequisite for export.
- **File System Access API conflicts with seamless workflows.** Browsers require a user gesture to re-grant directory permissions each session (unless the user opts into persistent permissions in Chrome 122+). The FastAPI server-side directory approach is simpler for the `./projects/` use case.
- **Visual save-state indicator is a prerequisite for unsaved-changes warning.** Both track the same `isDirty` React state flag.
- **Archive conflicts with Tags as parallel organizational schemes.** Build one before introducing the other to avoid a confused UI with two ways to hide/organize projects.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what validates the core concept (switching between book projects without re-importing files).

- [ ] **IndexedDB project store** — foundational; all other features depend on it
- [ ] **Named project save** — capture name + serialize current state + write to IndexedDB
- [ ] **Load / open project** — read from IndexedDB, rehydrate React state (files, results, settings)
- [ ] **Project list screen** — minimal list with name + last-saved date + file count; entry point to load/rename/delete
- [ ] **Rename project** — inline edit; low cost, high trust value; prevents user frustration immediately
- [ ] **Delete project with confirmation** — housekeeping without data loss risk
- [ ] **Last-opened restoration on page load** — so a reload doesn't feel like losing work
- [ ] **Visual save-state indicator** — "Unsaved / Saved" badge in header
- [ ] **Unsaved-changes warning** — modal when switching projects or reloading with unsaved state

### Add After Validation (v1.x)

Features to add once core save/load is working and users are actively managing 3+ projects.

- [ ] **Export project as ZIP** — add once users demonstrate they want portability; depends on stable `project.json` schema
- [ ] **Import project from ZIP** — companion to export; validates portability across machines
- [ ] **Project cards with metadata preview** — quality-of-life for users managing 8–15 projects; file count + last-modified + output count on the card
- [ ] **Archive / hide projects** — add when active list gets cluttered (user signal: >8 projects, user asks to "hide" completed ones)
- [ ] **Server directory persistence** — extend FastAPI to write `./projects/<name>/` for filesystem portability; enhancement on top of IndexedDB-only v1
- [ ] **Duplicate project** — triggered when users report creating the same setup repeatedly

### Future Consideration (v2+)

Defer until core workflow is validated.

- [ ] **File System Access API directory binding** — complex permission model; defer until users express need to bind projects to arbitrary on-disk directories
- [ ] **Keyboard shortcut for project switcher** — power-user polish; defer until base workflow is stable
- [ ] **Project metadata (description, tags)** — useful at scale; premature for current 5–15 project target
- [ ] **Soft delete / trash with restore period** — revisit only if user research surfaces accidental deletions as a real problem

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| IndexedDB store setup | HIGH | LOW | P1 |
| Named project save | HIGH | LOW | P1 |
| Load / open project | HIGH | LOW | P1 |
| Full state restoration | HIGH | MEDIUM | P1 |
| Project list / management screen | HIGH | MEDIUM | P1 |
| Last-opened restoration | HIGH | LOW | P1 |
| Visual save-state indicator | HIGH | LOW | P1 |
| Unsaved-changes warning | HIGH | LOW | P1 |
| Rename project | MEDIUM | LOW | P1 |
| Delete project with confirmation | MEDIUM | LOW | P1 |
| Export project as ZIP | MEDIUM | MEDIUM | P2 |
| Import project from ZIP | MEDIUM | MEDIUM | P2 |
| Project cards with metadata preview | MEDIUM | LOW | P2 |
| Archive / hide projects | MEDIUM | LOW | P2 |
| Server directory persistence (`./projects/`) | MEDIUM | MEDIUM | P2 |
| Duplicate project | LOW | MEDIUM | P2 |
| File System Access API directory binding | LOW | HIGH | P3 |
| Keyboard shortcut for project switcher | LOW | MEDIUM | P3 |
| Project metadata (description, tags) | LOW | LOW | P3 |
| Soft delete / trash | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — without these the feature doesn't exist
- P2: Should have — adds real value, add in first iteration after v1 validates
- P3: Nice to have — future consideration once core is stable

---

## Competitor Feature Analysis

| Feature | Figma | Overleaf | VS Code web | Excalidraw | Our Approach |
|---------|-------|----------|-------------|------------|--------------|
| Named project save | Yes — explicit "Save" in cloud + named files | Yes — user-named projects | Yes — workspace `.code-workspace` files | Yes — explicit save or autosave to localStorage | User-initiated named save to IndexedDB |
| Project list | Yes — sidebar with teams/projects/files | Yes — flat list sorted by last-modified | Yes — recent workspaces in welcome tab | No — single active file model | Dedicated project management screen |
| Full state restoration | Yes — files open, layout, zoom | Yes — files open, compile settings | Yes — open editors, panels, settings | Yes — canvas state from localStorage | React state hydration: files, results, server pref, UI state |
| Rename | Yes — rename file in project | Yes — rename from dashboard | Yes — rename workspace | No | Inline double-click in project list |
| Delete | Yes — soft-delete to trash | Yes — delete with confirmation | Yes — remove from recents | No | Hard delete with confirmation modal; "Undo" toast for 30 seconds |
| Archive | No native archive | Yes — archive to separate section | No | No | Boolean flag + "Show archived" toggle |
| Duplicate / copy | Yes — right-click on file card | Yes — "Copy project" from menu | No | No | Context menu or button in project card |
| Export as archive | Yes — export .fig | Yes — download as ZIP | Yes — export workspace config | Yes — export .excalidraw JSON | ZIP: project.json + sources/ + outputs/ |
| Import from archive | Yes — import .fig | Yes — upload ZIP | Yes — open workspace file | Yes — drag .excalidraw file | ZIP import rehydrating IndexedDB |
| Auto-save | Yes — cloud continuous | Yes — cloud continuous | Partial — file auto-save optional | Yes — localStorage autosave | Explicitly NOT auto-save; manual with Cmd+S |
| Version history | Yes — cloud version history (paid) | Yes — via Overleaf Pro / git | Partial — git history | No | Explicitly NOT in scope |
| Unsaved-changes warning | Yes — "Unsaved changes" modal | N/A (auto-save) | Yes — dot on dirty tabs | Yes — "save?" prompt | Modal guard on project switch + beforeunload |
| Project card metadata | Thumbnail, last-modified, owner, collaborators | Name, date, tags, collaborators | N/A | N/A | Name, last-modified, file count, output count |
| Directory binding | No | No | Yes — workspace folders | No | v3 consideration via File System Access API |

---

## Storage Architecture Notes

These notes inform implementation decisions and phase ordering.

**IndexedDB limits (2025 confirmed via MDN):**
- Chrome: up to 60% of available disk (gigabytes in practice on typical developer machines)
- Firefox: up to 10% of disk or 10GB, whichever is smaller — tighter constraint
- Safari iOS: ~50MB quota historically, though behavior varies — significant constraint if targeting mobile
- Blobs supported natively — source files (DOCX/PDF up to 50MB) can be stored as raw Blobs without base64 encoding

**Practical guidance for this project:**
- Store markdown output text + project metadata in IndexedDB (small, fast, always available offline)
- For large source files (20–50MB PDFs), prefer server-side storage in `./projects/<name>/sources/`
- This sidesteps quota limits entirely: IndexedDB becomes a fast-loading metadata + output cache, not a file archive
- Wrap all IndexedDB writes in `try/catch` for `QuotaExceededError`; surface a clear user message with recovery options
- Call `navigator.storage.persist()` on first project save to prevent eviction
- Call `navigator.storage.estimate()` before large writes; warn user when headroom is < 200MB

**File System Access API realities (confirmed via Chrome Developers blog):**
- `showDirectoryPicker({ mode: 'readwrite' })` gives read/write access to a user-chosen directory
- `FileSystemDirectoryHandle` can be serialized to IndexedDB for re-use across sessions
- Permission is NOT automatically re-granted on next session — user must re-authorize
- Chrome 122+ supports "persistent permissions" where users can opt into indefinite access
- Firefox has no support and has labeled the API "harmful" in their standards position
- Safari has no support as of 2025
- Global support: approximately 33% (Chromium-only)
- Conclusion: Server-side FastAPI path is simpler and more broadly supported for `./projects/` use case; File System Access API is an optional Chromium enhancement only

---

## Sources

- [Guide to files and projects — Figma Learn](https://help.figma.com/hc/en-us/articles/1500005554982-Guide-to-files-and-projects) — HIGH confidence, official docs
- [Move, rename, or delete projects — Figma Learn](https://help.figma.com/hc/en-us/articles/360038511833-Move-rename-or-delete-projects) — HIGH confidence, official docs
- [Managing projects and files — Overleaf Docs](https://docs.overleaf.com/managing-projects-and-files/managing-projects-and-files) — HIGH confidence, official docs
- [Copying a project — Overleaf Learn](https://www.overleaf.com/learn/how-to/Copying_a_project) — HIGH confidence, official docs
- [Using tags to organize Overleaf projects](https://www.overleaf.com/learn/how-to/Using_tags_to_organize_your_Overleaf_projects) — HIGH confidence, official docs
- [File System Access API: simplifying access to local files — Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) — HIGH confidence, official Chrome docs
- [Persistent permissions for the File System Access API — Chrome Developers blog](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api) — HIGH confidence, official; Chrome 122+ only
- [File System Access API: storing FileHandles in IndexedDB — xjavascript.com](https://www.xjavascript.com/blog/file-system-access-api-is-it-possible-to-store-the-filehandle-of-a-saved-or-loaded-file-for-later-use/) — MEDIUM confidence, community; cross-checked with Chrome docs
- [Communicating unsaved changes — Cloudscape Design System (AWS)](https://cloudscape.design/patterns/general/unsaved-changes/) — HIGH confidence, AWS design system; defines modal text, trigger conditions, and dirty-state tracking
- [Storage quotas and eviction criteria — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — HIGH confidence, official MDN
- [Trash and restore a project — Jira Service Management (Atlassian)](https://support.atlassian.com/jira-service-management-cloud/docs/trash-and-restore-a-project/) — MEDIUM confidence, Atlassian official; used as pattern reference for delete/archive UX only
- [UX tip: How to design destructive actions — Indie Hackers](https://www.indiehackers.com/post/ux-tip-how-to-design-destructive-actions-e-g-delete-turn-off-74d17fdc28) — LOW confidence, community post; aligns with Cloudscape and NNg guidance

---

*Feature research for: browser-based document workspace with project save/load/manage*
*Researched: 2026-03-17*
