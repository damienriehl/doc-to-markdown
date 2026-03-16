import { describe, it, expect } from "vitest";
import { isSupportedFile, filterSupportedFiles, resolveInputs } from "../inputResolver.js";

describe("isSupportedFile", () => {
  it("accepts supported extensions", () => {
    expect(isSupportedFile("chapter1.docx")).toBe(true);
    expect(isSupportedFile("chapter2.pdf")).toBe(true);
    expect(isSupportedFile("notes.rtf")).toBe(true);
    expect(isSupportedFile("report.odt")).toBe(true);
    expect(isSupportedFile("readme.txt")).toBe(true);
  });

  it("accepts case-insensitive extensions", () => {
    expect(isSupportedFile("Chapter.DOCX")).toBe(true);
    expect(isSupportedFile("File.Pdf")).toBe(true);
    expect(isSupportedFile("doc.RTF")).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    expect(isSupportedFile("image.png")).toBe(false);
    expect(isSupportedFile("spreadsheet.xlsx")).toBe(false);
    expect(isSupportedFile("archive.zip")).toBe(false);
    expect(isSupportedFile("noext")).toBe(false);
  });
});

describe("filterSupportedFiles", () => {
  function fakeFile(name) {
    return { name };
  }

  it("separates supported and unsupported files", () => {
    const files = [
      fakeFile("ch1.docx"),
      fakeFile("image.png"),
      fakeFile("ch2.pdf"),
      fakeFile("styles.css"),
      fakeFile("notes.txt"),
    ];
    const { supported, skippedNames } = filterSupportedFiles(files);
    expect(supported.map(f => f.name)).toEqual(["ch1.docx", "ch2.pdf", "notes.txt"]);
    expect(skippedNames).toEqual(["image.png", "styles.css"]);
  });

  it("includes ZIP files as supported", () => {
    const files = [fakeFile("chapters.zip"), fakeFile("data.csv")];
    const { supported, skippedNames } = filterSupportedFiles(files);
    expect(supported.map(f => f.name)).toEqual(["chapters.zip"]);
    expect(skippedNames).toEqual(["data.csv"]);
  });
});

describe("resolveInputs", () => {
  function fakeFile(name) {
    return { name };
  }

  it("passes through supported files", async () => {
    const files = [fakeFile("ch1.docx"), fakeFile("ch2.pdf")];
    const result = await resolveInputs(files);
    expect(result.files.map(f => f.name)).toEqual(["ch1.docx", "ch2.pdf"]);
    expect(result.skippedNames).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("skips unsupported files with names", async () => {
    const files = [fakeFile("ch1.docx"), fakeFile("image.png")];
    const result = await resolveInputs(files);
    expect(result.files.map(f => f.name)).toEqual(["ch1.docx"]);
    expect(result.skippedNames).toEqual(["image.png"]);
  });
});
