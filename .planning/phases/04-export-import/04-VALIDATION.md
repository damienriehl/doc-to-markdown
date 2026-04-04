---
phase: 04
slug: export-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vite.config.js |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~0.3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 1 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | EXPT-01 | unit | `npx vitest run src/__tests__/exportImport.test.js` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | EXPT-01 | unit | `npx vitest run src/__tests__/exportImport.test.js` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | EXPT-02 | unit | `npx vitest run src/__tests__/exportImport.test.js` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | EXPT-02 | integration | `npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/exportImport.test.js` — stubs for EXPT-01, EXPT-02

*Existing infrastructure (fake-indexeddb, vi.stubGlobal for JSZip) covers all framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ZIP downloads to user's machine | EXPT-01 | File System Access API / anchor-click requires real browser | Open app, export a project, verify ZIP appears in downloads |
| Import from file picker | EXPT-02 | File input requires user interaction | Click import button, select ZIP, verify project appears in list |
| Export dropdown shows two modes | EXPT-01 | Visual hover interaction | Hover export icon, verify dropdown with "Full project" and "Outputs only" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
