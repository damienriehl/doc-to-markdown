import { describe, it, expect } from "vitest";
import { convertRtf } from "../convertRtf.js";

describe("convertRtf", () => {
  function fakeRtfFile(content) {
    return {
      text: () => Promise.resolve(content),
      name: "test.rtf",
    };
  }

  it("extracts plain text from basic RTF", async () => {
    const rtf = String.raw`{\rtf1\ansi{\fonttbl\f0 Times New Roman;}\f0\fs24 Hello World}`;
    const result = await fakeRtfFile(rtf).text().then(text => {
      // Simulate the stripRtf logic inline for testing
      return convertRtf(fakeRtfFile(rtf));
    });
    expect(result.md).toContain("Hello World");
    expect(result.isBasicQuality).toBe(true);
  });

  it("converts paragraph breaks", async () => {
    const rtf = String.raw`{\rtf1 First paragraph\par Second paragraph}`;
    const result = await convertRtf(fakeRtfFile(rtf));
    expect(result.md).toContain("First paragraph");
    expect(result.md).toContain("Second paragraph");
  });

  it("handles special characters", async () => {
    const rtf = String.raw`{\rtf1 em\emdash dash and \lquote quotes\rquote}`;
    const result = await convertRtf(fakeRtfFile(rtf));
    expect(result.md).toContain("\u2014");
    expect(result.md).toContain("\u2018");
    expect(result.md).toContain("\u2019");
  });

  it("handles hex escapes", async () => {
    const rtf = String.raw`{\rtf1 caf\'e9}`;
    const result = await convertRtf(fakeRtfFile(rtf));
    expect(result.md).toContain("café");
  });

  it("returns empty numberingLevels and hasHeadingStyles false", async () => {
    const rtf = String.raw`{\rtf1 test}`;
    const result = await convertRtf(fakeRtfFile(rtf));
    expect(result.numberingLevels.size).toBe(0);
    expect(result.hasHeadingStyles).toBe(false);
  });
});
