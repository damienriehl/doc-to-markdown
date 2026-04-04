---
status: partial
phase: 04-export-import
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md]
started: 2026-04-03T22:00:00Z
updated: 2026-04-03T22:00:00Z
---

## Current Test

number: 2
name: Export dropdown shows two modes
expected: |
  Click the download arrow (export) icon on a project card. A dropdown appears with two options: "Full project" and "Outputs only". Clicking outside the dropdown dismisses it.
awaiting: user response

## Tests

### 1. Export hover icon appears on project cards
expected: Hover over a non-active project card in the project list. Three icons should appear: pencil (rename), download arrow (export), and trash (delete).
result: pass

### 2. Export dropdown shows two modes
expected: Click the download arrow (export) icon on a project card. A dropdown appears with two options: "Full project" and "Outputs only". Clicking outside the dropdown dismisses it.
result: [pending]

### 3. Full project export downloads ZIP
expected: Click "Full project" in the export dropdown. A ZIP file downloads. The ZIP contains: project.json at root, a sources/ folder with original files (DOCX/PDF/etc.), and an outputs/ folder with generated Markdown files.
result: [pending]

### 4. Outputs-only export downloads ZIP
expected: Click "Outputs only" in the export dropdown. A ZIP file downloads containing only .md files at the root level (no folders, no project.json, no source files).
result: [pending]

### 5. Export spinner during download
expected: While an export is processing, the export icon on that card shows a spinning animation. Once complete, the spinner stops and the icon returns to normal.
result: [pending]

### 6. Import button visible in project list
expected: Below the project cards in the expanded project list, an "Import project" button is visible (not hover-gated — always shown).
result: [pending]

### 7. Import from ZIP creates new project
expected: Click "Import project", select a previously exported ZIP file. The project appears in the project list with its original name and can be opened immediately. All files/outputs are restored.
result: [pending]

### 8. Import name collision auto-renames
expected: Import a ZIP with the same project name as an existing project. The imported project appears with " (2)" appended to its name (no overwrite, no prompt).
result: [pending]

### 9. Import status feedback
expected: During import, "Importing..." text appears near the import button. On success, it changes to "Project imported successfully." (green) and auto-clears after ~3 seconds. On error (e.g., non-ZIP file), an error message appears in red.
result: [pending]

### 10. Import rejects invalid ZIP
expected: Try importing a non-ZIP file or a ZIP without project.json or .md files. An error message appears and no project is created.
result: [pending]

### 11. Export-import round trip
expected: Export a project as "Full project", then import the exported ZIP. The imported project has the same chapters, outputs, and settings as the original (verify by opening both).
result: [pending]

## Summary

total: 11
passed: 1
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

[none yet]
