/**
 * Browser-side ODT to Markdown converter (basic quality).
 *
 * ODT files are ZIP archives containing XML. This extracts content.xml
 * and walks the ODF XML tree to produce markdown.
 *
 * Handles: headings, paragraphs, bold, italic, links, lists.
 * Does not handle: tables, images, complex styles.
 * For full-quality conversion, use the local API server (Pandoc).
 */

/**
 * Convert an ODT file to markdown (basic quality).
 * Returns { md, numberingLevels, hasHeadingStyles, isBasicQuality }.
 */
export async function convertOdt(file) {
  const JSZip = (await import("jszip")).default;
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // Extract content.xml
  const contentXml = await zip.file("content.xml")?.async("string");
  if (!contentXml) {
    throw new Error("ODT file does not contain content.xml");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(contentXml, "application/xml");

  // Find the body/text element
  const body = doc.getElementsByTagNameNS(
    "urn:oasis:names:tc:opendocument:xmlns:office:1.0", "body"
  )[0];
  const textBody = body?.getElementsByTagNameNS(
    "urn:oasis:names:tc:opendocument:xmlns:office:1.0", "text"
  )[0];

  if (!textBody) {
    throw new Error("ODT content.xml has no text body");
  }

  const md = walkOdfNode(textBody);
  const cleaned = md.replace(/\n{3,}/g, "\n\n").trim();

  return {
    md: cleaned,
    numberingLevels: new Map(),
    hasHeadingStyles: false,
    isBasicQuality: true,
  };
}

const TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const XLINK_NS = "http://www.w3.org/1999/xlink";

function walkOdfNode(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return "";

  const localName = node.localName;
  const ns = node.namespaceURI;
  const children = Array.from(node.childNodes).map(walkOdfNode).join("");

  // text:h — heading
  if (ns === TEXT_NS && localName === "h") {
    const level = parseInt(node.getAttributeNS(TEXT_NS, "outline-level") || "1", 10);
    const hashes = "#".repeat(Math.min(level, 6));
    return `\n${hashes} ${children.trim()}\n\n`;
  }

  // text:p — paragraph
  if (ns === TEXT_NS && localName === "p") {
    const trimmed = children.trim();
    if (!trimmed) return "\n";
    return `${trimmed}\n\n`;
  }

  // text:span — inline styling
  if (ns === TEXT_NS && localName === "span") {
    const styleName = node.getAttributeNS(TEXT_NS, "style-name") || "";
    const lower = styleName.toLowerCase();
    if (lower.includes("bold") || lower.includes("strong")) {
      return `**${children}**`;
    }
    if (lower.includes("italic") || lower.includes("emphasis")) {
      return `*${children}*`;
    }
    return children;
  }

  // text:a — link
  if (ns === TEXT_NS && localName === "a") {
    const href = node.getAttributeNS(XLINK_NS, "href") || "";
    if (href) return `[${children}](${href})`;
    return children;
  }

  // text:list — unordered/ordered list
  if (ns === TEXT_NS && localName === "list") {
    return `\n${children}\n`;
  }

  // text:list-item
  if (ns === TEXT_NS && localName === "list-item") {
    // Flatten to simple bullet points
    const content = children.trim().replace(/\n{2,}/g, "\n");
    return `- ${content}\n`;
  }

  // text:line-break
  if (ns === TEXT_NS && localName === "line-break") {
    return "\n";
  }

  // text:tab
  if (ns === TEXT_NS && localName === "tab") {
    return "\t";
  }

  // text:s — space(s)
  if (ns === TEXT_NS && localName === "s") {
    const count = parseInt(node.getAttributeNS(TEXT_NS, "c") || "1", 10);
    return " ".repeat(count);
  }

  // Default: recurse into children
  return children;
}
