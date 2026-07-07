# Codebase Concerns

**Analysis Date:** 2026-03-17

## Tech Debt

**Bare Exception Handling in server.py:**
- Issue: `except Exception:` on line 100 silently swallows all errors from `extract_numbering_from_docx()` without logging
- Files: `server.py` (line 100)
- Impact: Silent failures in heading level detection for DOCX files uploaded via API; users won't know conversion lost structural metadata
- Fix approach: Log the exception to stderr or return a warning in the API response. At minimum, add `logging.warning()` or print to stderr.

**Blind Fallback in PDF Conversion:**
- Issue: `convert_pdf_marker()` falls through to PyMuPDF4LLM if Marker fails, but both failures are only reported as "Falling back..." warnings
- Files: `convert.py` (lines 170-195, 281-292)
- Impact: If both PDF engines fail silently, the user sees a converted file but it's corrupt or incomplete. No clear error message distinguishes between "Marker not installed" vs "PDF is genuinely broken"
- Fix approach: Return a distinct status code or mark file with a quality warning in YAML front matter (e.g., `pdf_quality: degraded`). Validate output size is non-trivial.

**Bare Exception in Heading Detection:**
- Issue: `except Exception as e: pass` in `server.py:100` silently loses critical conversion metadata
- Files: `server.py` (lines 94-101)
- Impact: DOCX files sent via API for conversion lose heading level information; body headings won't be properly promoted
- Fix approach: At least log the exception. Better: return heading extraction warnings to client.

## Known Bugs

**ZIP Bomb Detection Incomplete:**
- Symptoms: Browser-side ZIP extraction checks decompressed size (`MAX_ZIP_SIZE = 500MB`), but logic inspects `entry._data.uncompressedSize` which is JSZip-internal and not guaranteed to exist for all entry types
- Files: `src/inputResolver.js` (lines 68-75)
- Trigger: Upload a crafted ZIP with compression-ratio entries where `_data` is undefined or missing
- Workaround: The check mostly works because JSZip populates `_data` for normal archives; high-entropy/already-compressed files are skipped naturally
- Risk: Low, but defensive code should not rely on undocumented internal properties

**Roman Numeral Validation Inconsistency:**
- Symptoms: Python version validates up to 200 (`_is_valid_roman` in `postprocess.py`), JavaScript version does the same, but validation rejects valid large numbers like MMM (3000)
- Files: `postprocess.py` (lines 17-32), `src/App.jsx` (lines 20-34)
- Trigger: Outline with Roman numerals beyond CC (200)
- Workaround: None; outlines will be missed if they use numerals >200
- Impact: Low; rare in legal documents, but edge cases in historical texts could break

**Regex Pattern in `postprocess.py` Line 42 is Incomplete:**
- Symptoms: Pattern `r"^([a-z][.)])` has mismatched brackets—should be `[.)]` but regex may not match intended sequences
- Files: `postprocess.py` (line 42)
- Trigger: Outline starting with lowercase letter followed by period or paren (e.g., "a. Item")
- Impact: Low; pattern rarely matches because of bracket mismatch, so lowercase outlines are skipped (but rarely used in legal documents)
- Fix approach: Change to `r"^([a-z][.)])(.+)$"` with proper bracket escaping if needed

**Server Cache Never Expires on Network Errors:**
- Symptoms: Once `isServerAvailable()` caches `false` due to timeout, the 30-second cache prevents retries if user restarts the server
- Files: `src/serverApi.js` (lines 11-35)
- Trigger: Start web app, server is down (cached false), start `python server.py`, web app still thinks server is unavailable for 30 seconds
- Workaround: Call `clearServerCache()` manually (not exposed in UI), or wait 30 seconds, or refresh page
- Impact: Medium; confuses users who start the server after the web app

**Missing YAML Front Matter Breaks RAG Upload:**
- Symptoms: If a conversion fails partway through YAML injection, output file is invalid (no front matter)
- Files: `convert.py` (lines 383-398), `server.py` (lines 88-105)
- Trigger: Out-of-memory or permission error after post-processing but before YAML write
- Impact: Medium; file is silently created but unusable for RAG platforms
- Fix approach: Write YAML before content, or use a temp file and atomic rename

## Security Considerations

**Path Traversal via ZIP Entries:**
- Risk: ZIP extraction checks `".." in info.filename` (Python) and handles path splitting, but both could be bypassed with unusual path separators or Unicode tricks
- Files: `convert.py` (lines 104-106), `src/inputResolver.js` (lines 80-88)
- Current mitigation: Hardcoded temp directories, filename sanitization; client-side ZIP is extracted to browser memory, not disk
- Recommendations: Python should use `os.path.normpath()` and check against `temp_dir` prefix explicitly. Client-side is safer (memory only).

