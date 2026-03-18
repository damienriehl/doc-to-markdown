import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { smartFilename, saveFile, saveBlob, _resetCachedHandleForTest } from "../fileSaver.js";

// NOTE: fileSaver.js uses globalThis.showSaveFilePicker, globalThis.document, and
// globalThis.URL. We stub showSaveFilePicker via vi.stubGlobal. For URL methods and
// document we use vi.spyOn to avoid breaking Vitest's own module resolution (which uses
// `new URL(...)` internally and would break if we replace the URL constructor).

// ─── smartFilename ────────────────────────────────────────────────────────────

describe("smartFilename", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("chapter: zero-pads chapterNum and title-cases slug", () => {
    expect(smartFilename("chapter", { chapterNum: 3, slug: "jury-selection" }))
      .toBe("2026-03-18 03-Jury-Selection.md");
  });

  it("chapter: two-digit chapterNum is not padded further", () => {
    expect(smartFilename("chapter", { chapterNum: 12, slug: "closing-arguments" }))
      .toBe("2026-03-18 12-Closing-Arguments.md");
  });

  it("chapter: single-word slug title-cased", () => {
    expect(smartFilename("chapter", { chapterNum: 1, slug: "introduction" }))
      .toBe("2026-03-18 01-Introduction.md");
  });

  it("index: returns YYYY-MM-DD 00-index.md", () => {
    expect(smartFilename("index")).toBe("2026-03-18 00-index.md");
  });

  it("combined: returns YYYY-MM-DD 00-complete-book.md", () => {
    expect(smartFilename("combined")).toBe("2026-03-18 00-complete-book.md");
  });

  it("zip: lowercased slugified title + -markdown.zip", () => {
    expect(smartFilename("zip", { bookTitle: "Trialbook" }))
      .toBe("2026-03-18 trialbook-markdown.zip");
  });

  it("zip: multi-word title is lowercased and hyphenated", () => {
    expect(smartFilename("zip", { bookTitle: "Trial Book Pro" }))
      .toBe("2026-03-18 trial-book-pro-markdown.zip");
  });

  it("zip: empty bookTitle falls back to 'book'", () => {
    expect(smartFilename("zip", { bookTitle: "" }))
      .toBe("2026-03-18 book-markdown.zip");
  });
});

// ─── saveFile — fallback (anchor-click) path ─────────────────────────────────

describe("saveFile — fallback path (no showSaveFilePicker)", () => {
  let mockAnchor;
  let createObjectURLSpy;
  let revokeObjectURLSpy;
  let mockDocument;

  beforeEach(() => {
    // Make sure showSaveFilePicker does NOT exist
    vi.stubGlobal("showSaveFilePicker", undefined);

    mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };

    mockDocument = {
      createElement: vi.fn((tag) => tag === "a" ? mockAnchor : {}),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };
    vi.stubGlobal("document", mockDocument);

    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates anchor with correct download attribute and blob URL", async () => {
    await saveFile("test.md", "hello content");

    expect(mockDocument.createElement).toHaveBeenCalledWith("a");
    expect(mockAnchor.download).toBe("test.md");
    expect(mockAnchor.href).toBe("blob:fake-url");
    expect(mockAnchor.click).toHaveBeenCalledOnce();
    expect(mockDocument.body.appendChild).toHaveBeenCalledWith(mockAnchor);
    expect(mockDocument.body.removeChild).toHaveBeenCalledWith(mockAnchor);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:fake-url");
  });
});

// ─── saveFile — showSaveFilePicker path ──────────────────────────────────────

