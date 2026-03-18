---
phase: quick
plan: 260318-cpt
type: execute
wave: 1
depends_on: []
files_modified:
  - src/fileSaver.js
  - src/__tests__/fileSaver.test.js
  - src/App.jsx
autonomous: false
requirements: [SAVE-01, SAVE-02, SAVE-03, SAVE-04]

must_haves:
  truths:
    - "Every download action opens a save-location picker in Chromium browsers"
    - "Firefox/Safari fall back to auto-download with the smart filename"
    - "Filenames follow YYYY-MM-DD NN-Chapter-Title.md pattern"
    - "ZIP filenames follow YYYY-MM-DD book-title-markdown.zip pattern"
    - "Subsequent saves in the same session default to the previously chosen directory"
  artifacts:
    - path: "src/fileSaver.js"
      provides: "Smart save utility with File System Access API + fallback + directory memory + auto-naming"
      exports: ["saveFile", "saveBlob", "smartFilename"]
    - path: "src/__tests__/fileSaver.test.js"
      provides: "Unit tests for filename generation and fallback logic"
    - path: "src/App.jsx"
      provides: "All download call sites updated to use fileSaver"
  key_links:
    - from: "src/App.jsx"
      to: "src/fileSaver.js"
      via: "import { saveFile, saveBlob, smartFilename }"
      pattern: "saveFile|saveBlob|smartFilename"
---

<objective>
Replace all download/save logic with a smart file saver that uses the File System Access API (Chromium) for location picking, falls back to auto-download (Firefox/Safari), generates date-prefixed filenames, and remembers the chosen directory per session.

Purpose: Users should be able to choose where files are saved and get intuitive auto-generated filenames without manual renaming.
Output: New `src/fileSaver.js` module with tests, all download call sites in App.jsx updated.
</objective>

<execution_context>
@/home/damienriehl/.claude/get-shit-done/workflows/execute-plan.md
@/home/damienriehl/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.jsx

