---
title: "feat: Expand import to support ZIP, folders, RTF, ODT, TXT, and local API for PDF"
type: feat
status: completed
date: 2026-03-15
origin: docs/brainstorms/2026-03-15-import-expansion-brainstorm.md
---

# feat: Expand Import — ZIP, Folders, New Formats, Local API

## Overview

Expand the import capabilities of both the CLI and web app through a **Unified Input Layer** that normalizes any input source (ZIP archives, dropped folders, individual files) into a flat list of convertible files. Add support for RTF, ODT, and TXT formats. Provide an optional local FastAPI server so the web app can convert PDFs (and all other formats) at CLI quality.

(see brainstorm: `docs/brainstorms/2026-03-15-import-expansion-brainstorm.md`)

## Problem Statement / Motivation

- **ZIP**: Users with many chapter files must drop them one by one — no batch import via archive
- **PDF in web app**: PDFs show a "use CLI" warning with no browser-based conversion path
- **Limited formats**: RTF, ODT, and TXT files from various word processors are unsupported
- **No folder drops**: Users can't drag a folder of chapters onto the upload zone

## Proposed Solution

### Architecture: Unified Input Layer

```
User Input (files / ZIP / folder)
        │
        ▼
┌─────────────────────┐
│   Input Resolver     │  ← Normalizes all sources to File[]
│  - ZIP extraction    │
│  - Folder traversal  │
│  - File passthrough  │
│  - OS artifact filter│
└────────┬────────────┘
         │ File[]
         ▼
┌─────────────────────┐
│  Format Router       │  ← Routes by extension to converter
│  docx│pdf│rtf│odt│txt│
└────────┬────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────┐
│Browser │ │Local API │  ← Optional, auto-detected on port 9378
│Convert │ │Server    │
│(DOCX,  │ │(PDF, RTF,│
│RTF*,   │ │ODT, DOCX,│
│ODT*,   │ │TXT)      │
│TXT)    │ └──────────┘
└────────┘
  * = JS fallback (lower quality)
```

### Local API Server (FastAPI)

- Port: **9378** (deterministic: 9377 + 1, per port hashing convention)
- Health check: `GET /health` → `{"status": "ok"}`
- Convert: `POST /convert` → multipart file upload → `{"markdown": "...", "filename": "..."}`
- CORS: Allow `localhost` on any port (local-only tool)
- Shares conversion logic with `convert.py` via a new `convert_buffer()` function
- Web app pings health endpoint on each file drop that needs the server (PDF, or RTF/ODT for best quality), caches result for 30 seconds

### Format Priority (deduplication)

When multiple formats of the same document exist: **DOCX > ODT > RTF > PDF > TXT** (ordered by structural fidelity). Extends existing DOCX-over-PDF preference.

### ZIP Extraction

