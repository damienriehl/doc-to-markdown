/**
 * exportProject / importProject tests
 *
 * Tests cover all EXPT-01 (export) and EXPT-02 (import) behaviors:
 *   - exportProject("full"): ZIP with project.json + sources/ + outputs/
 *   - exportProject("outputs-only"): flat ZIP with only .md files
 *   - exportProject("outputs-only") errors when no chapters have markdownContent
 *   - exportProject("full") succeeds even when no chapters are converted
 *   - importProject from full ZIP: new UUID, source blobs in IDB
 *   - importProject from outputs-only ZIP: minimal record from .md filenames
 *   - importProject name collision: appends " (2)" suffix
 *   - importProject double collision: appends " (3)" suffix
 *   - importProject invalid ZIP (no project.json, no .md): throws "Unrecognized ZIP"
 *   - Round-trip: export full ZIP → import → chapters match original
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
  _resetDbForTest,
} from "../projectDb.js";
import { serializeProject, SCHEMA_VERSION } from "../projectSerializer.js";
import JSZip from "jszip";

// --- Mocks -------------------------------------------------------------------

// Capture the blob that exportProject would trigger a download for
let capturedBlob = null;

vi.mock("../fileSaver.js", () => ({
  saveBlob: async (_fn, blob) => { capturedBlob = blob; },
  smartFilename: (type, _opts) => `test-${type}.zip`,
}));

// Prevent actual server calls during tests
vi.mock("../serverApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isServerAvailable: async () => false,
    saveProjectToServer: async () => null,
  };
});

// Import functions under test AFTER mocks are set up
import { exportProject, importProject } from "../useProjectStore.js";

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
    blobId: overrides.blobId ?? crypto.randomUUID(),
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

/**
 * Seed a project into IDB and return the project ID.
 * @param {string} name
 * @param {Array<object>} chapters
 * @param {{ title: string, author: string }} [book]
 * @returns {Promise<string>} project ID
 */
async function seedProject(name, chapters, book = { title: "Test Book", author: "Test Author" }) {
  const id = crypto.randomUUID();
  const { projectRecord, blobs } = serializeProject({ id, name, book, chapters });
  await putProject(projectRecord);
  if (blobs.length > 0) await putFiles(id, blobs);
  return id;
}

/**
 * Load a Blob through JSZip and return an object for easy assertions.
 * @param {Blob} blob
 * @returns {Promise<{ files: Object, getFile: (path: string) => Promise<string> }>}
 */
async function zipToEntries(blob) {
  const ab = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);
  return {
    files: zip.files,
    getFile: async (path) => zip.files[path]?.async("string") ?? null,
  };
}

// --- beforeEach --------------------------------------------------------------

beforeEach(async () => {
  await _resetDbForTest();
  localStorage.clear();
  capturedBlob = null;
});

// --- exportProject tests -----------------------------------------------------