**Server CORS Configuration Too Permissive:**
- Risk: `allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"` allows all ports on localhost; if user's machine is compromised, any process on `127.0.0.1:*` can invoke conversion
- Files: `server.py` (lines 33-43)
- Current mitigation: Server only listens on `127.0.0.1` (localhost), not `0.0.0.0`; no authentication
- Recommendations: Bind to Unix socket instead of TCP, or use a random secret token in request headers

**No File Type Validation in Conversion:**
- Risk: Server accepts files based on extension only; a malformed DOCX could crash Pandoc or Python-docx
- Files: `server.py` (line 45), `convert.py` (various)
- Current mitigation: Subprocess timeouts (120–600s) prevent hung processes
- Recommendations: Add magic byte (file signature) validation before conversion attempt

**No Size Limits on Individual Files:**
- Risk: User can upload a 5GB PDF and exhaust server memory/disk during conversion
- Files: `server.py` (lines 121-141)
- Current mitigation: Marker/PyMuPDF timeouts may prevent worst-case hangs
- Recommendations: Add `max_file_size` parameter; reject files >500MB upfront

## Performance Bottlenecks

**Inefficient Heading Detection Loop:**
- Problem: `detect_and_promote_headings()` scans entire document twice (pass 1 find headings, pass 2 rebuild), then applies regex to every line during result assembly
- Files: `postprocess.py` (lines 121-209)
- Cause: Multiple passes + repeated regex compilation
- Improvement path: Single-pass scan with line-in-set check; pre-compile regex once

**Browser-side RTF Parsing with Heavy Regex:**
- Problem: `convertRtf()` runs 15+ regex operations sequentially on the entire file content (not line-by-line)
- Files: `src/convertRtf.js` (lines 13-67)
- Cause: RTF is line-unaware; all replacements work on full text
- Improvement path: For large RTF files (>10MB), implement streaming parser or defer to server-side Pandoc

**ZIP Extraction Loads Entire Decompressed Content into Memory:**
- Problem: `extractZip()` calls `entry.async("blob")` for every file in the ZIP, which materializes entire contents in RAM
- Files: `src/inputResolver.js` (lines 106-108)
- Cause: No streaming support in JSZip for browser environment
- Improvement path: For large ZIPs, use Transferable objects or offload to Worker thread; validate size before extraction

**No Async Batching in Web App Conversion:**
- Problem: `runConversion()` converts files serially, not in parallel batches
- Files: `src/App.jsx` (lines 1269-1330)
- Cause: Each conversion awaits before starting next
- Improvement path: Use `Promise.all()` with batch size limit (e.g., 3 parallel conversions)

## Fragile Areas

**Heading Detection via Interleaving Logic:**
- Files: `postprocess.py` (lines 157-176)
- Why fragile: Hierarchy inference relies on "if type A contains type B in body text, B is subordinate to A." This breaks if:
  - A single type is used throughout (all decimals, no Roman numerals) → no subordination detected
  - Types are reused at different levels (e.g., "1. Main" and "1.a Sub") → rank ordering is ambiguous
- Safe modification: Add explicit `min_level` parameter from config; let user override if auto-detection fails
- Test coverage: Only `convertRtf.test.js` and `inputResolver.test.js` exist; no tests for heading promotion logic

**PostProcessor YAML Injection:**
- Files: `postprocess.py` (lines 218-254)
- Why fragile: Uses basic string concatenation; if chapter_config contains quotes or newlines, YAML is malformed
- Safe modification: Use a YAML library to serialize the header instead of manual string building
- Test coverage: No validation tests for YAML output

**Server API Error Responses:**
- Files: `server.py` (lines 120-141)
- Why fragile: Exceptions bubble to FastAPI, which may leak internal paths or Pandoc errors to the client
- Safe modification: Wrap all converter calls in try-except, sanitize error messages before returning to client
- Test coverage: No integration tests for the API

**Cross-Reference Index Hardcoded:**
- Files: `generate_index.py` (lines 15-54)
- Why fragile: `CROSS_REFERENCES` is a hardcoded list specific to Trialbook. For any other textbook, it's wrong and must be edited manually
- Safe modification: Make cross-references optional; load from config or accept an override file
- Test coverage: Only a basic CLI test; no validation that references match actual chapters

## Scaling Limits

**Browser Memory During Large ZIP Extract:**
- Current capacity: Tested up to 500MB decompressed ZIP
- Limit: Browser tab crashes or hangs if ZIP expands to >2GB (especially on mobile)
- Scaling path: Implement streaming ZIP reader using fetch Streams API + ServiceWorker, or move extraction to Node server

