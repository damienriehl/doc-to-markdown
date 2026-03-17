# Architecture

**Analysis Date:** 2026-03-17

## Pattern Overview

**Overall:** Pipeline + Optional API Pattern

This is a dual-track document conversion system:
1. **Batch CLI Pipeline** (`convert.py` → `postprocess.py` → `generate_index.py`) for server-side or local batch processing of legal textbook chapters
2. **Web UI** (`src/App.jsx`) with hybrid conversion (browser-side for basic formats, server-side for high-quality PDF/RTF/ODT via optional FastAPI server at `server.py`)

**Key Characteristics:**
- Format-agnostic input handling (ZIP, folders, drag-drop files)
- Tiered quality approach: browser-side converters for basic quality, fallback to local API server for full-quality (Pandoc/Marker)
- Configuration-driven chapter metadata via `chapters.yaml`
- Post-processing pipeline that cleans artifacts and injects RAG-optimized YAML front matter
- Cross-reference index generation for multi-chapter retrieval

## Layers

**Input Layer:**
- Purpose: Normalize diverse input sources into a flat list of convertible File objects
- Location: `src/inputResolver.js` (web) and `convert.py:find_source_files()` (CLI)
- Contains: ZIP extraction with bomb protection, folder recursive traversal, file filtering
- Depends on: File system APIs (web) / pathlib (Python)
- Used by: Web UI (`src/App.jsx`), CLI (`convert.py`)

**Format Detection & Routing Layer:**
- Purpose: Route files to appropriate converter based on extension and quality requirements
- Location: `convert.py:main()` (switch on file type), `src/App.jsx` (conversion logic)
- Contains: Format priority logic (DOCX > ODT > RTF > PDF > TXT), PDF engine selection (Marker vs PyMuPDF4LLM)
- Depends on: Each specific converter module
- Used by: CLI and web UI

**Conversion Layer:**
- Purpose: Transform documents to Markdown using language-specific tools
- Locations:
  - **DOCX/RTF/ODT** → `convert.py:convert_docx/rtf/odt()` (Pandoc subprocess)
  - **PDF** → `convert.py:convert_pdf_marker/pymupdf()` (Marker CLI or PyMuPDF4LLM)
  - **TXT** → `convert.py:convert_txt()` (encoding detection + paragraph split)
  - **Browser RTF** → `src/convertRtf.js:stripRtf()` (regex-based text extraction)
  - **Browser ODT** → `src/convertOdt.js` (JSZip + DOMParser for XML parsing)
  - **Browser DOCX** → Mammoth library (via `src/App.jsx`)
- Contains: External tool invocation, error handling and fallback logic
- Depends on: Pandoc (system), Marker (system), PyMuPDF4LLM (Python), JSZip (JS), Mammoth (JS)
- Used by: CLI and web UI

**API Server Bridge Layer:**
- Purpose: Optional local FastAPI server that provides high-quality conversion for web UI
- Location: `server.py`
- Contains: `/health` endpoint (auto-detection), `/convert` endpoint (shared conversion via `convert_buffer()`)
- Depends on: FastAPI, CORS middleware, conversion layer functions
- Used by: Web UI (`src/serverApi.js` for detection and upload)

**Post-Processing Layer:**
- Purpose: Clean conversion artifacts and inject metadata
- Location: `postprocess.py:PostProcessor` class
- Contains:
  - `clean()`: Removes stray escapes, collapses blank lines, fixes broken links, strips Word bookmark artifacts, removes `{.unnumbered}` attributes
  - `detect_and_promote_headings()`: Identifies outline-numbered text (1., I., A., etc.) and promotes to H2-H6 headings using adaptive hierarchy detection and optional DOCX numbering level extraction
  - `normalize_headings()`: Shifts H1→H2 (H1 reserved for title), removes duplicate title
  - `inject_yaml_header()`: Prepends YAML front matter with title, chapter, book metadata, topics, key_terms, converted_date
- Depends on: regex, python-docx for DOCX paragraph structure
- Used by: `convert.py` (CLI) and `server.py` (API)

**Index Generation Layer:**
- Purpose: Creates cross-reference scaffold for multi-chapter queries
- Location: `generate_index.py:generate_index()`
- Contains: Chapter overview table, chapter summaries, cross-reference mapping (`CROSS_REFERENCES` global)
- Depends on: Chapter metadata from conversion output
- Used by: `convert.py` (called after all conversions complete)

