import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { slugify } from "../serverApi.js";

// --- slugify (pure function, no mocking needed) ---

describe("slugify", () => {
  it("converts spaces and special chars to hyphens", () => {
    expect(slugify("My Project Name")).toBe("my-project-name");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  Weird!!  Name  ")).toBe("weird-name");
  });

  it("returns 'untitled' for empty string", () => {
    expect(slugify("")).toBe("untitled");
  });

  it("returns 'untitled' for only special chars", () => {
    expect(slugify("!!!")).toBe("untitled");
  });

  it("handles already-slugified input", () => {
    expect(slugify("already-a-slug")).toBe("already-a-slug");
  });

  it("collapses multiple hyphens into one", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });
});

// --- Server API functions with mocked fetch ---

describe("saveProjectToServer", () => {
  let saveProjectToServer;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    // Dynamic import to pick up the stubbed fetch
    const mod = await import("../serverApi.js");
    saveProjectToServer = mod.saveProjectToServer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs to /projects/{slug} with metadata FormData", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slug: "my-project", path: "./projects/my-project" }),
    });
    const result = await saveProjectToServer("my-project", { id: "p1", name: "My Project" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain("/projects/my-project");
    expect(opts.method).toBe("POST");
    expect(result).toEqual({ slug: "my-project", path: "./projects/my-project" });
  });

  it("returns null and does not throw when server is unreachable", async () => {
    fetch.mockRejectedValueOnce(new Error("Network error"));
    const result = await saveProjectToServer("test", { id: "p1" });
    expect(result).toBeNull();
  });

  it("returns null when server responds with error status", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await saveProjectToServer("test", { id: "p1" });
    expect(result).toBeNull();
  });
});

describe("renameProjectOnServer", () => {
  let renameProjectOnServer;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    const mod = await import("../serverApi.js");
    renameProjectOnServer = mod.renameProjectOnServer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PUTs to /projects/{oldSlug}/rename with new_slug FormData", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slug: "new-name", path: "./projects/new-name" }),
    });
    const result = await renameProjectOnServer("old-name", "new-name");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain("/projects/old-name/rename");
    expect(opts.method).toBe("PUT");
    expect(result.slug).toBe("new-name");
  });

  it("returns null when server is unreachable", async () => {
    fetch.mockRejectedValueOnce(new Error("Network error"));
    const result = await renameProjectOnServer("old", "new");
    expect(result).toBeNull();
  });
});

describe("deleteProjectOnServer", () => {
  let deleteProjectOnServer;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    const mod = await import("../serverApi.js");
    deleteProjectOnServer = mod.deleteProjectOnServer;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DELETEs /projects/{slug}", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ deleted: true, slug: "my-project" }),
    });
    const result = await deleteProjectOnServer("my-project");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain("/projects/my-project");
    expect(opts.method).toBe("DELETE");
    expect(result.deleted).toBe(true);
  });

  it("returns null when server is unreachable", async () => {
    fetch.mockRejectedValueOnce(new Error("Network error"));
    const result = await deleteProjectOnServer("test");
    expect(result).toBeNull();
  });
});