**PDF Conversion Timeouts:**
- Current capacity: 600-second timeout for Marker/PyMuPDF
- Limit: Very large PDFs (>500 pages, complex layouts) may timeout and fallback to degraded PyMuPDF
- Scaling path: Implement PDF pagination (split large PDFs into sections, convert separately, merge); queue jobs with Celery + Redis

**Tempfile Cleanup:**
- Current capacity: Extracts ZIPs to system temp directory; cleanup is immediate but not atomic
- Limit: If server crashes during conversion, temp files accumulate
- Scaling path: Use a dedicated cleanup daemon; periodically scan `/tmp` for stale `rag-zip-*` directories older than 1 hour

## Dependencies at Risk

**Marker PDF Engine Not Vendored:**
- Risk: Marker is an external command-line tool; if not installed or version-incompatible, conversions silently degrade to PyMuPDF
- Impact: Users may not realize their PDFs are converted at lower quality
- Migration plan: Vendor Marker as a Python package import (pymupdf4llm is already a package); detect version at startup

**JSZip Internal API Usage:**
- Risk: `entry._data.uncompressedSize` is an undocumented internal property; JSZip major version could remove it
- Impact: ZIP bomb detection could silently fail in future JSZip releases
- Migration plan: Switch to `entry.uncompressed` or computed size sum; file an issue with JSZip maintainers

**Python-docx Limited by MS Word XML Schema:**
- Risk: Unusual DOCX files (created by Google Docs, LibreOffice, or older Word versions) may have non-standard numbering structure
- Impact: `extract_numbering_from_docx()` returns empty dict; headings aren't promoted correctly
- Migration plan: Detect document source in DOCX metadata; handle LibreOffice numbering elements separately; add fallback to heuristic heading detection

## Missing Critical Features

**No Progress Indication for Long Conversions:**
- Problem: User uploads a large PDF, server takes 5 minutes to convert with Marker, UI shows nothing—user thinks it's stuck
- Blocks: Cannot implement without WebSocket or streaming response
- Recommendation: Add Server-Sent Events (SSE) endpoint for progress updates; update UI with "Converting page 45/523..." feedback

**No Retry Mechanism for Failed Conversions:**
- Problem: One failed file aborts the entire batch; no "retry this one" button
- Blocks: Requires stateful session management (store chapter IDs, completed conversions, retry queue)
- Recommendation: Implement resumable conversion queue; mark each chapter with status (pending, done, failed, retry-queued)

**No Custom YAML Injection per File:**
- Problem: If a chapter needs custom front matter (author override, publish date, warnings), no way to inject it
- Blocks: Would require per-chapter config editor in web UI or CLI flag
- Recommendation: Add `custom_yaml.yaml` file support; merge with auto-generated front matter

## Test Coverage Gaps

**Outline Detection Unvalidated:**
- What's not tested: The core logic in `detect_and_promote_headings()` (lines 121-209 of `postprocess.py`)
- Files: `postprocess.py`
- Risk: Hierarchy inference could silently fail and produce flat markdown (all H2 headings)
- Priority: High—this is the main post-processing step; broken heading promotion breaks RAG chunking

**Pandoc Subprocess Error Handling:**
- What's not tested: What happens if Pandoc crashes with non-standard exit codes, or if output file is corrupted
- Files: `convert.py` (lines 146-262)
- Risk: Returns `True` even if output file is truncated or invalid
- Priority: Medium—Pandoc is generally reliable, but production must handle edge cases

**ZIP Extraction Error Cases:**
- What's not tested: Browser-side ZIP extraction with corrupted entries, symlinks, or unusual file permissions
- Files: `src/inputResolver.js` (lines 55-112)
- Risk: Silent skipping of files without user feedback
- Priority: Medium—low probability, but users deserve to know why files were skipped

**Server API Concurrent Requests:**
- What's not tested: What happens if 10 users upload 10 large files simultaneously
- Files: `server.py`
- Risk: Server may crash, or conversions may interfere (temp file name collisions)
- Priority: Medium—assumes unique `tempfile.NamedTemporaryFile()` isolation, which is true, but not validated

**YAML Front Matter Validation:**
- What's not tested: YAML injection with quotes, newlines, or Unicode in chapter titles/topics
- Files: `postprocess.py` (lines 218-254)
- Risk: Generated YAML is malformed if title contains `"quote"` or `\n`
- Priority: Medium—user-provided metadata could break YAML

---

*Concerns audit: 2026-03-17*
