# Requirements: Doc-to-Markdown Project Save/Load

**Defined:** 2026-03-17
**Core Value:** Users can switch between 5–15 book projects instantly, with full state restoration

## v1 Requirements

### Storage

- [x] **STOR-01**: User can save current workspace to IndexedDB with a user-chosen name
- [x] **STOR-02**: User can load a saved project, restoring all files, settings, outputs, and UI state
- [x] **STOR-03**: App automatically restores the last-opened project on page reload
- [x] **STOR-04**: Source files (DOCX/PDF/RTF/ODT/TXT) are stored as blobs so they can be re-converted later

### Project Management

- [x] **PROJ-01**: User can see a list of all saved projects sorted by last modified date
- [ ] **PROJ-02**: User can rename a saved project
- [ ] **PROJ-03**: User can delete a saved project with a confirmation dialog
- [x] **PROJ-04**: Project list shows name, last-modified date, and file count for each project

### State Indicators

- [x] **STAT-01**: User sees a visual indicator showing whether current state is saved or unsaved
- [x] **STAT-02**: User is warned before navigating away or switching projects with unsaved changes

### Export/Import

- [ ] **EXPT-01**: User can export a project as a ZIP archive containing source files, outputs, and settings
- [ ] **EXPT-02**: User can import a project from a ZIP archive, restoring it as a new saved project

## v2 Requirements

### Server Persistence

- **SRVR-01**: Projects are also saved to server directory (`./projects/<name>/`) for filesystem portability
- **SRVR-02**: Server directory serves as authoritative store; IndexedDB is a fast-loading cache

### Project Organization

- **ORG-01**: User can archive/hide completed projects from the active list
- **ORG-02**: User can duplicate a project as a starting point for a new book
- **ORG-03**: Project cards show metadata preview (output count, last conversion engine used)

### Power User

- **PWR-01**: Keyboard shortcut (Cmd/Ctrl+Shift+P) opens project switcher overlay
- **PWR-02**: Project metadata fields (description, tags) for organization at scale

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-save on every action | Source files are 1–50MB; constant writes cause quota pressure and sluggishness |
| Version history within a project | Multiplies storage N×; disproportionate complexity for single-user tool |
| Cloud sync / remote storage | Changes architecture fundamentally; ZIP export is the portability story |
| Real-time collaboration | Single-user tool; CRDTs/WebSockets add months with zero user benefit |
| File System Access API as primary storage | Only Chrome/Edge support; Firefox declared it "harmful"; ~33% global coverage |
| Nested project folders | Even Figma doesn't support subfolders; tags/archive cover the need for 5–15 projects |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STOR-01 | Phase 1 | Complete |
| STOR-02 | Phase 1 | Complete |
| STOR-03 | Phase 1 | Complete |
| STOR-04 | Phase 1 | Complete |
| PROJ-01 | Phase 2 | Complete |
| PROJ-02 | Phase 3 | Pending |
| PROJ-03 | Phase 3 | Pending |
| PROJ-04 | Phase 2 | Complete |
| STAT-01 | Phase 2 | Complete |
| STAT-02 | Phase 2 | Complete |
| EXPT-01 | Phase 4 | Pending |
| EXPT-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after roadmap creation*