describe("exportProject", () => {
  it("Test 1 (full mode): produces ZIP with project.json, sources/, and outputs/", async () => {
    const chapter = makeChapter({
      id: "ch-1",
      blobId: "blob-1",
      file: fakeFile("ch01.docx", "docx-bytes"),
      fileName: "ch01.docx",
      title: "Chapter 1",
      slug: "chapter-1",
      chapterNum: 1,
      markdownContent: "# Chapter 1\n\nContent here.",
      status: "done",
    });
    const id = await seedProject("My Book", [chapter]);

    await exportProject(id, "full");

    expect(capturedBlob).not.toBeNull();
    const { files, getFile } = await zipToEntries(capturedBlob);

    // project.json at root
    expect(files["project.json"]).toBeDefined();
    const projectJson = JSON.parse(await getFile("project.json"));
    expect(projectJson.name).toBe("My Book");
    expect(projectJson.chapters.length).toBe(1);

    // sources/ with original file
    expect(files["sources/ch01.docx"]).toBeDefined();

    // outputs/ with Markdown file
    expect(files["outputs/01-chapter-1.md"]).toBeDefined();
    const mdContent = await getFile("outputs/01-chapter-1.md");
    expect(mdContent).toContain("Chapter 1");

    // 00-index.md in outputs/
    expect(files["outputs/00-index.md"]).toBeDefined();
  });

  it("Test 2 (outputs-only mode): produces flat ZIP with only .md files, no project.json, no sources/", async () => {
    const chapter = makeChapter({
      id: "ch-1",
      blobId: "blob-1",
      file: fakeFile("ch01.docx"),
      fileName: "ch01.docx",
      title: "Chapter 1",
      slug: "chapter-1",
      chapterNum: 1,
      markdownContent: "# Chapter 1\n\nContent here.",
      status: "done",
    });
    const id = await seedProject("My Book", [chapter]);

    await exportProject(id, "outputs-only");

    expect(capturedBlob).not.toBeNull();
    const { files } = await zipToEntries(capturedBlob);

    // .md files at root
    expect(files["01-chapter-1.md"]).toBeDefined();
    expect(files["00-index.md"]).toBeDefined();

    // No project.json and no sources/
    expect(files["project.json"]).toBeUndefined();
    const hasSources = Object.keys(files).some(k => k.startsWith("sources/"));
    expect(hasSources).toBe(false);
  });

  it("Test 3 (no outputs error): exportProject(outputs-only) throws when all markdownContent is empty", async () => {
    const chapter = makeChapter({
      id: "ch-1",
      markdownContent: "",
      status: "pending",
    });
    const id = await seedProject("My Book", [chapter]);

    await expect(exportProject(id, "outputs-only")).rejects.toThrow("No converted outputs");
  });

  it("Test 4 (full mode always succeeds): exportProject(full) succeeds even with no converted outputs", async () => {
    const chapter = makeChapter({
      id: "ch-1",
      blobId: "blob-1",
      file: fakeFile("ch01.docx"),
      fileName: "ch01.docx",
      markdownContent: "",
      status: "pending",
    });
    const id = await seedProject("My Book", [chapter]);

    // Should NOT throw — full mode always succeeds (no outputs means no outputs/ folder content)
    await expect(exportProject(id, "full")).resolves.toBeUndefined();
    expect(capturedBlob).not.toBeNull();

    const { files } = await zipToEntries(capturedBlob);
    // project.json is always present
    expect(files["project.json"]).toBeDefined();
    // sources/ present because we have a file
    expect(files["sources/ch01.docx"]).toBeDefined();
  });
});

// --- importProject tests -----------------------------------------------------