describe("saveFile — showSaveFilePicker path", () => {
  let mockWritable;
  let mockFileHandle;
  let mockShowSaveFilePicker;

  beforeEach(() => {
    // Reset module-level cachedFileHandle so each test starts fresh
    _resetCachedHandleForTest();

    mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };

    mockShowSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle);
    vi.stubGlobal("showSaveFilePicker", mockShowSaveFilePicker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls showSaveFilePicker with suggestedName and writes content", async () => {
    await saveFile("chapter.md", "# Chapter");

    expect(mockShowSaveFilePicker).toHaveBeenCalledOnce();
    const callArgs = mockShowSaveFilePicker.mock.calls[0][0];
    expect(callArgs.suggestedName).toBe("chapter.md");
    expect(mockWritable.write).toHaveBeenCalledWith("# Chapter");
    expect(mockWritable.close).toHaveBeenCalledOnce();
  });

  it("AbortError: does nothing (no fallback triggered)", async () => {
    const abortError = new DOMException("User aborted", "AbortError");
    mockShowSaveFilePicker.mockRejectedValue(abortError);

    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL");
    await saveFile("chapter.md", "# Chapter");

    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it("first call uses 'downloads' as startIn (no cached handle yet)", async () => {
    await saveFile("first.md", "content");

    const firstCallArgs = mockShowSaveFilePicker.mock.calls[0][0];
    expect(firstCallArgs.startIn).toBe("downloads");
  });

  it("directory memory: second call passes cached handle as startIn", async () => {
    // Use fresh mocks that track calls independently
    const writeable1 = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const handle1 = { createWritable: vi.fn().mockResolvedValue(writeable1) };
    const writeable2 = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const handle2 = { createWritable: vi.fn().mockResolvedValue(writeable2) };

    mockShowSaveFilePicker
      .mockResolvedValueOnce(handle1)
      .mockResolvedValueOnce(handle2);

    await saveFile("first.md", "content one");
    await saveFile("second.md", "content two");

    expect(mockShowSaveFilePicker).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockShowSaveFilePicker.mock.calls[1][0];
    // After first successful save, the handle from first call is cached and passed as startIn
    expect(secondCallArgs.startIn).toBe(handle1);
  });
});

// ─── saveFile — forceFallback option ─────────────────────────────────────────

describe("saveFile — forceFallback option", () => {
  let mockAnchor;
  let mockShowSaveFilePicker;
  let mockDocument;

  beforeEach(() => {
    mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };

    mockShowSaveFilePicker = vi.fn();
    vi.stubGlobal("showSaveFilePicker", mockShowSaveFilePicker);

    mockDocument = {
      createElement: vi.fn((tag) => tag === "a" ? mockAnchor : {}),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };
    vi.stubGlobal("document", mockDocument);

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forceFallback: skips showSaveFilePicker and uses anchor-click", async () => {
    await saveFile("batch.md", "content", { forceFallback: true });

    expect(mockShowSaveFilePicker).not.toHaveBeenCalled();
    expect(mockAnchor.click).toHaveBeenCalledOnce();
  });
});

// ─── saveBlob ─────────────────────────────────────────────────────────────────

describe("saveBlob — showSaveFilePicker path", () => {
  let mockWritable;
  let mockFileHandle;
  let mockShowSaveFilePicker;

  beforeEach(() => {
    _resetCachedHandleForTest();

    mockWritable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockFileHandle = {
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };

    mockShowSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle);
    vi.stubGlobal("showSaveFilePicker", mockShowSaveFilePicker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls showSaveFilePicker and writes blob to stream", async () => {
    const blob = new Blob(["zip data"], { type: "application/zip" });
    await saveBlob("archive.zip", blob);

    expect(mockShowSaveFilePicker).toHaveBeenCalledOnce();
    const callArgs = mockShowSaveFilePicker.mock.calls[0][0];
    expect(callArgs.suggestedName).toBe("archive.zip");
    expect(mockWritable.write).toHaveBeenCalledWith(blob);
    expect(mockWritable.close).toHaveBeenCalledOnce();
  });

  it("AbortError: does nothing", async () => {
    const abortError = new DOMException("User aborted", "AbortError");
    mockShowSaveFilePicker.mockRejectedValue(abortError);

    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL");
    const blob = new Blob(["data"]);
    await saveBlob("archive.zip", blob);

    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });
});

describe("saveBlob — fallback path (no showSaveFilePicker)", () => {
  let mockAnchor;
  let mockDocument;

  beforeEach(() => {
    vi.stubGlobal("showSaveFilePicker", undefined);

    mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
    };

    mockDocument = {
      createElement: vi.fn((tag) => tag === "a" ? mockAnchor : {}),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };
    vi.stubGlobal("document", mockDocument);

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fallback: uses anchor-click with blob directly", async () => {
    const blob = new Blob(["zip data"], { type: "application/zip" });
    await saveBlob("archive.zip", blob);

    expect(mockAnchor.download).toBe("archive.zip");
    expect(mockAnchor.click).toHaveBeenCalledOnce();
  });
});