- Flatten all entries, ignore folder hierarchy
- Skip: nested ZIPs, `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `.Spotlight-V100`, `.Trashes`, `__pycache__/`, `.git/`
- Duplicate filenames from different subdirs: suffix with counter (`intro.docx`, `intro-2.docx`)
- Corrupted/password-protected ZIPs: show error status on the ZIP row
- ZIP bomb protection: abort if cumulative decompressed size exceeds 500MB or entry count exceeds 1000

### Folder Drag-and-Drop

- Use `webkitGetAsEntry()` API (95%+ browser support) with recursive `readAllEntries()` loop (handles Chrome's 100-entry batch limit)
- Also add a "Select Folder" button (`<input webkitdirectory>`) for keyboard accessibility
- Collect all files from all sources (ZIP + folder + individual) into a single batch before calling `addFiles()`, so the 800ms auto-conversion debounce fires once on the complete set

### Browser-Side Format Converters

| Format | Library | Notes |
|--------|---------|-------|
| DOCX | mammoth.js (existing) | Full quality |
| RTF | rtf.js (HTML output) or officeParser v6 | Fallback quality; show amber "done (basic)" indicator |
| ODT | officeParser v6 or JSZip + DOMParser (DIY XML walk) | Fallback quality; show amber indicator |
| TXT | Native `FileReader.readAsText()` | Try UTF-8, fallback to Windows-1252 |
| PDF | Local API server only | "pdf-notice" when server unavailable |

### User Feedback Gaps to Fill

- **Skipped files notice**: When unsupported files are dropped, show dismissible toast: "3 files skipped (unsupported: .xlsx, .pptx, .jpg)"
- **Quality indicator**: Amber "done (basic)" vs green "done" for JS-fallback conversions, with tooltip explaining the difference
- **Scanning progress**: Show a brief "Scanning folder..." or "Extracting ZIP..." status during async input resolution
- **Retry button**: Add retry link on error rows to reset status to "pending"

## Technical Considerations

### Web App Changes (`src/App.jsx`)

**7 file-type filter locations that need updating:**
1. `inferChapterNum()` line 34 — extension strip regex
2. `inferCleanTitle()` line 82 — extension strip regex
3. `UploadZone` drop handler line 577 — file filter
4. Compact mode `accept` attribute line 615
5. Normal mode `accept` attribute line 663
6. `fileType` determination in `addFiles` line 1071
7. Page-level drop handler line 1245

**New extension regex**: `/\.(docx|pdf|rtf|odt|txt|zip)$/i`

**New `fileType` enum**: `"docx" | "pdf" | "rtf" | "odt" | "txt"` (ZIP is resolved before reaching this point)

**`DownloadBar` total calculation** (line 877): Currently only counts `fileType === "docx"` — must count all convertible types.

**File type icons**: Add distinct indicators for RTF (document icon), ODT (document icon), TXT (text icon) alongside existing DOCX (green book) and PDF (red book).

### CLI Changes (`convert.py`)

**`find_source_files()`** (lines 35-56):
- Add globs: `*.rtf`, `*.odt`, `*.txt`, `*.zip`
- Expand deduplication to full priority order: DOCX > ODT > RTF > PDF > TXT
- ZIP files: extract to `tempfile.TemporaryDirectory()`, scan extracted contents, add to file list

**New converter functions:**
- `convert_rtf(path)` — `pandoc -f rtf -t gfm --wrap=none`
- `convert_odt(path)` — `pandoc -f odt -t gfm --wrap=none`
- `convert_txt(path)` — Read file, wrap in basic markdown structure

**Conversion dispatch** (lines 229-234): Expand `if/elif` to include `.rtf`, `.odt`, `.txt`.

### New File: `server.py` (Local API Server)

```
server.py
├── FastAPI app with CORS middleware
├── GET /health → {"status": "ok"}
├── POST /convert → accept file, route by extension, return markdown
└── imports convert_buffer() from convert.py
```

**New function in `convert.py`:**
```python
def convert_buffer(contents: bytes, filename: str) -> str:
    """Convert file contents to markdown. Shared by CLI and API."""
    # Write to temp file, dispatch to format-specific converter,
    # run postprocessor, return markdown string
