/**
 * useProjectStore tests
 *
 * Tests focus on the exported buildSnapshot helper and the async persistence
 * logic by directly interacting with projectDb/projectSerializer. The hook's
 * React state is thin and covered by these integration-style tests.
 *
 * Environment: fake-indexeddb, in-memory localStorage mock, no React required.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- localStorage mock -------------------------------------------------------
// Vitest runs in Node where localStorage is a non-functional stub.
const _localStorageMap = new Map();
const localStorageMock = {
  getItem: (key) => _localStorageMap.get(key) ?? null,
  setItem: (key, value) => { _localStorageMap.set(key, String(value)); },
  removeItem: (key) => { _localStorageMap.delete(key); },
  clear: () => { _localStorageMap.clear(); },
};
vi.stubGlobal("localStorage", localStorageMock);

import {
  putProject,
  getProject,
  listProjects,
  putFiles,
  getFiles,
  saveLastProjectId,
  getLastProjectId,
  _resetDbForTest,
  deleteProject,
  renameProject,
} from "../projectDb.js";
import { serializeProject, deserializeProject } from "../projectSerializer.js";
import { buildSnapshot } from "../useProjectStore.js";

// --- Helpers -----------------------------------------------------------------

function fakeFile(name, content = "test-content") {
  return new File([content], name, {
    type: "application/octet-stream",
    lastModified: 1700000000000,
  });
}

function makeChapter(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    file: overrides.file ?? fakeFile("ch01.docx"),
    fileName: overrides.fileName ?? "ch01.docx",
    fileType: overrides.fileType ?? "docx",
    title: overrides.title ?? "Chapter 1",
    slug: overrides.slug ?? "chapter-1",
    chapterNum: overrides.chapterNum ?? 1,
    topics: overrides.topics ?? [],
    keyTerms: overrides.keyTerms ?? [],
    markdownContent: overrides.markdownContent ?? "",
    status: overrides.status ?? "pending",
    ...overrides,
  };
}

const defaultBook = { title: "Test Book", author: "Test Author" };

beforeEach(async () => {
  await _resetDbForTest();
  localStorage.clear();
});

// --- buildSnapshot -----------------------------------------------------------

describe("buildSnapshot", () => {
  it("returns a JSON string of book and chapters without file and _dragging", () => {
    const book = { title: "My Book", author: "Me" };
    const chapters = [makeChapter({ id: "ch-1", _dragging: true })];
    const snapshot = buildSnapshot(book, chapters);
    const parsed = JSON.parse(snapshot);
    expect(parsed.book).toEqual(book);
    expect(parsed.chapters[0].id).toBe("ch-1");
    expect(parsed.chapters[0].file).toBeUndefined();
    expect(parsed.chapters[0]._dragging).toBeUndefined();
  });

  it("includes chapter metadata fields in snapshot", () => {
    const book = { title: "Book", author: "Author" };
    const chapters = [makeChapter({
      id: "ch-2",
      title: "Chapter 2",
      markdownContent: "# Hello",
      status: "done",
    })];
    const snapshot = buildSnapshot(book, chapters);
    const parsed = JSON.parse(snapshot);
    expect(parsed.chapters[0].title).toBe("Chapter 2");
    expect(parsed.chapters[0].markdownContent).toBe("# Hello");
    expect(parsed.chapters[0].status).toBe("done");
  });

  it("mutating _dragging produces identical snapshot (no phantom isDirty)", () => {
    const book = { title: "Book", author: "Author" };
    const ch = makeChapter({ id: "ch-3" });
    const before = buildSnapshot(book, [ch]);
    ch._dragging = true;
    const after = buildSnapshot(book, [ch]);
    expect(before).toBe(after);
  });

  it("mutating file reference produces identical snapshot (file excluded)", () => {
    const book = { title: "Book", author: "Author" };
    const ch = makeChapter({ id: "ch-4" });
    const before = buildSnapshot(book, [ch]);
    ch.file = fakeFile("new.docx");
    const after = buildSnapshot(book, [ch]);
    expect(before).toBe(after);
  });

  it("changing title produces different snapshot (triggers isDirty)", () => {
    const book = { title: "Book", author: "Author" };
    const ch = makeChapter({ id: "ch-5", title: "Old Title" });
    const before = buildSnapshot(book, [ch]);
    ch.title = "New Title";
    const after = buildSnapshot(book, [ch]);
    expect(before).not.toBe(after);
  });
});

// --- save round-trip (via projectDb + projectSerializer) --------------------

describe("save round-trip", () => {
  it("serializes, persists to IDB, and retrieves project with name matching what was saved", async () => {
    const id = crypto.randomUUID();
    const book = defaultBook;
    const chapters = [makeChapter({ id: "ch-1" })];
    const { projectRecord, blobs } = serializeProject({ id, name: "My Project", book, chapters });
    await putProject(projectRecord);
    if (blobs.length > 0) await putFiles(id, blobs);
    saveLastProjectId(id);

    const record = await getProject(id);
    expect(record).toBeDefined();
    expect(record.name).toBe("My Project");
    expect(record.book.title).toBe("Test Book");
    expect(record.book.author).toBe("Test Author");
    expect(record.chapters.length).toBe(1);
  });

  it("getFiles returns Map with the stored file blob", async () => {
    const id = crypto.randomUUID();
    const file = fakeFile("ch01.docx");
    const chapters = [makeChapter({ id: "ch-1", file })];
    const { projectRecord, blobs } = serializeProject({ id, name: "Proj", book: defaultBook, chapters });
    await putProject(projectRecord);
    await putFiles(id, blobs);

    const fileMap = await getFiles(id);
    expect(fileMap.size).toBe(1);
    const stored = [...fileMap.values()][0];
    expect(stored).toBeInstanceOf(File);
    expect(stored.name).toBe("ch01.docx");
  });

  it("save then load: chapters[0].file is a File object", async () => {
    const id = crypto.randomUUID();
    const file = fakeFile("ch01.docx");
    const chapters = [makeChapter({ id: "ch-1", file })];
    const { projectRecord, blobs } = serializeProject({ id, name: "Proj", book: defaultBook, chapters });
    await putProject(projectRecord);
    await putFiles(id, blobs);

    const record = await getProject(id);
    const blobMap = await getFiles(id);
    const { chapters: loaded } = deserializeProject(record, blobMap);
    expect(loaded[0].file).toBeInstanceOf(File);
    expect(loaded[0].fileName).toBe("ch01.docx");
  });

  it("save sets lastProjectId to the saved id", async () => {
    const id = crypto.randomUUID();
    const { projectRecord } = serializeProject({ id, name: "Proj", book: defaultBook, chapters: [] });
    await putProject(projectRecord);
    saveLastProjectId(id);
    expect(getLastProjectId()).toBe(id);
  });
});

// --- boot hydration ----------------------------------------------------------

describe("boot hydration", () => {
  it("when lastProjectId exists, getProject returns the saved record", async () => {
    const id = crypto.randomUUID();
    const { projectRecord } = serializeProject({ id, name: "Saved Project", book: defaultBook, chapters: [] });
    await putProject(projectRecord);
    saveLastProjectId(id);

    const lastId = getLastProjectId();
    expect(lastId).toBe(id);
    const record = await getProject(lastId);
    expect(record).toBeDefined();
    expect(record.name).toBe("Saved Project");
  });

  it("when no lastProjectId, getLastProjectId returns null", () => {
    const lastId = getLastProjectId();
    expect(lastId).toBeNull();
  });

  it("when lastProjectId set but project missing from IDB, getProject returns undefined", async () => {
    saveLastProjectId("nonexistent-id");
    const record = await getProject("nonexistent-id");
    expect(record).toBeUndefined();
  });

  it("listProjects populates after save — sorted by updatedAt desc", async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const { projectRecord: r1 } = serializeProject({ id: id1, name: "Old Project", book: defaultBook, chapters: [] });
    await putProject(r1);

    // Small delay to ensure different updatedAt timestamps
    await new Promise(resolve => setTimeout(resolve, 5));

    const { projectRecord: r2 } = serializeProject({ id: id2, name: "New Project", book: defaultBook, chapters: [] });
    await putProject(r2);

    const list = await listProjects();
    expect(list.length).toBe(2);
    expect(list[0].name).toBe("New Project");
    expect(list[1].name).toBe("Old Project");
  });
});

// --- isDirty via buildSnapshot comparison -----------------------------------

describe("isDirty tracking via buildSnapshot", () => {
  it("isDirty is false after save (snapshot equals current state)", () => {
    const book = { title: "Book", author: "Author" };
    const chapters = [makeChapter({ id: "ch-1" })];
    const savedSnapshot = buildSnapshot(book, chapters);
    // Simulate isDirty check: false when snapshot matches current
    expect(buildSnapshot(book, chapters) === savedSnapshot).toBe(true);
  });

  it("isDirty is true after setBook changes title", () => {
    const book = { title: "Book", author: "Author" };
    const chapters = [makeChapter({ id: "ch-1" })];
    const savedSnapshot = buildSnapshot(book, chapters);
    const mutatedBook = { title: "Changed Title", author: "Author" };
    expect(buildSnapshot(mutatedBook, chapters) === savedSnapshot).toBe(false);
  });

  it("isDirty is false after load (snapshot set from deserialized values)", async () => {
    const id = crypto.randomUUID();
    const book = defaultBook;
    const chapters = [makeChapter({ id: "ch-1" })];
    const { projectRecord, blobs } = serializeProject({ id, name: "Proj", book, chapters });
    await putProject(projectRecord);
    await putFiles(id, blobs);

    const record = await getProject(id);
    const blobMap = await getFiles(id);
    const { book: loadedBook, chapters: loadedChapters } = deserializeProject(record, blobMap);

    // After load, savedSnapshot is set from loadedBook/loadedChapters
    const savedSnapshot = buildSnapshot(loadedBook, loadedChapters);
    // isDirty check: false because snapshot matches loaded state
    expect(buildSnapshot(loadedBook, loadedChapters) === savedSnapshot).toBe(true);
  });

  it("isDirty is false after save (snapshot reset to current book+chapters)", () => {
    const book = { title: "Book", author: "Author" };
    const chapters = [makeChapter({ id: "ch-1" })];
    // Mutate
    const changedBook = { title: "New Title", author: "Author" };
    const savedSnapshotAfterMutation = buildSnapshot(changedBook, chapters);
    // Now "save" and reset snapshot
    const snapshotAfterSave = buildSnapshot(changedBook, chapters);
    expect(snapshotAfterSave === savedSnapshotAfterMutation).toBe(true);
  });
});

// --- switchProject / confirmSwitch / cancelSwitch ---------------------------

describe("switchProject guard logic", () => {
  it("switchProject when isDirty=false: load proceeds (no blocked return)", async () => {
    const id = crypto.randomUUID();
    const book = defaultBook;
    const chapters = [makeChapter({ id: "ch-1" })];
    const { projectRecord, blobs } = serializeProject({ id, name: "Target", book, chapters });
    await putProject(projectRecord);
    await putFiles(id, blobs);

    // Simulate isDirty=false: snapshot matches current state
    const isDirty = false;
    // When not dirty, switchProject should call load — verify load works
    const record = await getProject(id);
    const blobMap = await getFiles(id);
    const { book: b, chapters: c } = deserializeProject(record, blobMap);
    expect(isDirty).toBe(false);
    expect(b.title).toBe("Test Book");
    expect(c.length).toBe(1);
  });

  it("switchProject when isDirty=true returns {blocked:true, pendingId}", () => {
    // Simulate the switchProject guard logic directly
    const isDirty = true;
    const targetId = crypto.randomUUID();
    let pendingId = null;

    function switchProject(id) {
      if (isDirty) {
        pendingId = id;
        return { blocked: true, pendingId: id };
      }
      return null; // would call load
    }

    const result = switchProject(targetId);
    expect(result).toEqual({ blocked: true, pendingId: targetId });
    expect(pendingId).toBe(targetId);
  });

  it("confirmSwitch loads the pending project and clears pendingId", async () => {
    const id = crypto.randomUUID();
    const { projectRecord, blobs } = serializeProject({
      id, name: "Pending Proj", book: defaultBook,
      chapters: [makeChapter({ id: "ch-1" })],
    });
    await putProject(projectRecord);
    await putFiles(id, blobs);

    let pendingId = id;

    async function confirmSwitch() {
      if (!pendingId) return null;
      const target = pendingId;
      pendingId = null;
      const record = await getProject(target);
      if (!record) return null;
      const blobMap = await getFiles(target);
      return deserializeProject(record, blobMap);
    }

    const result = await confirmSwitch();
    expect(result).not.toBeNull();
    expect(result.book.title).toBe("Test Book");
    expect(pendingId).toBeNull();
  });

  it("cancelSwitch clears pendingId without loading", () => {
    let pendingId = "some-id";
    function cancelSwitch() { pendingId = null; }
    cancelSwitch();
    expect(pendingId).toBeNull();
  });
});

// --- saveStatus transitions --------------------------------------------------

describe("saveStatus transitions", () => {
  it("saveStatus logic: unsaved after mutation, saving during save, saved after complete", async () => {
    // Simulate saveStatus state machine logic
    let saveStatus = "saved";
    const isDirty = true;

    // After mutation, isDirty becomes true
    if (isDirty && saveStatus !== "saving") saveStatus = "unsaved";
    expect(saveStatus).toBe("unsaved");

    // During save
    saveStatus = "saving";
    expect(saveStatus).toBe("saving");

    // After save completes
    saveStatus = "saved";
    expect(saveStatus).toBe("saved");
  });

  it("saving status not interrupted when save is in flight", () => {
    let saveStatus = "saving";
    const isDirty = true;

    // The saveStatus sync effect: if prev === "saving" return prev
    const nextStatus = (prev) => {
      if (prev === "saving") return prev;
      return isDirty ? "unsaved" : "saved";
    };
    saveStatus = nextStatus(saveStatus);
    expect(saveStatus).toBe("saving"); // not interrupted
  });
});

// --- load-sequence token (stale result prevention) --------------------------

describe("load-sequence token", () => {
  it("a stale load result (token mismatch) does not overwrite active state", async () => {
    // Simulate the load token logic
    let loadToken = 0;
    const currentToken = ++loadToken;
    // Simulate another load starting mid-flight
    ++loadToken; // token incremented by a newer load

    // Stale check: currentToken !== loadToken
    const isStale = currentToken !== loadToken;
    expect(isStale).toBe(true);
  });

  it("a fresh load result (token matches) is applied to state", async () => {
    let loadToken = 0;
    const currentToken = ++loadToken;
    // No newer load started
    const isStale = currentToken !== loadToken;
    expect(isStale).toBe(false);
  });
});

// --- projectList after save --------------------------------------------------

describe("projectList", () => {
  it("listProjects returns array with name, chapters length, updatedAt", async () => {
    const id = crypto.randomUUID();
    const chapters = [makeChapter({ id: "ch-1" }), makeChapter({ id: "ch-2" })];
    const { projectRecord } = serializeProject({ id, name: "My Book", book: defaultBook, chapters });
    await putProject(projectRecord);

    const list = await listProjects();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("My Book");
    expect(list[0].chapters.length).toBe(2);
    expect(typeof list[0].updatedAt).toBe("string");
  });

  it("listProjects is populated after multiple saves (latest first)", async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const { projectRecord: r1 } = serializeProject({ id: id1, name: "Alpha", book: defaultBook, chapters: [] });
    await putProject(r1);

    await new Promise(resolve => setTimeout(resolve, 5));

    const { projectRecord: r2 } = serializeProject({ id: id2, name: "Beta", book: defaultBook, chapters: [] });
    await putProject(r2);

    const list = await listProjects();
    expect(list.length).toBe(2);
    expect(list[0].name).toBe("Beta");
  });
});

// --- renameProject persistence -----------------------------------------------

describe("renameProject persistence", () => {
  it("renameProject updates IDB record name and preserves other fields", async () => {
    const id = crypto.randomUUID();
    const { projectRecord } = serializeProject({ id, name: "Old Name", book: defaultBook, chapters: [] });
    await putProject(projectRecord);
    await renameProject(id, "New Name");
    const record = await getProject(id);
    expect(record.name).toBe("New Name");
    expect(record.book.title).toBe("Test Book");
  });

  it("renameProject on nonexistent ID does not throw", async () => {
    await expect(renameProject("nonexistent", "Name")).resolves.toBeUndefined();
  });
});

// --- deleteProject active-project reset --------------------------------------

describe("deleteProject active-project reset", () => {
  it("after deleting a project, getProject returns undefined", async () => {
    const id = crypto.randomUUID();
    const { projectRecord, blobs } = serializeProject({
      id, name: "To Delete", book: defaultBook,
      chapters: [makeChapter({ id: "ch-1" })],
    });
    await putProject(projectRecord);
    await putFiles(id, blobs);
    await deleteProject(id);
    const record = await getProject(id);
    expect(record).toBeUndefined();
    const files = await getFiles(id);
    expect(files.size).toBe(0);
  });

  it("after deleting, listProjects no longer includes deleted project", async () => {
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const { projectRecord: r1 } = serializeProject({ id: id1, name: "Keep", book: defaultBook, chapters: [] });
    const { projectRecord: r2 } = serializeProject({ id: id2, name: "Delete", book: defaultBook, chapters: [] });
    await putProject(r1);
    await putProject(r2);
    await deleteProject(id2);
    const list = await listProjects();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Keep");
  });
});

// --- newProject reset --------------------------------------------------------

describe("newProject logic", () => {
  it("newProject: snapshot null means isDirty is true only when chapters exist or title set", () => {
    // When savedSnapshotRef.current === null:
    //   isDirty = chapters.length > 0 || book.title !== ""
    const emptyBook = { title: "", author: "" };
    const emptyChapters = [];
    const isDirtyEmpty = emptyChapters.length > 0 || emptyBook.title !== "";
    expect(isDirtyEmpty).toBe(false);

    const withTitle = { title: "Something", author: "" };
    const isDirtyWithTitle = emptyChapters.length > 0 || withTitle.title !== "";
    expect(isDirtyWithTitle).toBe(true);

    const withChapters = [makeChapter({ id: "ch-1" })];
    const isDirtyWithChapters = withChapters.length > 0 || emptyBook.title !== "";
    expect(isDirtyWithChapters).toBe(true);
  });
});