describe("importProject", () => {
  it("Test 5 (full ZIP import): writes new UUID, chapters intact, source blobs in IDB", async () => {
    const blobId = crypto.randomUUID();
    const chapter = makeChapter({
      id: "ch-1",
      blobId,
      file: fakeFile("ch01.docx", "original-docx-bytes"),
      fileName: "ch01.docx",
      title: "Chapter 1",
      slug: "chapter-1",
      chapterNum: 1,
      markdownContent: "# Chapter 1\n\nContent.",
      status: "done",
    });
    const originalId = await seedProject("My Book", [chapter]);

    // Export as full ZIP
    await exportProject(originalId, "full");
    const zipBlob = capturedBlob;

    // Reset DB so import goes into a clean store
    await _resetDbForTest();
    localStorage.clear();
    capturedBlob = null;

    // Import
    const zipFile = new File([zipBlob], "my-book.zip", { type: "application/zip" });
    const newId = await importProject(zipFile);

    // New UUID assigned
    expect(newId).not.toBe(originalId);

    // Project record in IDB
    const record = await getProject(newId);
    expect(record).toBeDefined();
    expect(record.id).toBe(newId);
    expect(record.name).toBe("My Book");
    expect(record.chapters.length).toBe(1);
    expect(record.chapters[0].title).toBe("Chapter 1");

    // Source blobs stored in IDB
    const fileMap = await getFiles(newId);
    expect(fileMap.size).toBe(1);
  });

  it("Test 6 (outputs-only import): creates minimal record from .md filenames", async () => {
    // Build a ZIP with only .md files (no project.json)
    const zip = new JSZip();
    zip.file("01-chapter-1.md", "# Chapter 1\n\nContent.");
    zip.file("02-chapter-2.md", "# Chapter 2\n\nMore content.");
    zip.file("00-index.md", "# Index\n\n## Overview");
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const zipFile = new File([zipBlob], "outputs-only-book.zip", { type: "application/zip" });
    const newId = await importProject(zipFile);

    const record = await getProject(newId);
    expect(record).toBeDefined();
    expect(record.name).toBe("outputs-only-book"); // from zip filename without .zip
    // Chapters built from .md filenames (excluding 00-index.md)
    expect(record.chapters.length).toBe(2);
    const ch1 = record.chapters.find(c => c.chapterNum === 1);
    const ch2 = record.chapters.find(c => c.chapterNum === 2);
    expect(ch1).toBeDefined();
    expect(ch2).toBeDefined();
    expect(ch1.markdownContent).toContain("Chapter 1");
  });

  it("Test 7 (name collision): appends (2) suffix when name already exists", async () => {
    // Seed existing project with same name
    const existingId = await seedProject("My Book", []);

    // Build a ZIP with project.json containing name "My Book"
    const chapter = makeChapter({
      id: "ch-1",
      blobId: "blob-1",
      markdownContent: "# Chapter 1",
      status: "done",
    });
    const projectRecord = {
      id: crypto.randomUUID(),
      name: "My Book",
      version: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      book: { title: "My Book", author: "Author" },
      chapters: [chapter],
      uiState: {},
    };
    const zip = new JSZip();
    zip.file("project.json", JSON.stringify(projectRecord));
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const zipFile = new File([zipBlob], "my-book.zip", { type: "application/zip" });
    const newId = await importProject(zipFile);

    const record = await getProject(newId);
    expect(record.name).toBe("My Book (2)");
  });

  it("Test 8 (double collision): appends (3) when both X and X (2) already exist", async () => {
    // Seed "My Book" and "My Book (2)"
    await seedProject("My Book", []);
    await seedProject("My Book (2)", []);

    const projectRecord = {
      id: crypto.randomUUID(),
      name: "My Book",
      version: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      book: { title: "My Book", author: "Author" },
      chapters: [],
      uiState: {},
    };
    const zip = new JSZip();
    zip.file("project.json", JSON.stringify(projectRecord));
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const zipFile = new File([zipBlob], "my-book.zip", { type: "application/zip" });
    const newId = await importProject(zipFile);

    const record = await getProject(newId);
    expect(record.name).toBe("My Book (3)");
  });

  it("Test 9 (invalid ZIP): throws Unrecognized ZIP when no project.json and no .md files", async () => {
    // ZIP with only non-markdown, non-project files
    const zip = new JSZip();
    zip.file("readme.txt", "Some readme content");
    zip.file("image.png", "fake-png-bytes");
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const zipFile = new File([zipBlob], "invalid.zip", { type: "application/zip" });
    await expect(importProject(zipFile)).rejects.toThrow("Unrecognized ZIP");
  });

  it("Test 10 (round-trip): export full ZIP, import, verify chapter data matches original", async () => {
    const blobId = crypto.randomUUID();
    const chapter = makeChapter({
      id: "ch-1",
      blobId,
      file: fakeFile("ch01.docx", "docx-content"),
      fileName: "ch01.docx",
      title: "Chapter 1",
      slug: "chapter-1",
      chapterNum: 1,
      topics: ["topic-a", "topic-b"],
      keyTerms: ["term-1", "term-2"],
      markdownContent: "# Chapter 1\n\nThis is the full content.",
      status: "done",
    });
    const book = { title: "Round Trip Book", author: "Test Author" };
    const originalId = await seedProject("Round Trip Book", [chapter], book);

    // Export full ZIP
    await exportProject(originalId, "full");
    const zipBlob = capturedBlob;

    // Reset DB
    await _resetDbForTest();
    localStorage.clear();
    capturedBlob = null;

    // Import
    const zipFile = new File([zipBlob], "round-trip.zip", { type: "application/zip" });
    const newId = await importProject(zipFile);

    const record = await getProject(newId);
    expect(record).toBeDefined();
    expect(record.chapters.length).toBe(1);

    const importedCh = record.chapters[0];
    expect(importedCh.title).toBe("Chapter 1");
    expect(importedCh.slug).toBe("chapter-1");
    expect(importedCh.chapterNum).toBe(1);
    expect(importedCh.markdownContent).toBe("# Chapter 1\n\nThis is the full content.");
    expect(importedCh.fileName).toBe("ch01.docx");

    // Source blob restored in IDB
    const fileMap = await getFiles(newId);
    expect(fileMap.size).toBe(1);
  });
});
