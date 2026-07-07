---
title: Importing a project stole another project's source files (blobId collision)
date: 2026-07-07
repo: doc-to-markdown
area: [indexeddb, import-export, data-integrity]
severity: high
symptom: after importing a ZIP, sources/ came back empty on re-export; original project's files vanished
root_cause: reused a globally-unique store key (blobId) from imported data
fix_commit: 47e8af4
tags: [dexie, indexeddb, primary-key, put-overwrite, data-loss]
---

## Problem

The IndexedDB `files` store is keyed by `blobId` (`files: "id, projectId"` in Dexie).
`importProject` assigned a fresh project `id` but **kept the chapter `blobId`s embedded
in the imported `project.json`**. Because `blobId` is the store's primary key,
`putFiles()` (`bulkPut`) for the imported project **overwrote** any existing record
with that blobId and re-parented it (its `projectId` now pointed at the new project).

Re-importing an export of an existing project (or importing two ZIPs derived from the
same source) therefore **silently deleted the original project's source blobs** — they
were reassigned to whichever project was imported last. `getFiles(originalId)` returned
0 records; re-export produced an empty `sources/` folder.

## Symptom

- Import a full ZIP → looks fine (chapters + outputs restored).
- Re-export the imported (or original) project → `sources/` is empty.
- Live probe: both the original and the imported project report `getFiles().size === 0`;
  only the last-imported project owns the blobs.

## Fix

Regenerate a fresh `blobId` (and chapter `id`) for **every** chapter on import,
mirroring the fresh project `id` that import already assigns:

```js
projectRecord = {
  ...projectRecord,
  id: newId,
  updatedAt: new Date().toISOString(),
  chapters: (projectRecord.chapters ?? []).map((ch) => ({
    ...ch, id: crypto.randomUUID(), blobId: crypto.randomUUID(),
  })),
};
```

Regression test: `src/__tests__/exportImport.test.js` Test 11 (blobId isolation) — import
the same export back into the same DB and assert both projects keep their own blob.

## Lesson (reusable)

When a store's **primary key comes from imported/user data** (not minted locally),
importing can collide with existing rows and silently overwrite them. On import, **mint
new identities for every entity whose id doubles as a storage key** — never trust ids
carried inside imported payloads. Verify with a *byte-compare round-trip* (export →
import → re-export → compare payload bytes), not just "it looks restored".
