# Doc-to-Markdown: Project Save/Load

## What This Is

A workspace persistence system for the doc-to-markdown web app that lets users save, load, and manage conversion projects. Each project captures the full state — source files, conversion settings, generated outputs, and UI state — so users can switch between multiple books (like different volumes of *Trialbook*) without re-importing files or re-configuring settings.

## Core Value

Users can switch between 5–15 book projects instantly, with full state restoration — files, settings, outputs, and UI — so they never lose work or repeat setup.

## Requirements

### Validated

- ✓ DOCX/PDF/RTF/ODT/TXT file conversion to RAG-optimized Markdown — existing
- ✓ ZIP and folder drag-and-drop import with recursive traversal — existing
- ✓ Browser-side conversion (Mammoth for DOCX, basic RTF/ODT) — existing
- ✓ Optional local FastAPI server for full-quality PDF/RTF/ODT conversion — existing
- ✓ Chapter number inference with 7 strategies and batch consensus — existing
- ✓ YAML front matter injection and post-processing pipeline — existing
- ✓ Cross-reference index generation — existing

### Validated (Phases 1–4)

- ✓ IndexedDB persistence layer with project CRUD, blob storage, and quota handling — Phase 1
- ✓ Save/load/switch projects with full state restoration (files, settings, outputs, UI) — Phase 2
- ✓ Project management UI: rename (inline edit) and delete (with confirmation modal) — Phase 3
- ✓ Server-side persistence via FastAPI `/projects/*` endpoints with fire-and-forget sync — Phase 3
- ✓ Dual-store architecture: IndexedDB primary, server directory as transparent background durability — Phase 3
- ✓ Server connectivity indicator (status dot) in header — Phase 3
- ✓ Manage 5–15 projects concurrently with clear switching UI — Phase 2
- ✓ Export projects as ZIP archives (full project or outputs-only modes) — Phase 4
- ✓ Import projects from ZIP archives with validation and auto-rename on collision — Phase 4

### Out of Scope

- Cloud storage or remote sync — local-only for now
- Collaborative editing or multi-user access — single-user tool
- Version history within a project — save is a snapshot, not a timeline
- Auto-save on every action — user-initiated saves only

## Context

The existing web app (`src/App.jsx`) uses React `useState` hooks for all state: `files`, `processing`, `results`, `serverAvailable`. There is no persistence layer — refreshing the browser loses everything. The app already handles file import (drag-drop, file picker, ZIP extraction), conversion orchestration (browser vs. server-side), and download generation.

Storage targets:
- **Directory**: `./projects/<project-name>/` inside the repo, containing `project.json` (metadata + settings + UI state), `sources/` (original files), and `outputs/` (generated markdown)
- **IndexedDB**: Mirror of directory state for instant browser loading without re-reading filesystem

The local FastAPI server (`server.py`) could be extended to handle project save/load operations for directory I/O, since the browser cannot write to the filesystem directly.

## Constraints

- **Tech stack**: Must use existing React 19 + Vite stack; no new frameworks
- **Browser limitations**: Browser cannot write to arbitrary directories — need server endpoints or File System Access API
- **File size**: Source files (DOCX/PDF) can be 1–50MB each; IndexedDB has ~50MB soft limit per origin, so large projects may need server-side storage
- **No new npm dependencies**: Prefer browser-native APIs (IndexedDB, File System Access API) over adding libraries

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Dual storage (directory + IndexedDB) | Directory for portability/sharing, IndexedDB for instant browser loading | ✓ Implemented Phase 3 |
| Server endpoints for filesystem I/O | Browser can't write to directories; extend existing FastAPI server | ✓ Implemented Phase 3 |
| User-initiated saves only | Simpler UX, avoids unexpected writes, reduces storage churn | ✓ Implemented Phase 2 |
| Project directory inside repo | Keeps everything self-contained, easy to gitignore or share | ✓ Implemented Phase 3 |

---
*Last updated: 2026-04-03 after Phase 4 completion — all v1 requirements complete*
