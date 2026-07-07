---
phase: 01
slug: storage-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | vite.config.js (Vitest reads it directly) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | STOR-01 | unit | `npx vitest run src/__tests__/projectSerializer.test.js` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | STOR-02 | unit | `npx vitest run src/__tests__/projectSerializer.test.js` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | STOR-01,STOR-02 | integration | `npx vitest run src/__tests__/projectDb.test.js` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | STOR-03 | unit | `npx vitest run src/__tests__/projectDb.test.js` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | STOR-04 | unit | `npx vitest run src/__tests__/projectDb.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/projectSerializer.test.js` — stubs for STOR-01, STOR-02 serialization
- [ ] `src/__tests__/projectDb.test.js` — stubs for STOR-01, STOR-02, STOR-03, STOR-04 IndexedDB operations
- [ ] `fake-indexeddb@6.2.5` — dev dependency for IndexedDB simulation in Vitest
- [ ] `dexie@4.3.0` — production dependency (locked in CONTEXT.md)

*Existing Vitest infrastructure covers test runner; only test files and IndexedDB mock need adding.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `navigator.storage.persist()` call | STOR-04 | Browser API not available in fake-indexeddb | Open app in Chrome, save project, check DevTools > Application > Storage for "persistent" flag |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