**Web UI State & Rendering Layer:**
- Purpose: React component that orchestrates file input, conversion, and download
- Location: `src/App.jsx`
- Contains:
  - File input handling (drag-drop via `resolveDataTransferItems()`, file picker)
  - Chapter number inference (`inferChapterNum()` with 7 strategies: explicit markers, parts, Roman numerals, word numbers, ordinals, leading/trailing digits)
  - Batch consensus for chapter numbering across multiple files
  - Conversion orchestration (browser vs. server-side)
  - Download link generation
- Depends on: React hooks, mammoth (DOCX), input resolver, RTF/ODT converters, server API client
- Used by: End users in browser

## Data Flow

**Batch CLI Workflow:**

1. User runs: `python convert.py --input-dir ./source --output-dir ./output`
2. `find_source_files()` scans input directory for DOCX/PDF/RTF/ODT/TXT and ZIP files
3. ZIP extraction (if any) unpacks files with bomb protection and dedup
4. Format deduplication: keeps highest-priority format per chapter (DOCX wins over PDF)
5. For each source file:
   - `get_chapter_config()` looks up metadata in `chapters.yaml` or auto-generates
   - Format-specific converter runs (Pandoc for DOCX/RTF/ODT, Marker/PyMuPDF for PDF, direct read for TXT)
   - `PostProcessor.clean()` removes artifacts
   - `extract_numbering_from_docx()` extracts DOCX numbering levels if available
   - `detect_and_promote_headings()` promotes outline text to Markdown headings (with optional DOCX level fusion)
   - `inject_yaml_header()` prepends YAML front matter
   - Output file written: `NN-slug.md` (e.g., `01-trial-preparation.md`)
6. `generate_index()` creates `00-index.md` with chapter overview and cross-references
7. User validates via `validate.py`

**Web UI Workflow:**

1. User drops files/folders or picks file
2. `resolveDataTransferItems()` or file picker normalizes to File[]
3. `resolveInputs()` extracts ZIPs, filters supported extensions
4. For each file:
   - `inferChapterNum()` applies 7 strategies to extract chapter number and confidence
   - `applyBatchConsensus()` finds dominant numbering strategy across batch
   - User sees inferred chapter number and title (editable)
5. User clicks "Convert"
6. For each file:
   - Check if server available via `isServerAvailable()` (`/health` endpoint, 30s cache)
   - If DOCX: use Mammoth (browser-side, basic quality)
   - If PDF/RTF/ODT and server available: upload to `POST /convert`, get markdown back
   - If PDF/RTF/ODT and no server: use browser converters (Marker unavailable, basic quality)
7. Download window opens, user gets `NN-slug.md` file

**State Management:**

- **CLI**: Immutable file-by-file processing, no shared state beyond configuration
- **Web UI**: React `useState` hooks for:
  - `files`: pending files to convert
  - `processing`: conversion in progress
  - `results`: converted markdown (filename + content)
  - `serverAvailable`: cached API server detection

## Key Abstractions

**PostProcessor Class (`postprocess.py`):**
- Purpose: Centralized Markdown cleaning and enhancement
- Examples: Used in both `convert.py` (line 345, 384, 394, 397) and `server.py` (line 91, 103)
- Pattern: Single responsibility — clean, detect, normalize, inject. No file I/O, pure text transformation.

**Format Priority System:**
- Purpose: Deterministic choice when multiple formats exist for same chapter
- Examples: `FORMAT_PRIORITY` dict in `convert.py` (line 35), deduplication logic (lines 54-65)
- Pattern: Numeric rank (lower = higher priority), applied during glob phase to avoid ambiguity

**Outline Pattern Detection (`postprocess.py`):**
- Purpose: Adaptive heading inference from outline-numbered text
- Examples: `_OUTLINE_PATTERNS` (line 35), `_DEFAULT_HIERARCHY` (line 47), `detect_and_promote_headings()` (line 121)
- Pattern: Multi-pass scan → hierarchy detection via interleaving evidence → level assignment. Optional DOCX numbering level fusion for accuracy.

