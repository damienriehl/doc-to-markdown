/**
 * Browser-side RTF to Markdown converter (basic quality).
 *
 * Strips RTF control words and extracts text content.
 * Preserves basic structure (paragraphs) but loses most formatting.
 * For full-quality conversion, use the local API server (Pandoc).
 */

/**
 * Strip RTF control sequences and return plain text.
 * Based on the RTF spec: control words start with \, groups use { }.
 */
function stripRtf(rtfString) {
  // Remove header groups: {\fonttbl...}, {\colortbl...}, {\stylesheet...}, {\info...}
  let text = rtfString.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|object|rsidtbl|generator|mmathPr|themedata|colorschememapping|datastore|latentstyles)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "");

  // Remove {\*\...} destination groups (optional destinations)
  text = text.replace(/\{\\\*\\[a-z]+[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, "");

  // Convert paragraph breaks
  text = text.replace(/\\par\b\s*/g, "\n\n");
  text = text.replace(/\\line\b\s*/g, "\n");

  // Convert tabs
  text = text.replace(/\\tab\b\s*/g, "\t");

  // Handle special characters
  text = text.replace(/\\emdash\b/g, "\u2014");
  text = text.replace(/\\endash\b/g, "\u2013");
  text = text.replace(/\\lquote\b/g, "\u2018");
  text = text.replace(/\\rquote\b/g, "\u2019");
  text = text.replace(/\\ldblquote\b/g, "\u201C");
  text = text.replace(/\\rdblquote\b/g, "\u201D");
  text = text.replace(/\\bullet\b/g, "\u2022");
  text = text.replace(/\\\{/g, "{");
  text = text.replace(/\\\}/g, "}");
  text = text.replace(/\\\\/g, "\\");

  // Handle unicode escapes: \'XX (hex byte)
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // Handle \uN (unicode decimal) followed by a replacement char
  text = text.replace(/\\u(\d+)[?]?/g, (_, dec) =>
    String.fromCharCode(parseInt(dec, 10))
  );
  // Negative unicode values
  text = text.replace(/\\u(-\d+)[?]?/g, (_, dec) =>
    String.fromCharCode(parseInt(dec, 10) + 65536)
  );

  // Remove remaining control words (keep their trailing space if present)
  text = text.replace(/\\[a-z]+[-]?\d*\s?/gi, "");

  // Remove group braces
  text = text.replace(/[{}]/g, "");

  // Clean up whitespace
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\r/g, "\n");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Convert an RTF file to markdown (basic quality).
 * Returns { md, numberingLevels, hasHeadingStyles, isBasicQuality }.
 */
export async function convertRtf(file) {
  const text = await file.text();
  const stripped = stripRtf(text);

  // Split into paragraphs and build markdown
  const paragraphs = stripped.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const md = paragraphs.join("\n\n");

  return {
    md,
    numberingLevels: new Map(),
    hasHeadingStyles: false,
    isBasicQuality: true,
  };
}
