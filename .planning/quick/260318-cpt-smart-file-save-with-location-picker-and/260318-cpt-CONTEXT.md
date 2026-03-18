# Quick Task 260318-cpt: Smart file save with location picker and auto-naming - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Task Boundary

When User saves/downloads outputs, they should be able to both (1) select the save location and (2) name (or rename) the file. The system should auto-generate an intuitive filename based on content so renaming is rarely needed.

</domain>

<decisions>
## Implementation Decisions

### Scope
- All download actions get the save dialog: individual chapters, combined book, index, and ZIP export

### Auto-Naming Format
- Pattern: `YYYY-MM-DD NN-Chapter-Title.md`
- Example: `2026-03-18 03-Jury-Selection.md`
- Date is today's date (ISO), NN is zero-padded chapter number, title from chapter content
- For non-chapter files: `YYYY-MM-DD 00-index.md`, `YYYY-MM-DD 00-complete-book.md`, `YYYY-MM-DD book-title-markdown.zip`

### Browser Fallback
- Use File System Access API (`showSaveFilePicker`) in Chromium browsers
- Fall back gracefully to current auto-download behavior in Firefox/Safari (no save dialog, just downloads with the smart filename)

### Directory Memory
- Remember the chosen directory per session (until tab is closed)
- Subsequent saves default to the same folder (Chromium only, since fallback uses browser default download location)

</decisions>

<specifics>
## Specific Ideas

- User suggested ISO date prefix: `YYYY-MM-DD Source_name`
- Final format chosen: `YYYY-MM-DD NN-Chapter-Title.md` combining date, chapter number, and content-derived title

</specifics>
