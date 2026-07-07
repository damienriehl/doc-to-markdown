# Phase 1: Storage Foundation - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a UI-agnostic persistence layer for project save/load. This phase delivers the `project.json` schema contract, a serializer module, and an IndexedDB CRUD layer using Dexie.js. No UI changes — this is pure infrastructure that Phase 2 builds on.

</domain>

<decisions>
## Implementation Decisions

### Schema shape
- Persist these App.jsx state fields: `book` (title, author), `chapters` (array with file refs, inferred chapter numbers, titles, topics, key terms), `results` (converted markdown filename + content)
- DO NOT persist transient state: `converting`, `resolving`, `dragState`, `dragOver`, `preview`, `skippedFiles`, `importErrors` — these are runtime-only
- Add lightweight `uiState` object for restoring UI position (e.g., which sections are expanded)
- Project metadata: `id` (UUID), `name` (user-chosen), `createdAt`, `updatedAt`, `version` (schema version for future migrations)
- File references in chapters array point to blob IDs in the IndexedDB `files` store — never embed File objects in JSON

### Blob storage strategy
- Store ALL source files as IndexedDB blobs regardless of size — this phase does not require the server
- Each blob gets a unique ID; chapters reference blobs by ID
- Call `navigator.storage.persist()` on first save to prevent browser eviction
- Wrap IndexedDB writes in try/catch for `QuotaExceededError` — surface clear error if storage full
- Server-side file storage is Phase 3 scope, not Phase 1

### IndexedDB library choice
- Use Dexie.js 4.3.0 — justified exception to the "no new npm deps" preference
- Rationale: native blob storage, schema migrations via version bumps, `useLiveQuery()` React hook for Phase 2, 27kB gzipped
- Schema: two object stores — `projects` (metadata JSON) and `files` (binary blobs keyed by ID)
- Include `DB_VERSION = 1` and `onversionchange` handler from day one (pitfall research: missing this causes silent hangs with two tabs)

### Claude's Discretion
- Exact UUID generation approach (crypto.randomUUID() or fallback)
- Internal module file organization within `src/`
- Error message wording for quota exceeded
- Whether to use Dexie's `Table.bulkPut()` vs individual puts for file blobs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — STOR-01 through STOR-04 requirements for this phase
- `.planning/ROADMAP.md` — Phase 1 success criteria and plan structure

### Research findings
- `.planning/research/STACK.md` — Dexie.js recommendation, IndexedDB patterns, File System Access API rejection
- `.planning/research/ARCHITECTURE.md` — Component boundaries, dual storage design, state restoration flow
- `.planning/research/PITFALLS.md` — File serialization gotcha, Safari eviction, schema migration, main-thread blocking

### Existing code
- `src/App.jsx` — Current React state shape (useState hooks at lines 1141-1148), conversion flow
- `src/serverApi.js` — Server communication pattern to replicate for project API
- `src/inputResolver.js` — ZIP/file handling patterns, JSZip usage

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/serverApi.js`: Server availability check pattern (cache + fetch + timeout) — reuse for project server endpoints in Phase 3
- `src/inputResolver.js`: File filtering logic (`isSupportedFile`, `filterSupportedFiles`) — reuse for validating files during project save
- JSZip (already installed) — reuse for project export in Phase 4

### Established Patterns
- ES Module exports with explicit `.js` extensions in imports
- camelCase file naming (`projectSerializer.js`, `projectDb.js`)
- JSDoc comments with `@param`/`@returns` for exported functions
- `const` for all variable declarations
- async/await for Promise handling
- Section separators: `// ─── Section Name ────────`

### Integration Points
- New modules (`src/projectSerializer.js`, `src/projectDb.js`) will be imported by Phase 2's `useProjectStore.js` hook
- Schema must capture the exact shape of `chapters` array entries from `App.jsx` (lines 1141-1148)
- `book` state (`{ title, author }`) and `chapters` state (array of file objects with inferred chapter data) are the primary persistence targets

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user deferred all implementation choices to best practices and research-informed defaults.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-storage-foundation*
*Context gathered: 2026-03-17*