**Chapter Inference Engine (`src/App.jsx`):**
- Purpose: Extract chapter number from filename using cascading strategies
- Examples: `inferChapterNum()` (line 37), `applyBatchConsensus()` (line 100), 7 strategies (lines 42–80)
- Pattern: Try specific patterns first (explicit chapter markers), fall back to heuristics (leading digits, ordinals), apply batch voting to find dominant strategy

**Input Resolver (`src/inputResolver.js`):**
- Purpose: Unified input normalization with bomb protection
- Examples: `extractZip()` (line 55), `resolveDataTransferItems()` (line 175), `resolveInputs()` (line 202)
- Pattern: Separate concerns — ZIP extraction with security checks, folder traversal with pagination, file filtering. All return File[].

**Server API Client (`src/serverApi.js`):**
- Purpose: Auto-detection and routing to optional local API
- Examples: `isServerAvailable()` (line 18, caches 30s), `convertViaServer()` (line 50)
- Pattern: Lazy health check, cache to avoid thrashing network, FormData for multipart upload

## Entry Points

**CLI Entry Point:**
- Location: `convert.py:main()`
- Triggers: `python convert.py --input-dir ./source --output-dir ./output [options]`
- Responsibilities: Parse arguments, load config, discover files, coordinate conversion pipeline, generate index

**API Server Entry Point:**
- Location: `server.py:main()`
- Triggers: `python server.py [--port 9378]` or `uvicorn server:app --port 9378`
- Responsibilities: Create FastAPI app, configure CORS for localhost, expose `/health` and `/convert` endpoints

**Web App Entry Point:**
- Location: `src/main.jsx` → `src/App.jsx`
- Triggers: Browser loads `index.html`, Vite/React bootstraps `App` component
- Responsibilities: Render file input UI, orchestrate conversion state, handle server detection, generate downloads

## Error Handling

**Strategy:** Graceful degradation with user-visible warnings

**Patterns:**

**CLI Errors (convert.py):**
- File not found: Print warning, continue with other files (line 42–43)
- Pandoc not installed: Error message, exit with code 1 (line 162–164)
- Pandoc timeout (120s): Error message, skip file (line 165–167)
- ZIP bomb: Warning, skip ZIP (line 83–87)
- ZIP extraction error: Warning, return empty list (line 122–124)
- Conversion failure: Print "FAILED", skip post-processing (line 378–380)
- DOCX numbering extraction: Try/except, continue without levels (line 390–392)

**Server Errors (server.py):**
- Unsupported file type: HTTP 400 with detail message (line 126–129)
- Conversion error in buffer: HTTP 500 (line 140–141)
- CORS violation: Middleware allows localhost only (line 33–43)

**Web UI Errors (src/):**
- ZIP extraction error: Catch block, add to errors array, show to user (inputResolver.js line 215–216)
- Unsupported file: Add to skipped names (inputResolver.js line 221)
- Server unavailable: Fall back to browser converters (App.jsx, via `isServerAvailable()`)
- Server timeout: 2s abort timeout on health check (serverApi.js line 26)

## Cross-Cutting Concerns

**Logging:**
- CLI: `print()` statements with prefixes ("INFO:", "WARNING:", "ERROR:")
- API: FastAPI automatic logging via Starlette/Uvicorn
- Web: Browser console (via `console.log` if needed, not currently used)

**Validation:**
- **File extensions**: Checked against `SUPPORTED_EXTENSIONS` / `FORMAT_PRIORITY` keys in both CLI and web
- **ZIP safety**: Bomb protection checks (size < 500MB, entries < 1000) in both CLI (`_extract_zip()`) and web (`extractZip()`)
- **Path traversal**: Check for ".." in ZIP paths (line 105)
- **Filename sanitization**: Web API sanitizes to `\w.\-` (line 132)

**Security:**
- **CORS**: API server restricts to localhost only (`http://localhost:*`, `127.0.0.1:*` regex)
- **No credential storage**: `.env` files not read/stored in code (secrets managed externally)
- **Safe temp files**: Server uses `tempfile.NamedTemporaryFile()` with automatic cleanup (line 109–111)

**Configuration:**
- **chapters.yaml**: Centralized chapter metadata, read once at startup
- **Format priority**: Hardcoded constant, deterministic
- **API port**: Default 9378, configurable via `--port` flag

---

*Architecture analysis: 2026-03-17*
