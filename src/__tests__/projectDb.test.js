import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  putProject,
  getProject,
  listProjects,
  deleteProject,
  putFiles,
  getFiles,
  requestPersistentStorage,
  saveLastProjectId,
  getLastProjectId,
  _resetDbForTest,
} from "../projectDb.js";

// --- Helpers ---------

/**
 * Create a minimal fake File for testing.
 * @param {string} name - File name
 * @param {string} [content="test-content"] - File content
 * @returns {File}
 */
function fakeFile(name, content = "test-content") {
  return new File([content], name, {
    type: "application/octet-stream",
    lastModified: 1700000000000,
  });
}

/**
 * Build a minimal project record matching the IDB schema shape.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function makeProjectRecord(overrides = {}) {
  return {
    id: overrides.id ?? "proj-1",
    name: overrides.name ?? "Test Project",
    version: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2025-06-01T00:00:00.000Z",
    book: { title: "Book Title", author: "Author" },
    chapters: [
      {
        id: "ch-1",
        blobId: "blob-1",
        fileName: "ch01.docx",
        fileType: "docx",
        title: "Chapter 1",
        slug: "chapter-1",
        chapterNum: 1,
        topics: [],
        keyTerms: [],
        markdownContent: "",
        status: "pending",
      },
    ],
    uiState: {},
    ...overrides,
  };
}

beforeEach(async () => {
  await _resetDbForTest();
  localStorage.clear();
});

// --- Project CRUD ---------

describe("putProject / getProject", () => {
  it("stores a record and retrieves it by ID with all fields intact", async () => {
    await putProject(makeProjectRecord());
    const result = await getProject("proj-1");
    expect(result.id).toBe("proj-1");
    expect(result.name).toBe("Test Project");
    expect(result.book.title).toBe("Book Title");
    expect(result.chapters.length).toBe(1);
  });

  it("overwrites existing record when called with same ID (upsert behavior)", async () => {
    await putProject(makeProjectRecord({ name: "Original" }));
    await putProject(makeProjectRecord({ name: "Updated" }));
    const result = await getProject("proj-1");
    expect(result.name).toBe("Updated");
  });

  it("returns undefined for non-existent ID", async () => {
    const result = await getProject("nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("listProjects", () => {
  it("returns all projects sorted by updatedAt descending (most recent first)", async () => {
    await putProject(makeProjectRecord({ id: "p1", name: "Jan", updatedAt: "2025-01-01T00:00:00.000Z" }));
    await putProject(makeProjectRecord({ id: "p2", name: "Jun", updatedAt: "2025-06-01T00:00:00.000Z" }));
    await putProject(makeProjectRecord({ id: "p3", name: "Mar", updatedAt: "2025-03-01T00:00:00.000Z" }));

    const list = await listProjects();
    expect(list.length).toBe(3);
    expect(list[0].name).toBe("Jun");
    expect(list[1].name).toBe("Mar");
    expect(list[2].name).toBe("Jan");
  });

  it("returns empty array when no projects exist", async () => {
    const list = await listProjects();
    expect(list.length).toBe(0);
  });
});

describe("deleteProject", () => {
  it("removes the project record AND all associated file blobs", async () => {
    await putProject(makeProjectRecord({ id: "proj-1" }));
    await putFiles("proj-1", [
      { id: "blob-1", file: fakeFile("ch1.docx"), name: "ch1.docx" },
    ]);

    await deleteProject("proj-1");

    const project = await getProject("proj-1");
    expect(project).toBeUndefined();

    const files = await getFiles("proj-1");
    expect(files.size).toBe(0);
  });
});

// --- File Blob Storage ---------

describe("putFiles / getFiles", () => {
  it("stores multiple blobs in one call; getFiles retrieves them as Map<blobId, File>", async () => {
    await putFiles("proj-1", [
      { id: "b1", file: fakeFile("a.docx"), name: "a.docx" },
      { id: "b2", file: fakeFile("b.pdf"), name: "b.pdf" },
    ]);

    const map = await getFiles("proj-1");
    expect(map.size).toBe(2);
    expect(map.has("b1")).toBe(true);
    expect(map.has("b2")).toBe(true);
  });

  it("returns an empty Map when no files exist for a project", async () => {
    const map = await getFiles("proj-1");
    expect(map.size).toBe(0);
  });

  it("reconstructed File from getFiles has correct name, type, and lastModified", async () => {
    const original = new File(["content"], "ch01.docx", {
      type: "application/octet-stream",
      lastModified: 1700000000000,
    });

    await putFiles("proj-1", [
      { id: "b1", file: original, name: "ch01.docx" },
    ]);

    const map = await getFiles("proj-1");
    const retrieved = map.get("b1");

    expect(retrieved.name).toBe("ch01.docx");
    expect(retrieved.type).toBe("application/octet-stream");
    expect(retrieved.lastModified).toBe(1700000000000);
  });
});

// --- Last Active Project ---------

describe("saveLastProjectId / getLastProjectId", () => {
  it("persists ID; getLastProjectId retrieves it", () => {
    saveLastProjectId("proj-abc");
    expect(getLastProjectId()).toBe("proj-abc");
  });

  it("returns null when nothing is saved", () => {
    expect(getLastProjectId()).toBeNull();
  });
});

// --- Storage Persistence ---------

describe("requestPersistentStorage", () => {
  it("returns a boolean and never throws (even when navigator.storage is unavailable)", async () => {
    const result = await requestPersistentStorage();
    expect(typeof result).toBe("boolean");
  });
});
