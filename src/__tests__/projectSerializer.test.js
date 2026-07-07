import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, serializeProject, deserializeProject } from "../projectSerializer.js";

// --- Helpers ---------

/**
 * Create a minimal fake File object for testing.
 * @param {string} name - File name
 * @param {string} [content="test"] - File content
 * @returns {File}
 */
function fakeFile(name, content = "test") {
  return new File([content], name, { type: "application/octet-stream", lastModified: Date.now() });
}

/**
 * Build a minimal chapter object matching the App.jsx shape.
 */
function makeChapter(overrides = {}) {
  return {
    id: "chapter-id-1",
    file: fakeFile("ch1.docx"),
    fileName: "ch1.docx",
    fileType: "docx",
    title: "Chapter One",
    slug: "chapter-one",
    chapterNum: 1,
    topics: ["topic-a"],
    keyTerms: ["term-1"],
    markdownContent: "# Chapter One\n\nContent here.",
    status: "pending",
    ...overrides,
  };
}

// --- serializeProject ---------

describe("serializeProject", () => {
  it("extracts File objects from chapters into a blobs array", () => {
    const ch1 = makeChapter({ id: "id-1", fileName: "ch1.docx" });
    const ch2 = makeChapter({ id: "id-2", fileName: "ch2.docx", file: fakeFile("ch2.docx"), chapterNum: 2 });

    const { blobs } = serializeProject({
      id: "proj-1",
      name: "My Book",
      book: { title: "My Book", author: "Author" },
      chapters: [ch1, ch2],
    });

    expect(blobs.length).toBe(2);
    expect(blobs[0]).toHaveProperty("id");
    expect(blobs[0]).toHaveProperty("file");
    expect(blobs[0]).toHaveProperty("name");
  });

  it("produces a projectRecord where JSON.stringify contains no File objects", () => {
    const ch = makeChapter();
    const { projectRecord } = serializeProject({
      id: "proj-1",
      name: "My Book",
      book: { title: "My Book", author: "Author" },
      chapters: [ch],
    });

    const stringified = JSON.stringify(projectRecord);
    expect(stringified).not.toContain('"file":{}');
    expect(stringified).not.toContain("[object File]");
    // Chapters should not have a file key at all
    const parsed = JSON.parse(stringified);
    expect(parsed.chapters[0]).not.toHaveProperty("file");
  });

  it("preserves all chapter metadata fields", () => {
    const ch = makeChapter({
      id: "meta-id",
      fileName: "meta.docx",
      fileType: "docx",
      title: "Meta Chapter",
      slug: "meta-chapter",
      chapterNum: 3,
      topics: ["litigation"],
      keyTerms: ["deposition"],
      markdownContent: "# Meta",
      status: "done",
    });

    const { projectRecord } = serializeProject({
      id: "proj-1",
      name: "My Book",
      book: { title: "My Book", author: "Author" },
      chapters: [ch],
    });

    const serialized = projectRecord.chapters[0];
    expect(serialized.fileName).toBe("meta.docx");
    expect(serialized.fileType).toBe("docx");
    expect(serialized.title).toBe("Meta Chapter");
    expect(serialized.slug).toBe("meta-chapter");
    expect(serialized.chapterNum).toBe(3);
    expect(serialized.topics).toEqual(["litigation"]);
    expect(serialized.keyTerms).toEqual(["deposition"]);
    expect(serialized.markdownContent).toBe("# Meta");
    expect(serialized.status).toBe("done");
  });

  it("reuses existing blobId and generates UUID for chapters without one", () => {
    const chWithId = makeChapter({ blobId: "existing-id" });
    const chWithout = makeChapter({ id: "id-no-blob", chapterNum: 2, file: fakeFile("ch2.docx"), fileName: "ch2.docx" });
    delete chWithout.blobId;

    const { projectRecord, blobs } = serializeProject({
      id: "proj-1",
      name: "My Book",
      book: { title: "My Book", author: "Author" },
      chapters: [chWithId, chWithout],
    });

    // Chapter with existing blobId reuses it
    expect(projectRecord.chapters[0].blobId).toBe("existing-id");
    expect(blobs[0].id).toBe("existing-id");

    // Chapter without blobId gets a generated UUID
    const generatedId = projectRecord.chapters[1].blobId;
    expect(typeof generatedId).toBe("string");
    expect(generatedId.length).toBeGreaterThan(0);
    // Basic UUID format check (8-4-4-4-12)
    expect(generatedId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sets version to SCHEMA_VERSION", () => {
    const { projectRecord } = serializeProject({
      id: "proj-1",
      name: "My Book",
      book: { title: "My Book", author: "Author" },
      chapters: [],
    });

    expect(projectRecord.version).toBe(SCHEMA_VERSION);
  });

  it("preserves createdAt when passed; uses current ISO string when not passed", () => {
    const fixedDate = "2025-01-01T00:00:00.000Z";

    const { projectRecord: withDate } = serializeProject({
      id: "proj-1",
      name: "My Book",
      book: { title: "My Book", author: "Author" },
      chapters: [],
      createdAt: fixedDate,
    });
    expect(withDate.createdAt).toBe(fixedDate);

    const { projectRecord: withoutDate } = serializeProject({
      id: "proj-1",
      name: "My Book",
      book: { title: "My Book", author: "Author" },
      chapters: [],
    });
    // Should be a valid ISO string
    expect(() => new Date(withoutDate.createdAt).toISOString()).not.toThrow();
    expect(withoutDate.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("handles empty chapters array", () => {
    const { projectRecord, blobs } = serializeProject({
      id: "proj-empty",
      name: "Empty Book",
      book: { title: "", author: "" },
      chapters: [],
    });

    expect(blobs.length).toBe(0);
    expect(projectRecord.chapters.length).toBe(0);
  });

  it("handles chapters with no file property — no blob pushed, blobId still generated", () => {
    const chNoFile = {
      id: "no-file-id",
      fileName: "ch1.docx",
      fileType: "docx",
      title: "Chapter One",
      slug: "chapter-one",
      chapterNum: 1,
      topics: [],
      keyTerms: [],
      markdownContent: "",
      status: "pending",
      // No `file` property
    };

    const { projectRecord, blobs } = serializeProject({
      id: "proj-1",
      name: "My Book",
      book: { title: "My Book", author: "Author" },
      chapters: [chNoFile],
    });

    expect(blobs.length).toBe(0);
    expect(typeof projectRecord.chapters[0].blobId).toBe("string");
    expect(projectRecord.chapters[0].blobId.length).toBeGreaterThan(0);
  });
});

// --- deserializeProject ---------

describe("deserializeProject", () => {
  it("reconstructs book, chapters, and uiState from a stored record", () => {
    const record = {
      id: "proj-1",
      name: "My Book",
      version: SCHEMA_VERSION,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      book: { title: "Test Book", author: "Author Name" },
      chapters: [
        {
          id: "ch-1",
          blobId: "b1",
          fileName: "ch1.docx",
          fileType: "docx",
          title: "Chapter One",
          slug: "chapter-one",
          chapterNum: 1,
          topics: [],
          keyTerms: [],
          markdownContent: "",
          status: "pending",
        },
      ],
      uiState: { expanded: true },
    };

    const result = deserializeProject(record, new Map());

    expect(result.book.title).toBe("Test Book");
    expect(result.chapters.length).toBe(1);
    expect(result.uiState.expanded).toBe(true);
  });

  it("reattaches File objects from blobMap to the correct chapter via blobId", () => {
    const f = fakeFile("ch1.docx");
    const blobMap = new Map([["b1", f]]);

    const record = {
      book: { title: "Test Book", author: "Author" },
      chapters: [
        {
          id: "ch-1",
          blobId: "b1",
          fileName: "ch1.docx",
          fileType: "docx",
          title: "Chapter One",
          slug: "chapter-one",
          chapterNum: 1,
          topics: [],
          keyTerms: [],
          markdownContent: "",
          status: "pending",
        },
      ],
      uiState: {},
    };

    const result = deserializeProject(record, blobMap);

    expect(result.chapters[0].file).toBeInstanceOf(File);
    expect(result.chapters[0].file.name).toBe("ch1.docx");
  });

  it("returns null file when blobMap has no entry for a blobId", () => {
    const record = {
      book: { title: "Test Book", author: "Author" },
      chapters: [
        {
          id: "ch-1",
          blobId: "missing-id",
          fileName: "ch1.docx",
          fileType: "docx",
          title: "Chapter One",
          slug: "chapter-one",
          chapterNum: 1,
          topics: [],
          keyTerms: [],
          markdownContent: "",
          status: "pending",
        },
      ],
      uiState: {},
    };

    const result = deserializeProject(record, new Map());

    expect(result.chapters[0].file).toBeNull();
  });
});

// --- round-trip ---------

describe("round-trip", () => {
  it("serialize then deserialize preserves all non-File fields", () => {
    const originalChapter = {
      id: "rt-id",
      file: fakeFile("rt.docx"),
      fileName: "rt.docx",
      fileType: "docx",
      title: "Round Trip Chapter",
      slug: "round-trip-chapter",
      chapterNum: 7,
      topics: ["evidence", "testimony"],
      keyTerms: ["hearsay", "objection"],
      markdownContent: "# Round Trip\n\nSome content.",
      status: "done",
    };

    const input = {
      id: "rt-proj",
      name: "Round Trip Book",
      book: { title: "Round Trip Book", author: "Test Author" },
      chapters: [originalChapter],
      createdAt: "2025-06-01T12:00:00.000Z",
    };

    const { projectRecord, blobs } = serializeProject(input);

    // Build blobMap from serialized blobs
    const blobMap = new Map(blobs.map((b) => [b.id, b.file]));

    const result = deserializeProject(projectRecord, blobMap);

    // Non-File fields preserved
    expect(result.book.title).toBe("Round Trip Book");
    expect(result.book.author).toBe("Test Author");
    expect(result.chapters[0].id).toBe("rt-id");
    expect(result.chapters[0].fileName).toBe("rt.docx");
    expect(result.chapters[0].fileType).toBe("docx");
    expect(result.chapters[0].title).toBe("Round Trip Chapter");
    expect(result.chapters[0].slug).toBe("round-trip-chapter");
    expect(result.chapters[0].chapterNum).toBe(7);
    expect(result.chapters[0].topics).toEqual(["evidence", "testimony"]);
    expect(result.chapters[0].keyTerms).toEqual(["hearsay", "objection"]);
    expect(result.chapters[0].markdownContent).toBe("# Round Trip\n\nSome content.");
    expect(result.chapters[0].status).toBe("done");

    // File is reattached from blobMap
    expect(result.chapters[0].file).toBeInstanceOf(File);
  });
});