Key existing patterns to replace:
- `downloadFile(filename, content)` at line 425 — creates blob + anchor click
- `generateZip(chapters, book)` at line 468 — has its own blob + anchor download
- Individual chapter download at line 1747 — filename: `NN-slug.md`
- Index download at line 1725 — filename: `00-index.md`
- Combined book at line 1020 — filename: `00-complete-book.md`
- Download all individual at line 985 — loops downloadFile for each chapter + index
- ZIP at line 1012 — calls generateZip, filename: `slugify(book.title)-markdown.zip`
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create fileSaver.js with smart naming, File System Access API, and fallback</name>
  <files>src/fileSaver.js, src/__tests__/fileSaver.test.js</files>
  <behavior>
    - smartFilename("chapter", { chapterNum: 3, slug: "jury-selection" }) returns "YYYY-MM-DD 03-Jury-Selection.md" (today's date, zero-padded, title-cased slug)
    - smartFilename("index") returns "YYYY-MM-DD 00-index.md"
    - smartFilename("combined") returns "YYYY-MM-DD 00-complete-book.md"
    - smartFilename("zip", { bookTitle: "Trialbook" }) returns "YYYY-MM-DD trialbook-markdown.zip"
    - smartFilename("zip", { bookTitle: "" }) returns "YYYY-MM-DD book-markdown.zip"
    - Title-casing converts "jury-selection" to "Jury-Selection" (capitalize each segment)
    - saveFile calls showSaveFilePicker when available, falls back to anchor-click download
    - saveFile with { forceFallback: true } skips showSaveFilePicker and uses anchor-click directly
    - saveBlob calls showSaveFilePicker for blobs (ZIP), falls back to anchor-click download
    - After a successful showSaveFilePicker, the file handle is cached in module scope
    - Subsequent saveFile/saveBlob calls pass startIn with the cached handle
    - Fallback path creates anchor element with blob URL, clicks it, and revokes URL
  </behavior>
  <action>
    Create `src/fileSaver.js` exporting three functions:

    **`smartFilename(type, opts?)`**
    - `type` is one of: "chapter", "index", "combined", "zip"
    - For "chapter": opts has { chapterNum, slug } — returns `YYYY-MM-DD NN-Slug-Title-Cased.md`
    - For "index": returns `YYYY-MM-DD 00-index.md`
    - For "combined": returns `YYYY-MM-DD 00-complete-book.md`
    - For "zip": opts has { bookTitle } — returns `YYYY-MM-DD slugified-title-markdown.zip`
    - Date is `new Date().toISOString().slice(0, 10)` (today, ISO format)
    - Slug title-casing: split on `-`, capitalize first letter of each word, rejoin with `-`

    **`saveFile(filename, content, opts?)`**
    - opts: `{ mimeType?: string, forceFallback?: boolean }`
    - Default mimeType: `"text/markdown;charset=utf-8"`
    - If `forceFallback` is true, skip showSaveFilePicker and use anchor-click directly (for batch downloads).
    - If `window.showSaveFilePicker` exists and not forceFallback: call it with `{ suggestedName: filename, startIn: cachedFileHandle || "downloads" }` and appropriate `types` array based on file extension. Write content to the writable stream. Cache the returned FileSystemFileHandle for session directory reuse (the API accepts a FileSystemFileHandle as startIn and opens in its parent directory).
    - Catch AbortError separately (user pressed Cancel) — do nothing, don't fall back.
    - If `showSaveFilePicker` is not available: fall back to the anchor-click approach (create Blob, createObjectURL, click, revokeURL).

    **`saveBlob(filename, blob)`**
    - Same pattern as saveFile but accepts a pre-built Blob (for ZIP files).
    - If `showSaveFilePicker` exists: open picker with suggestedName, write blob to stream, cache file handle.
    - Fallback: anchor-click with the blob directly.
    - Catch AbortError — do nothing.

    Module-level `let cachedFileHandle = null` — set after each successful showSaveFilePicker call. Pass as `startIn` on the next call so the dialog opens in the same directory.

    Create `src/__tests__/fileSaver.test.js` testing:
    - All smartFilename variants (mock Date to fix "2026-03-18")
    - Fallback path: mock `document.createElement`, `document.body.appendChild/removeChild`, `URL.createObjectURL/revokeObjectURL` — verify anchor creation with correct href and download attribute
    - showSaveFilePicker path: mock `window.showSaveFilePicker` returning a mock FileSystemFileHandle with `createWritable()` — verify content written and stream closed
    - AbortError: mock showSaveFilePicker throwing DOMException with name "AbortError" — verify no fallback triggered
    - Directory memory: call saveFile twice with showSaveFilePicker mock, verify second call passes startIn with cached handle
    - forceFallback: mock showSaveFilePicker exists, call saveFile with { forceFallback: true }, verify showSaveFilePicker NOT called and anchor-click used instead
  </action>
  <verify>
    <automated>cd "/home/damienriehl/Coding Projects/doc-to-markdown" && npx vitest run src/__tests__/fileSaver.test.js</automated>
  </verify>
  <done>smartFilename generates correct date-prefixed filenames for all types. saveFile/saveBlob use File System Access API when available, fall back to anchor-click, support forceFallback, and remember directory across calls. All tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Replace all download call sites in App.jsx with fileSaver</name>
  <files>src/App.jsx</files>
  <action>
    Import from fileSaver at the top of App.jsx:
    ```
    import { saveFile, saveBlob, smartFilename } from "./fileSaver.js";
    ```

    **Delete** the `downloadFile` function (lines 425-435). All its callers will use `saveFile` instead.

    **Replace each download call site:**

    1. **Individual chapter download** (onDownload callback, ~line 1747-1749):
       Replace `downloadFile(fn, refreshYaml(ch, book))` with:
       ```js
       const fn = smartFilename("chapter", { chapterNum: ch.chapterNum, slug: ch.slug });
       saveFile(fn, refreshYaml(ch, book));
       ```

    2. **Index download** (~line 1725):
       Replace `downloadFile("00-index.md", indexContent)` with:
       ```js
       saveFile(smartFilename("index"), indexContent);
       ```

    3. **Combined book download** (DownloadBar, ~line 1020-1021):
       Replace `downloadFile("00-complete-book.md", combined)` with:
       ```js
       saveFile(smartFilename("combined"), combined);
       ```

    4. **Download all individual** (downloadAllIndividual, ~line 985-997):
       Update the loop to use smartFilename for each chapter AND force fallback (no picker per file):
       ```js
       const fn = smartFilename("chapter", { chapterNum: ch.chapterNum, slug: ch.slug });
       saveFile(fn, refreshYaml(ch, book), { forceFallback: true });
       ```
       And the index at the end:
       ```js
       saveFile(smartFilename("index"), buildIndexFile(sorted, book), { forceFallback: true });
       ```
       Keep the setTimeout staggering (200ms per file) for batch downloads.

    5. **ZIP export** (generateZip, ~line 468-491):
       After `zip.generateAsync({ type: "blob" })`, replace the anchor-click code with:
       ```js
       const fn = smartFilename("zip", { bookTitle: book.title });
       await saveBlob(fn, blob);
       ```
       Remove the manual anchor-click logic from generateZip (lines 483-490).

    6. **Chapter filenames elsewhere** — The `NN-slug.md` pattern used in the preview callback (~line 1744) does NOT need changing (preview just sets internal state, not a download).

    After all replacements, verify no references to the deleted `downloadFile` function remain (except imports from fileSaver).
  </action>
  <verify>
    <automated>cd "/home/damienriehl/Coding Projects/doc-to-markdown" && npx vitest run</automated>
  </verify>
  <done>All 7 download call sites in App.jsx use saveFile/saveBlob with smartFilename. The old downloadFile function is deleted. No broken references. All existing tests still pass.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify save dialogs and smart filenames in browser</name>
  <files>src/App.jsx</files>
  <action>User verifies the save behavior in browser.</action>
  <what-built>Smart file save with location picker and auto-naming across all download actions</what-built>
  <how-to-verify>
    1. Open the app in Chrome/Edge (Chromium browser)
    2. Load or convert a chapter file
    3. Click the download arrow on an individual chapter — verify a Save As dialog appears with filename like "2026-03-18 03-Jury-Selection.md", and you can choose where to save
    4. Click "Download Zip" — verify Save As dialog shows "2026-03-18 book-title-markdown.zip"
    5. Click "Combined" — verify Save As dialog shows "2026-03-18 00-complete-book.md"
    6. Save a second file — verify the dialog opens in the same directory as the first save
    7. Click "All Individual" — verify files auto-download (no repeated dialogs) with date-prefixed names
    8. (Optional) Test in Firefox — verify files auto-download with smart filenames (no Save As dialog, but correct names)
  </how-to-verify>
  <verify>User confirms all download actions work correctly</verify>
  <done>All download types produce correct smart filenames. Chromium shows save picker. Firefox falls back gracefully. Directory memory works within session.</done>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- All download actions produce filenames matching `YYYY-MM-DD NN-Title.md` or `YYYY-MM-DD descriptor.ext` pattern
- Chromium browsers show a save-location picker (File System Access API)
- Firefox/Safari fall back to standard auto-download with smart filename
- Directory choice persists within a session (Chromium only)
- "All Individual" bulk download skips the picker to avoid dialog spam
- No regressions in existing tests
</verification>

<success_criteria>
- `npx vitest run` passes (all existing + new fileSaver tests)
- Individual, combined, index, and ZIP downloads all use smart filenames
- Save-location picker appears in Chromium; graceful fallback elsewhere
- Cancel in the picker does nothing (no error, no fallback download)
- Second save in same session opens in the previously chosen directory
</success_criteria>

<output>
After completion, create `.planning/quick/260318-cpt-smart-file-save-with-location-picker-and/260318-cpt-SUMMARY.md`
</output>
