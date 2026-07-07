---
phase: 02
slug: core-save-load-switch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | vite.config.js (Vitest reads it directly) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | STOR-01,STOR-02,STOR-03 | unit | `npx vitest run src/__tests__/useProjectStore.test.js` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | STOR-01,STOR-02 | integration | `npx vitest run` | ✅ | ⬜ pending |
| 02-03-01 | 03 | 2 | STAT-01,STAT-02,PROJ-01,PROJ-04 | unit+manual | `npx vitest run` + browser test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/useProjectStore.test.js` — stubs for save/load/isDirty/boot hydration
- [ ] Test approach decision: direct function testing vs @testing-library/react hook rendering

*Existing Vitest + fake-indexeddb infrastructure covers test runner and IDB mock.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Save-state badge renders correctly | STAT-01 | Visual rendering verification | Open app, make changes, verify "Unsaved" badge appears; save project, verify "Saved" appears |
| Unsaved-changes modal blocks navigation | STAT-02 | Browser beforeunload + modal interaction | Load project, make changes, try to switch projects, verify modal appears |
| Project list shows correct metadata | PROJ-01,PROJ-04 | Visual rendering verification | Save 2+ projects, open project list, verify names/dates/file counts display correctly |
| Boot hydration loads last project | STOR-03 | Browser page reload behavior | Save a project, reload the page, verify the project auto-loads |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
