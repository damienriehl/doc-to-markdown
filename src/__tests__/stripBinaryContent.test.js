import { describe, it, expect } from "vitest";
import { stripImageEmbeds } from "../stripImages.js";

describe("stripImageEmbeds", () => {
  it("Test 1: data URI with alt text becomes [Image: alt]", () => {
    const md = "![photo](data:image/png;base64,iVBOR...)";
    expect(stripImageEmbeds(md)).toBe("[Image: photo]");
  });

  it("Test 2: data URI with no alt becomes [Image removed]", () => {
    const md = "![](data:image/jpeg;base64,/9j/4A...)";
    expect(stripImageEmbeds(md)).toBe("[Image removed]");
  });

  it("Test 3: media/ path with alt becomes [Image: alt]", () => {
    const md = "![diagram](media/image1.png)";
    expect(stripImageEmbeds(md)).toBe("[Image: diagram]");
  });

  it("Test 4: media/ path with no alt becomes [Image removed]", () => {
    const md = "![](media/image2.png)";
    expect(stripImageEmbeds(md)).toBe("[Image removed]");
  });

  it("Test 5: LaTeX math expressions are NOT stripped", () => {
    const md = "$E = mc^2$ and $$\\int_0^1 f(x)dx$$";
    const result = stripImageEmbeds(md);
    expect(result).toBe("$E = mc^2$ and $$\\int_0^1 f(x)dx$$");
    expect(result).not.toContain("Image");
  });

  it("Test 6: external URL images are NOT stripped", () => {
    const md = "![chart](https://example.com/chart.png)";
    const result = stripImageEmbeds(md);
    expect(result).toBe("![chart](https://example.com/chart.png)");
  });

  it("Test 7: multiple images in one string are all replaced", () => {
    const md =
      "Text ![a](data:image/png;base64,abc) more ![b](media/img.png) end";
    const result = stripImageEmbeds(md);
    expect(result).toBe("Text [Image: a] more [Image: b] end");
  });

  it("Test 8: audio embeds (data:audio/) are also stripped", () => {
    const md = "![fig](data:audio/mpeg;base64,AAAA...)";
    expect(stripImageEmbeds(md)).toBe("[Image: fig]");
  });
});
