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

### Active

- [ ] Save project to directory (./projects/<name>/) with source files, settings, outputs, and UI state
- [ ] Load project from directory, restoring full workspace state including source files
- [ ] Browser cache (IndexedDB) for instant loading alongside directory persistence
- [ ] Project management UI: list, rename, delete saved projects
- [ ] Export/import projects as portable archives for sharing
- [ ] Manage 5–15 projects concurrently with clear switching UI

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
| Dual storage (directory + IndexedDB) | Directory for portability/sharing, IndexedDB for instant browser loading | — Pending |
| Server endpoints for filesystem I/O | Browser can't write to directories; extend existing FastAPI server | — Pending |
| User-initiated saves only | Simpler UX, avoids unexpected writes, reduces storage churn | — Pending |
| Project directory inside repo | Keeps everything self-contained, easy to gitignore or share | — Pending |

---
*Last updated: 2026-03-17 after initialization*