```

### New File: `src/inputResolver.js` (Web App Input Layer)

```
inputResolver.js
├── resolveInputs(dataTransferItems) → Promise<File[]>
│   ├── extractZip(file) → File[]
│   ├── traverseFolder(entry) → File[]
│   └── passthrough(file) → File[]
├── filterSupportedFiles(files) → { supported: File[], skipped: string[] }
├── deduplicateByName(files) → File[]
└── isSupportedExtension(name) → boolean
```

### Dependencies

**Python (add to `setup.sh`):**
- `fastapi`
- `uvicorn`
- `python-multipart` (for FastAPI file uploads)

**JavaScript (add to `package.json`):**
- `officeparser` (for RTF + ODT browser-side conversion) — OR `rtf.js` for RTF-only
- JSZip already installed

### Security Considerations

- **ZIP bomb protection**: Track cumulative decompressed bytes during extraction; abort at 500MB
- **Path traversal in ZIPs**: Sanitize entry names in CLI extraction (reject entries containing `..`)
- **Local API auth**: Server binds to `127.0.0.1` only (not `0.0.0.0`); no external access
- **CORS**: Allow only `localhost` origins, not wildcard `*`

## System-Wide Impact

- **Interaction graph**: Input resolution happens before the conversion pipeline — no callbacks or side effects. The existing `addFiles() → debounce → runConversion()` flow is unchanged; input resolver just produces the File[] that enters it.
- **Error propagation**: ZIP extraction errors surface as status on the ZIP "row." Individual file conversion errors continue to use existing per-file error status. Server connection errors fall back to "pdf-notice" behavior.
- **State lifecycle risks**: Temp directories in CLI could leak on crash — mitigated by `tempfile.TemporaryDirectory()` context manager. In-browser, extracted files are GC'd normally.
- **API surface parity**: Both CLI and web app gain all new formats. Web app has a quality gradient (server vs. JS fallback) while CLI always uses best-available engine.

## Acceptance Criteria

### Functional Requirements

- [x] **ZIP import (web app)**: User drops a ZIP → all DOCX/PDF/RTF/ODT/TXT files inside appear as chapter rows and auto-convert
- [x] **ZIP import (CLI)**: `convert.py` processes ZIP files in the input directory, extracting and converting contents
- [x] **Folder drop (web app)**: User drags a folder → all convertible files inside are recursively discovered and processed
- [x] **Folder select button (web app)**: "Select Folder" button works as keyboard-accessible alternative to folder drop
- [x] **RTF conversion (CLI)**: RTF files convert to markdown via Pandoc
- [x] **RTF conversion (web app)**: RTF files convert via JS fallback; higher quality via local API when available
- [x] **ODT conversion (CLI)**: ODT files convert to markdown via Pandoc
- [x] **ODT conversion (web app)**: ODT files convert via JS fallback; higher quality via local API when available
- [x] **TXT conversion (both)**: TXT files are read and wrapped in markdown with YAML front matter
- [x] **Local API server**: `python server.py` starts FastAPI on port 9378, converts any supported format
- [x] **PDF via local API**: Web app detects running server and converts PDFs through it instead of showing "pdf-notice"
- [x] **Server auto-detect**: Web app pings server on file drops needing it; caches result for 30 seconds
- [x] **Skipped files feedback**: Toast notification when unsupported files are dropped
- [x] **Quality indicator**: Amber "done (basic)" status for JS-fallback conversions with explanatory tooltip
- [x] **OS artifact filtering**: `__MACOSX`, `.DS_Store`, `Thumbs.db`, etc. silently excluded from ZIP/folder imports
- [x] **Duplicate name resolution**: Files with identical names from different ZIP subdirs get counter suffix
- [x] **Format deduplication**: When same stem exists in multiple formats, prefer DOCX > ODT > RTF > PDF > TXT
- [x] **ZIP bomb protection**: Extraction aborts if decompressed size exceeds 500MB or entry count exceeds 1000

### Non-Functional Requirements

- [x] No file size limits imposed on individual files
- [x] Server binds to `127.0.0.1` only
- [x] CORS allows only localhost origins
- [x] ZIP entry paths sanitized against path traversal
- [x] Folder scanning handles Chrome's 100-entry `readEntries()` batch limit

## Implementation Phases

### Phase 1: Foundation — Format Router + CLI Expansion

**Goal**: Extend supported formats in CLI and web app routing logic.

**Tasks:**
- [x] **Expand file-type regex** in all 7 locations in `App.jsx` to include `.rtf`, `.odt`, `.txt`, `.zip`
- [x] **Add `fileType` enum** expansion: replace binary pdf/docx check with proper routing (`docx|pdf|rtf|odt|txt`)
- [x] **Add CLI converter functions**: `convert_rtf()`, `convert_odt()`, `convert_txt()` in `convert.py`
- [x] **Expand `find_source_files()`**: Add new globs, expand deduplication priority
- [x] **Update `DownloadBar`** total calculation to count all convertible types
- [x] **Add file type icons** for RTF, ODT, TXT in `ChapterRow`
- [x] **TXT conversion** in web app (trivial: `FileReader.readAsText()` + markdown wrap; try UTF-8, fallback to Windows-1252)
- [x] **Interim RTF/ODT handling**: Show "needs-server" notice (similar to existing "pdf-notice" pattern) for RTF/ODT files until browser-side converters land in Phase 4

**Files**: `src/App.jsx`, `convert.py`

### Phase 2: ZIP Import

**Goal**: Users can drop ZIP files and have contents extracted and processed.

**Tasks:**
- [x] **Create `src/inputResolver.js`**: `resolveInputs()`, `extractZip()`, `filterSupportedFiles()`, `deduplicateByName()`
- [x] **Integrate input resolver** into `UploadZone` drop handler and `addFiles()`
- [x] **OS artifact exclusion list**: `__MACOSX`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, etc.
- [x] **Duplicate name resolution**: Counter suffix for collisions
- [x] **ZIP bomb protection**: Cumulative size + entry count limits
- [x] **Error handling**: Corrupted/password-protected ZIP shows error status
- [x] **CLI ZIP support**: Extract to `tempfile.TemporaryDirectory()`, process contents
- [x] **Skipped files toast**: Show notice when unsupported files are filtered out
- [x] **Scanning status**: Brief "Extracting ZIP..." indicator during extraction

**Files**: `src/inputResolver.js` (new), `src/App.jsx`, `convert.py`

### Phase 3: Folder Drag-and-Drop

**Goal**: Users can drag folders or use a "Select Folder" button.

**Tasks:**
- [x] **Implement `traverseFolder()`** using `webkitGetAsEntry()` with `readAllEntries()` loop (handles 100-entry batch limit)
- [x] **Integrate folder traversal** into `resolveInputs()` in `inputResolver.js`
- [x] **Add "Select Folder" button** with `<input webkitdirectory>` for keyboard accessibility
- [x] **Batch collection**: Ensure all sources (ZIP + folder + files) resolve before calling `addFiles()`, so debounce fires once
- [x] **Scanning progress**: "Scanning folder..." indicator during recursive traversal
- [x] **Defensive entry capture**: Capture `webkitGetAsEntry()` synchronously during drop event

**Files**: `src/inputResolver.js`, `src/App.jsx`

### Phase 4: Browser-Side RTF/ODT Conversion

**Goal**: RTF and ODT files convert in-browser without the local server (fallback quality).

**Tasks:**
- [x] **Evaluate and install** officeParser v6 (covers both RTF + ODT) or rtf.js + custom ODT parser
- [x] **Add `convertRtf()` function** in `App.jsx` using chosen library → HTML/AST → markdown
- [x] **Add `convertOdt()` function** in `App.jsx` using chosen library → HTML/AST → markdown
- [x] **Quality indicator**: Amber "done (basic)" status for JS-fallback conversions with tooltip
- [x] **Route conversion**: In `runConversion()`, dispatch RTF/ODT to new converters (or to local API if available); replace Phase 1's interim "needs-server" notice with actual conversion

**Files**: `src/App.jsx`, `package.json`

### Phase 5: Local API Server

**Goal**: Optional FastAPI server gives web app full CLI-quality conversion for all formats.

**Tasks:**
- [x] **Create `server.py`**: FastAPI app with `GET /health` and `POST /convert` endpoints
- [x] **Add `convert_buffer()` function** in `convert.py`: bytes + filename → markdown string (shared logic)
- [x] **CORS middleware**: Allow localhost origins, POST method only
- [x] **Server binding**: `127.0.0.1:9378` only
- [x] **File validation**: Check extension against allowlist, sanitize filename
- [x] **Error responses**: Proper HTTP status codes (400 unsupported type, 500 conversion error)
- [x] **Web app server detection**: Ping `/health` on file drops needing server, cache result 30 seconds
- [x] **PDF routing**: When server detected, send PDFs to API instead of showing "pdf-notice"
- [x] **RTF/ODT routing**: When server detected, prefer server over JS fallback for higher quality
- [x] **Update `setup.sh`**: Add `fastapi`, `uvicorn`, `python-multipart` to pip install
- [x] **Green "done" indicator**: When server converts a file, show full-quality green status

**Files**: `server.py` (new), `convert.py`, `src/App.jsx`, `setup.sh`

### Phase 6: Polish

**Goal**: Edge cases, retry, accessibility, documentation.

**Tasks:**
- [x] **Retry button** on error rows (resets status to "pending")
- [x] **Screen reader announcements** for ZIP extraction, folder scanning, server health checks
- [x] **Mixed input handling**: Verify simultaneous ZIP + folder + files in one drop event
- [x] **Google Docs workflow docs**: Add "Export as DOCX" guidance to UI or README
- [x] **Update `chapters.yaml` docs**: Document new supported extensions
- [x] **Update CLAUDE.md**: Document new server.py, inputResolver.js, and expanded format support

**Files**: `src/App.jsx`, `CLAUDE.md`, `chapters.yaml`

## Alternative Approaches Considered

(see brainstorm: `docs/brainstorms/2026-03-15-import-expansion-brainstorm.md`)

- **Bolt-on (B)**: Add features as individual `if/elif` branches without restructuring. Rejected: grows messy as formats accumulate, duplicates logic across interfaces.
- **Server-first (C)**: Make the web app a thin client that delegates all conversion to the local server. Rejected: loses standalone DOCX conversion capability, biggest scope.

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| RTF/ODT JS libraries produce unusable output | Medium | High | Evaluate library quality early (Phase 4); fall back to "requires server" if quality is too low |
| officeParser v6 bundle size too large | Low | Medium | Lazy-load via dynamic import; or use lighter alternatives per format |
| `webkitGetAsEntry()` inconsistencies across browsers | Low | Medium | Test on Chrome, Firefox, Safari; graceful degradation to file-only drops |
| FastAPI adds Python dependency complexity | Low | Low | It's optional; web app works without it for DOCX/TXT |
| ZIP bomb attack via crafted archive | Low | High | 500MB / 1000 entry limits enforced during extraction |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-15-import-expansion-brainstorm.md](docs/brainstorms/2026-03-15-import-expansion-brainstorm.md) — Key decisions carried forward: Unified Input Layer architecture, flatten ZIP structure, optional local API for PDF, browser-side JS fallback for RTF/ODT, fixed port auto-detect

### Internal References

- File type filtering locations: `src/App.jsx:34,82,577,615,663,1071,1245`
- `find_source_files()`: `convert.py:35-56`
- Conversion dispatch: `convert.py:229-234`
- PDF notice flow: `src/App.jsx:1164-1169,1362-1364`
- JSZip export usage: `src/App.jsx:462-485`
- Mammoth DOCX conversion: `src/App.jsx:489-539`
- Auto-conversion debounce: `src/App.jsx:1212-1232`

### External References

- **rtf.js** (browser RTF→HTML): github.com/tbluemel/rtf.js
- **officeParser v6** (multi-format AST parser): github.com/harshankur/officeParser
- **@sigma/striprtf** (RTF→text, tiny bundle): jsr.io/@sigma/striprtf
- **FastAPI file uploads**: fastapi.tiangolo.com/tutorial/request-files/
- **FastAPI CORS**: fastapi.tiangolo.com/tutorial/cors/
- **webkitGetAsEntry() API**: developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/webkitGetAsEntry
- **readEntries() 100-entry batch limit**: developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryReader/readEntries
