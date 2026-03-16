import { useState, useCallback, useRef, useEffect } from "react";
import * as mammoth from "mammoth";
import { resolveInputs, resolveDataTransferItems } from "./inputResolver.js";

// ─── Chapter Number Inference ────────────────────────────────────────────────

const NOISE_RE = /[_\s-]*(FINAL|final|v\d+|draft|revised|\(revised\)|copy|\(copy\))$/gi;

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const ROMAN_MAP = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function parseRoman(str) {
  const s = str.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_MAP[s[i]];
    const next = ROMAN_MAP[s[i + 1]];
    if (!cur) return null;
    if (next && cur < next) {
      total -= cur;
    } else {
      total += cur;
    }
  }
  return total > 0 && total <= 200 ? total : null;
}

function inferChapterNum(filename) {
  const base = filename.replace(/\.(docx|pdf|rtf|odt|txt)$/i, "");
  const cleaned = base.replace(NOISE_RE, "").trim();

  // Strategy 1: Explicit chapter markers — CH1, Ch01, Chapter 3, Chap_04, ch-1
  const chMatch = cleaned.match(/\b(?:ch(?:apter|ap)?)[.\s_-]*(\d+)\b/i);
  if (chMatch) return { num: parseInt(chMatch[1]), strategy: "chapter", confidence: 1 };

  // Strategy 2: Part/Section markers — Part 2, Section 3, Unit 4
  const partMatch = cleaned.match(/\b(?:part|section|unit)[.\s_-]*(\d+)\b/i);
  if (partMatch) return { num: parseInt(partMatch[1]), strategy: "part", confidence: 0.9 };

  // Strategy 3: Roman numerals after chapter marker — Chapter IV, Ch.XII
  const romanChMatch = cleaned.match(/\b(?:ch(?:apter|ap)?)[.\s_-]*([IVXLC]+)\b/i);
  if (romanChMatch) {
    const val = parseRoman(romanChMatch[1]);
    if (val) return { num: val, strategy: "roman", confidence: 0.95 };
  }

  // Strategy 4: Word numbers — Chapter One, Chapter Twelve
  const wordMatch = cleaned.match(/\b(?:ch(?:apter|ap)?)[.\s_-]*(\w+)\b/i);
  if (wordMatch) {
    const val = WORD_NUMBERS[wordMatch[1].toLowerCase()];
    if (val) return { num: val, strategy: "word", confidence: 0.9 };
  }

  // Strategy 5: Ordinals — 1st, 2nd, 3rd, 4th
  const ordMatch = cleaned.match(/\b(\d+)(?:st|nd|rd|th)\b/i);
  if (ordMatch) return { num: parseInt(ordMatch[1]), strategy: "ordinal", confidence: 0.7 };

  // Strategy 6: Leading digits — 01-intro.docx, 3_evidence.docx
  const leadMatch = cleaned.match(/^(\d{1,3})[.\s_-]/);
  if (leadMatch) return { num: parseInt(leadMatch[1]), strategy: "leading", confidence: 0.8 };

  // Strategy 7: Trailing digits — intro-01.docx, evidence_3.docx
  const trailMatch = cleaned.match(/[.\s_-](\d{1,3})$/);
  if (trailMatch) return { num: parseInt(trailMatch[1]), strategy: "trailing", confidence: 0.6 };

  // Strategy 3b: Standalone roman numeral — III, IV (lower confidence)
  const standaloneRoman = cleaned.match(/\b([IVXLC]{1,6})\b/);
  if (standaloneRoman) {
    const val = parseRoman(standaloneRoman[1]);
    if (val) return { num: val, strategy: "roman-standalone", confidence: 0.4 };
  }

  return null;
}

function inferCleanTitle(filename) {
  const base = filename.replace(/\.(docx|pdf|rtf|odt|txt)$/i, "");
  let cleaned = base.replace(NOISE_RE, "").trim();
  // Remove chapter prefixes
  cleaned = cleaned.replace(/^(?:ch(?:apter|ap)?)[.\s_-]*\d*[.\s_-]*/i, "");
  // Remove leading/trailing digits and separators
  cleaned = cleaned.replace(/^\d{1,3}[.\s_-]+/, "").replace(/[.\s_-]+\d{1,3}$/, "");
  // Remove roman numeral prefixes
  cleaned = cleaned.replace(/^[IVXLC]+[.\s_-]+/i, "");
  // Convert separators to spaces, title case
  cleaned = cleaned.replace(/[_-]/g, " ").trim();
  if (!cleaned) return base.replace(/[_-]/g, " ").trim();
  return cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

function applyBatchConsensus(files) {
  const results = files.map(f => ({
    file: f,
    inference: inferChapterNum(f.name),
  }));

  // Count strategies
  const strategyCounts = {};
  results.forEach(r => {
    if (r.inference) {
      strategyCounts[r.inference.strategy] = (strategyCounts[r.inference.strategy] || 0) + 1;
    }
  });

  // Find dominant strategy
  const dominantStrategy = Object.entries(strategyCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  return results.map((r, i) => {
    let num;
    if (r.inference && (!dominantStrategy || r.inference.strategy === dominantStrategy)) {
      num = r.inference.num;
    } else if (r.inference) {
      // Non-dominant strategy — still use it but lower priority
      num = r.inference.num;
    } else {
      num = null;
    }
    return { file: r.file, inferredNum: num, title: inferCleanTitle(r.file.name) };
  });
}


// ─── Utilities ───────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  function walk(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(walk).join("");
    switch (tag) {
      case "h1": return `\n# ${children.trim()}\n\n`;
      case "h2": return `\n## ${children.trim()}\n\n`;
      case "h3": return `\n### ${children.trim()}\n\n`;
      case "h4": return `\n#### ${children.trim()}\n\n`;
      case "h5": return `\n##### ${children.trim()}\n\n`;
      case "h6": return `\n###### ${children.trim()}\n\n`;
      case "p": return `${children.trim()}\n\n`;
      case "br": return "\n";
      case "strong": case "b": return `**${children}**`;
      case "em": case "i": case "u": return `*${children}*`;
      case "a": {
        const href = node.getAttribute("href") || "";
        // Skip empty bookmark anchors (Word artifacts like bookmarkStart → <a id="..."></a>)
        if (!children.trim() && (!href || href.startsWith("#"))) return "";
        return `[${children}](${href})`;
      }
      case "ul": return `\n${children}\n`;
      case "ol": return `\n${children}\n`;
      case "li": {
        const parent = node.parentElement?.tagName.toLowerCase();
        const idx = Array.from(node.parentElement?.children || []).indexOf(node);
        const prefix = parent === "ol" ? `${idx + 1}. ` : "- ";
        return `${prefix}${children.trim()}\n`;
      }
      case "blockquote": return `> ${children.trim()}\n\n`;
      case "code": return `\`${children}\``;
      case "pre": return `\n\`\`\`\n${children.trim()}\n\`\`\`\n\n`;
      case "table": return `\n${processTable(node)}\n`;
      case "img": {
        const alt = node.getAttribute("alt") || "";
        const src = node.getAttribute("src") || "";
        return `![${alt}](${src})`;
      }
      case "sup": return `^${children}^`;
      case "sub": return `~${children}~`;
      default: return children;
    }
  }
  function processTable(tableNode) {
    const rows = Array.from(tableNode.querySelectorAll("tr"));
    if (!rows.length) return "";
    const result = [];
    rows.forEach((row, i) => {
      const cells = Array.from(row.querySelectorAll("th, td"));
      const line = "| " + cells.map(c => walk(c).trim().replace(/\n/g, " ")).join(" | ") + " |";
      result.push(line);
      if (i === 0) {
        result.push("| " + cells.map(() => "---").join(" | ") + " |");
      }
    });
    return result.join("\n");
  }
  let md = walk(doc.body);
  md = md.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return md;
}

function cleanMarkdown(text) {
  let t = text;
  t = t.replace(/\\([.,:;!?'"\-()[\]])/g, "$1");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/[ \t]+$/gm, "");
  t = t.replace(/\]\(\s+/g, "](");
  t = t.replace(/\u2018|\u2019/g, "'");
  t = t.replace(/\u201c|\u201d/g, '"');
  t = t.replace(/\s*\{[^}]*\}\s*$/gm, "");
  // Strip empty markdown link clusters (belt-and-suspenders for Word bookmark artifacts)
  t = t.replace(/(\[\]\(#?[^)]*\))+/g, "");
  t = t.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");
  // Replace tabs with spaces in heading lines
  t = t.replace(/^(#{1,6}\s.*)$/gm, line => line.replace(/\t/g, " "));
  return t.trim() + "\n";
}

// ─── Adaptive Outline Heading Detection ──────────────────────────────────────

const OUTLINE_TYPES = [
  { type: "DECIMAL_MULTI",  regex: /^(\d+(?:\.\d+)+)(?:\t| {2,})(.+)$/ },
  { type: "DECIMAL_SINGLE", regex: /^(\d+\.)(?:\t| {2,})(.+)$/ },
  { type: "ROMAN_UPPER",    regex: /^([IVXLC]+\.)(?:\t| {2,})(.+)$/, validate: m => parseRoman(m[1].slice(0, -1)) !== null },
  { type: "UPPER_ALPHA",    regex: /^([A-Z]\.)(?:\t| {2,})(.+)$/ },
  { type: "NUMERIC_PAREN",  regex: /^(\d+\))(?:\t| {2,})(.+)$/ },
  { type: "LOWER_ALPHA",    regex: /^([a-z][.)])(?:\t| {2,})(.+)$/ },
  { type: "ROMAN_LOWER",    regex: /^([ivxlc]+\.)(?:\t| {2,})(.+)$/, validate: m => parseRoman(m[1].slice(0, -1)) !== null },
];

const DEFAULT_HIERARCHY = [
  "DECIMAL_MULTI", "DECIMAL_SINGLE", "ROMAN_UPPER", "UPPER_ALPHA",
  "NUMERIC_PAREN", "LOWER_ALPHA", "ROMAN_LOWER",
];

function detectAndPromoteHeadings(text, numberingLevels = null) {
  const lines = text.split("\n");

  // Pass 1: Scan — identify standalone lines matching outline patterns with 2+ spaces
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevBlank = i === 0 || lines[i - 1].trim() === "";
    const nextBlank = i === lines.length - 1 || lines[i + 1].trim() === "";
    if (!prevBlank || !nextBlank) continue;

    for (const { type, regex, validate } of OUTLINE_TYPES) {
      const m = line.match(regex);
      if (m && (!validate || validate(m))) {
        headings.push({ lineIdx: i, type, label: m[1], title: m[2] });
        break;
      }
    }
  }

  if (headings.length === 0) return text;

  // Pass 2: Detect hierarchy via interleaving evidence
  const typesFound = [...new Set(headings.map(h => h.type))];
  const subordinates = new Map(typesFound.map(t => [t, new Set()]));
  const headingsByType = {};
  for (const h of headings) {
    (headingsByType[h.type] ||= []).push(h);
  }
  for (const type of typesFound) {
    const entries = headingsByType[type];
    for (let j = 0; j < entries.length - 1; j++) {
      const startIdx = headings.indexOf(entries[j]);
      const endIdx = headings.indexOf(entries[j + 1]);
      for (let k = startIdx + 1; k < endIdx; k++) {
        subordinates.get(type).add(headings[k].type);
      }
    }
  }
  const hierarchy = [...typesFound].sort((a, b) => {
    const diff = subordinates.get(b).size - subordinates.get(a).size;
    return diff !== 0 ? diff : DEFAULT_HIERARCHY.indexOf(a) - DEFAULT_HIERARCHY.indexOf(b);
  });
  const typeToRank = Object.fromEntries(hierarchy.map((t, i) => [t, i]));

  // Build mammoth paragraph-to-line mapping if available
  let paraLevelsByLine = null;
  if (numberingLevels && numberingLevels.size > 0) {
    paraLevelsByLine = new Map();
    let paraIdx = 0;
    let inPara = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== "") {
        if (!inPara) {
          if (numberingLevels.has(paraIdx)) {
            paraLevelsByLine.set(i, numberingLevels.get(paraIdx));
          }
          paraIdx++;
          inPara = true;
        }
      } else {
        inPara = false;
      }
    }
  }

  // Pass 3: Apply — map each heading to its level (H2+)
  const headingSet = new Set(headings.map(h => h.lineIdx));
  const headingMap = Object.fromEntries(headings.map(h => [h.lineIdx, h]));
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (!headingSet.has(i)) {
      result.push(lines[i]);
      continue;
    }
    const h = headingMap[i];
    let level;
    if (paraLevelsByLine && paraLevelsByLine.has(i)) {
      // Use mammoth numbering: level 0 → H2, level 1 → H3, etc.
      level = Math.min(paraLevelsByLine.get(i) + 2, 6);
    } else {
      // Use text-detected hierarchy: rank 0 → H2, rank 1 → H3, etc.
      level = Math.min(typeToRank[h.type] + 2, 6);
    }
    result.push(`${"#".repeat(level)} ${h.label} ${h.title}`);
  }

  return result.join("\n");
}

function extractFirstHeading(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function normalizeHeadings(text) {
  const lines = text.split("\n");
  let firstH1Removed = false;
  const hasH1 = lines.some(l => /^#\s/.test(l));
  if (!hasH1) return text;
  return lines
    .map(line => {
      const m = line.match(/^(#{1,6})\s(.+)$/);
      if (!m) return line;
      const level = m[1].length;
      if (level === 1 && !firstH1Removed) { firstH1Removed = true; return null; }
      const newLevel = Math.min(level + 1, 6);
      return "#".repeat(newLevel) + " " + m[2];
    })
    .filter(l => l !== null)
    .join("\n");
}

function buildYamlHeader(chapter, book) {
  const lines = [
    "---",
    `title: "${chapter.title}"`,
    `chapter: ${chapter.chapterNum}`,
    `book: "${book.title}"`,
    `author: "${book.author}"`,
  ];
  if (chapter.topics.length) {
    lines.push("topics:");
    chapter.topics.forEach(t => lines.push(`  - "${t}"`));
  }
  if (chapter.keyTerms.length) {
    lines.push("key_terms:");
    chapter.keyTerms.forEach(t => lines.push(`  - "${t}"`));
  }
  lines.push(`converted_date: "${new Date().toISOString().split("T")[0]}"`);
  lines.push("---", "");
  return lines.join("\n");
}

function buildIndexFile(chapters, book) {
  const sorted = [...chapters].sort((a, b) => a.chapterNum - b.chapterNum);
  const lines = [
    "---",
    `title: "Index and Cross-Reference Guide"`,
    `chapter: 0`,
    `book: "${book.title}"`,
    `author: "${book.author}"`,
    `topics:`,
    `  - "index"`,
    `  - "cross-reference"`,
    `  - "table of contents"`,
    `  - "overview"`,
    `converted_date: "${new Date().toISOString().split("T")[0]}"`,
    "---", "",
    `# ${book.title}: Index and Cross-Reference Guide`, "",
    `*${book.author}*`, "",
    "## Chapter Overview", "",
    "| Chapter | Title | Key Topics |",
    "|---------|-------|------------|",
  ];
  sorted.forEach(ch => {
    const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
    const topics = ch.topics.slice(0, 4).join(", ");
    lines.push(`| ${ch.chapterNum} | ${ch.title} (\`${fn}\`) | ${topics} |`);
  });
  lines.push("", "## Chapter Summaries", "");
  sorted.forEach(ch => {
    lines.push(`### Chapter ${ch.chapterNum}: ${ch.title}`, "");
    if (ch.topics.length) lines.push(`This chapter covers: ${ch.topics.join(", ")}.`, "");
    if (ch.keyTerms.length) lines.push(`Key terms: ${ch.keyTerms.join(", ")}.`, "");
  });
  lines.push("## Master Key Terms Index", "");
  const allTerms = {};
  sorted.forEach(ch => {
    ch.keyTerms.forEach(t => {
      if (!allTerms[t]) allTerms[t] = [];
      allTerms[t].push(ch.chapterNum);
    });
  });
  Object.keys(allTerms).sort().forEach(term => {
    const refs = allTerms[term].map(n => `Ch. ${n}`).join(", ");
    lines.push(`- **${term}**: ${refs}`);
  });
  lines.push("");
  return lines.join("\n");
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── YAML Refresh & Download Utilities ───────────────────────────────────────

function stripYamlFrontMatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

function refreshYaml(chapter, book) {
  const stripped = stripYamlFrontMatter(chapter.markdownContent);
  return buildYamlHeader(chapter, book) + stripped;
}

function generateCombinedMarkdown(chapters, book) {
  const done = [...chapters]
    .filter(c => c.status === "done")
    .sort((a, b) => a.chapterNum - b.chapterNum);
  const parts = [
    `# ${book.title || "Untitled Book"}`,
    "",
    `*${book.author || "Unknown Author"}*`,
    "",
  ];
  for (const ch of done) {
    parts.push("---", "");
    parts.push(`# Chapter ${ch.chapterNum}: ${ch.title}`);
    parts.push("");
    parts.push(stripYamlFrontMatter(ch.markdownContent));
    parts.push("");
  }
  return parts.join("\n");
}

async function generateZip(chapters, book) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const done = [...chapters]
    .filter(c => c.status === "done")
    .sort((a, b) => a.chapterNum - b.chapterNum);
  for (const ch of done) {
    const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
    zip.file(fn, refreshYaml(ch, book));
  }
  if (done.length > 0) {
    zip.file("00-index.md", buildIndexFile(done, book));
  }
  zip.file("00-complete-book.md", generateCombinedMarkdown(chapters, book));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(book.title || "book")}-markdown.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── DOCX Conversion ─────────────────────────────────────────────────────────

async function convertDocx(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Collect Word numbering levels per paragraph index
  const numberingLevels = new Map();
  let paraIdx = 0;
  let hasHeadingStyles = false;

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      transformDocument: mammoth.transforms.paragraph(function(paragraph) {
        const styleName = paragraph.styleName || "";
        const styleId = paragraph.styleId || "";

        // Auto-detect heading styles: "Head 1", "Head 2", "Head1Ch1", etc.
        let headingLevel = null;
        const headMatch = styleName.match(/\bhead(?:ing)?\s*(\d)/i)
          || styleId.match(/\bhead(?:ing)?(\d)/i);
        if (headMatch) {
          headingLevel = parseInt(headMatch[1], 10);
        } else if (/ch\s*title|chtitle/i.test(styleName + styleId)) {
          headingLevel = 0; // chapter title → H1
        }

        if (headingLevel !== null) {
          hasHeadingStyles = true;
          // Head1 → H2, Head2 → H3, Head3 → H4; ChTitle → H1
          const actualLevel = headingLevel === 0 ? 1 : Math.min(headingLevel + 1, 6);
          paraIdx++;
          return {
            ...paragraph,
            styleId: `Heading${actualLevel}`,
            styleName: `Heading ${actualLevel}`,
            numbering: null, // strip numbering to prevent list rendering
          };
        }

        if (paragraph.numbering) {
          numberingLevels.set(paraIdx, parseInt(paragraph.numbering.level, 10));
        }
        paraIdx++;
        return paragraph;
      })
    }
  );

  let md = htmlToMarkdown(result.value);
  md = cleanMarkdown(md);
  return { md, numberingLevels, hasHeadingStyles };
}

// ─── TXT Conversion ─────────────────────────────────────────────────────────

async function convertTxt(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    // Fallback: try reading as Windows-1252 if UTF-8 fails
    const buf = await file.arrayBuffer();
    const decoder = new TextDecoder("windows-1252");
    text = decoder.decode(buf);
  }
  // Preserve paragraphs as markdown paragraphs
  const md = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .join("\n\n");
  return { md, numberingLevels: new Map(), hasHeadingStyles: false };
}

// ─── Components ──────────────────────────────────────────────────────────────

function BookMeta({ book, onChange }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
      <div style={{ flex: 2 }}>
        <label style={labelStyle}>Book Title</label>
        <input
          style={inputStyle}
          value={book.title}
          onChange={e => onChange({ ...book, title: e.target.value })}
          placeholder="e.g. Trialbook"
        />
      </div>
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>Author</label>
        <input
          style={inputStyle}
          value={book.author}
          onChange={e => onChange({ ...book, author: e.target.value })}
          placeholder="e.g. Damien Riehl"
        />
      </div>
    </div>
  );
}

function UploadZone({ onFiles, onSkipped, onError, onResolving, compact }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const folderInputRef = useRef(null);

  const handleFolderInput = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length) processFiles(files);
    // Reset so the same folder can be selected again
    e.target.value = "";
  };

  const processFiles = useCallback(async (rawFiles) => {
    onResolving?.(true);
    try {
      const { files, skippedNames, errors } = await resolveInputs(rawFiles);
      if (skippedNames.length) onSkipped?.(skippedNames);
      if (errors.length) onError?.(errors);
      if (files.length) onFiles(files);
    } finally {
      onResolving?.(false);
    }
  }, [onFiles, onSkipped, onError, onResolving]);

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      if (!e.dataTransfer.types.includes("Files")) return;
      setDragOver(false);
      // Use webkitGetAsEntry for folder support (must capture entries synchronously)
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const rawFiles = await resolveDataTransferItems(items);
        if (rawFiles.length) processFiles(rawFiles);
      } else {
        const files = Array.from(e.dataTransfer.files).filter(
          f => /\.(docx|pdf|rtf|odt|txt|zip)$/i.test(f.name)
        );
        if (files.length) processFiles(files);
      }
    },
    [processFiles]
  );
  const handleFileInput = e => {
    const files = Array.from(e.target.files);
    if (files.length) processFiles(files);
  };

  if (compact) {
    return (
      <div
        onDragOver={e => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: `2px ${dragOver ? "solid var(--accent)" : "dashed var(--border)"}`,
          cursor: "pointer",
          background: dragOver ? "var(--accent-bg)" : "transparent",
          transition: "all 0.25s ease",
          marginBottom: 16,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".docx,.pdf,.rtf,.odt,.txt,.zip"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
        <span style={{
          fontSize: 20,
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          background: "var(--accent-bg)",
          color: "var(--accent)",
          fontWeight: 700,
        }}>+</span>
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory=""
          style={{ display: "none" }}
          onChange={handleFolderInput}
        />
        <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--font-body)" }}>
          Drop more files or click to add
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
          style={{
            marginLeft: "auto",
            padding: "4px 10px",
            fontSize: 11,
            border: "1px solid var(--border)",
            borderRadius: 5,
            background: "transparent",
            color: "var(--muted)",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
          title="Select a folder of chapter files"
        >&#128193; Folder</button>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 12,
        padding: "48px 24px",
        textAlign: "center",
        cursor: "pointer",
        background: dragOver ? "var(--accent-bg)" : "var(--card)",
        transition: "all 0.25s ease",
        marginBottom: 24,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".docx,.pdf,.rtf,.odt,.txt,.zip"
        style={{ display: "none" }}
        onChange={handleFileInput}
      />
      <div style={{ fontSize: 36, marginBottom: 8 }}>&#128196;</div>
      <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 600, fontFamily: "var(--font-body)" }}>
        Drop DOCX, PDF, RTF, ODT, TXT, or ZIP files here
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontFamily: "var(--font-body)" }}>
        or click to browse
      </div>
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        style={{ display: "none" }}
        onChange={handleFolderInput}
      />
      <button
        onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
        style={{
          marginTop: 12,
          padding: "6px 14px",
          fontSize: 12,
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "transparent",
          color: "var(--muted)",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
        }}
        title="Select a folder of chapter files"
      >&#128193; Select Folder</button>
    </div>
  );
}

function ChapterRow({ ch, index, total, onUpdate, onRemove, onMove, onPreview, onDownload, onDragStart, onDragOver, onDragEnd, onDrop, dragOverPos }) {
  const [expanded, setExpanded] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [termInput, setTermInput] = useState("");
  const fileTypeIcons = { docx: "\uD83D\uDCD7", pdf: "\uD83D\uDCD5", rtf: "\uD83D\uDCC4", odt: "\uD83D\uDCD8", txt: "\uD83D\uDCDD" };
  const fileTypeIcon = fileTypeIcons[ch.fileType] || "\uD83D\uDCC4";
  const statusColors = {
    pending: "var(--muted)",
    converting: "var(--accent)",
    done: "#22c55e",
    "done-basic": "#f59e0b",
    error: "#ef4444",
    "pdf-notice": "#f59e0b",
    "needs-server": "#f59e0b",
  };

  const dragClassName = [
    "chapter-row",
    ch._dragging ? "dragging" : "",
    dragOverPos === "top" ? "drag-over-top" : "",
    dragOverPos === "bottom" ? "drag-over-bottom" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={dragClassName}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        marginBottom: 10,
        background: "var(--card)",
        overflow: "hidden",
        animation: "fadeSlideIn 0.3s ease both",
        animationDelay: `${index * 40}ms`,
      }}
      onDragOver={e => {
        if (e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        onDragOver(e, index);
      }}
      onDrop={e => {
        if (e.dataTransfer.types.includes("Files")) return;
        onDrop(e, index);
      }}
    >
      <div
        draggable
        onDragStart={e => onDragStart(e, index)}
        onDragEnd={onDragEnd}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          cursor: "grab",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontSize: 14, color: "var(--muted)", cursor: "grab", userSelect: "none" }} title="Drag to reorder">&#x2630;</span>
        <span style={{ fontSize: 18, minWidth: 28, textAlign: "center" }}>{fileTypeIcon}</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--accent)",
            background: "var(--accent-bg)",
            padding: "2px 8px",
            borderRadius: 4,
            fontWeight: 700,
          }}
        >
          {String(ch.chapterNum).padStart(2, "0")}
        </span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14, fontFamily: "var(--font-body)", color: "var(--text)" }}>
          {ch.title || ch.fileName}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{ch.fileName}</span>
        {ch.status === "converting" ? (
          <span style={{
            width: 12,
            height: 12,
            border: "2px solid var(--accent-dim)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
            display: "inline-block",
            flexShrink: 0,
          }} />
        ) : (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColors[ch.status] || "var(--muted)",
              flexShrink: 0,
            }}
          />
        )}
        {ch.status === "done" && (
          <>
            <button style={linkBtnStyle} onClick={e => { e.stopPropagation(); onPreview(ch); }} title="Preview">Preview</button>
            <button style={linkBtnStyle} onClick={e => { e.stopPropagation(); onDownload(ch); }} title="Download">&#11015;</button>
          </>
        )}
        <span style={{ fontSize: 12, color: "var(--muted)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>&#9660;</span>
      </div>
      <div
        style={{
          maxHeight: expanded ? 500 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10, marginTop: 12 }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input style={inputStyle} value={ch.title} onChange={e => onUpdate({ ...ch, title: e.target.value, slug: slugify(e.target.value) })} />
            </div>
            <div>
              <label style={labelStyle}>Slug</label>
              <input style={inputStyle} value={ch.slug} onChange={e => onUpdate({ ...ch, slug: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Chapter #</label>
              <input style={inputStyle} type="number" min={1} value={ch.chapterNum} onChange={e => onUpdate({ ...ch, chapterNum: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <label style={labelStyle}>Topics</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {ch.topics.map((t, i) => (
                  <span key={i} style={tagStyle}>
                    {t}
                    <span
                      onClick={e => { e.stopPropagation(); onUpdate({ ...ch, topics: ch.topics.filter((_, j) => j !== i) }); }}
                      style={{ cursor: "pointer", marginLeft: 4, opacity: 0.6 }}
                    >&times;</span>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={topicInput}
                  onChange={e => setTopicInput(e.target.value)}
                  placeholder="Add topic"
                  onKeyDown={e => {
                    if (e.key === "Enter" && topicInput.trim()) {
                      onUpdate({ ...ch, topics: [...ch.topics, topicInput.trim()] });
                      setTopicInput("");
                    }
                  }}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Key Terms</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                {ch.keyTerms.map((t, i) => (
                  <span key={i} style={tagStyle}>
                    {t}
                    <span
                      onClick={e => { e.stopPropagation(); onUpdate({ ...ch, keyTerms: ch.keyTerms.filter((_, j) => j !== i) }); }}
                      style={{ cursor: "pointer", marginLeft: 4, opacity: 0.6 }}
                    >&times;</span>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={termInput}
                  onChange={e => setTermInput(e.target.value)}
                  placeholder="Add key term"
                  onKeyDown={e => {
                    if (e.key === "Enter" && termInput.trim()) {
                      onUpdate({ ...ch, keyTerms: [...ch.keyTerms, termInput.trim()] });
                      setTermInput("");
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...smallBtnStyle, fontSize: 11, padding: "3px 8px" }} onClick={() => onMove(index, -1)} disabled={index === 0} title="Move up">&uarr;</button>
              <button style={{ ...smallBtnStyle, fontSize: 11, padding: "3px 8px" }} onClick={() => onMove(index, 1)} disabled={index === total - 1} title="Move down">&darr;</button>
            </div>
            <button style={{ ...smallBtnStyle, color: "#ef4444", borderColor: "#ef4444" }} onClick={() => onRemove(ch.id)}>Remove</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadBar({ chapters, book, converting }) {
  const done = chapters.filter(c => c.status === "done");
  const total = chapters.filter(c => ["docx", "rtf", "odt", "txt"].includes(c.fileType)).length;

  const downloadAllIndividual = () => {
    const sorted = [...done].sort((a, b) => a.chapterNum - b.chapterNum);
    sorted.forEach((ch, i) => {
      setTimeout(() => {
        const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
        downloadFile(fn, refreshYaml(ch, book));
      }, i * 200);
    });
    if (sorted.length > 0) {
      setTimeout(() => {
        downloadFile("00-index.md", buildIndexFile(sorted, book));
      }, sorted.length * 200);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "14px 0",
      marginBottom: 16,
      borderBottom: "1px solid var(--border)",
      flexWrap: "wrap",
    }}>
      <button
        style={{ ...primaryBtnStyle, opacity: done.length === 0 ? 0.5 : 1 }}
        onClick={() => generateZip(chapters, book)}
        disabled={done.length === 0}
      >
        &#128230; Download Zip
      </button>
      <button
        style={{ ...secondaryBtnStyle, opacity: done.length === 0 ? 0.5 : 1 }}
        onClick={() => {
          const combined = generateCombinedMarkdown(chapters, book);
          downloadFile("00-complete-book.md", combined);
        }}
        disabled={done.length === 0}
      >
        &#11015; Combined
      </button>
      <button
        style={{ ...linkBtnStyle, opacity: done.length === 0 ? 0.5 : 1 }}
        onClick={downloadAllIndividual}
        disabled={done.length === 0}
      >
        All Individual
      </button>
      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-body)" }}>
        {converting
          ? `Converting ${done.length} of ${total}\u2026`
          : `${done.length} file${done.length !== 1 ? "s" : ""} ready`}
      </span>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--muted)",
  marginBottom: 4,
  fontFamily: "var(--font-body)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s ease",
};

const tagStyle = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 4,
  background: "var(--accent-bg)",
  color: "var(--accent)",
  fontFamily: "var(--font-body)",
  fontWeight: 500,
};

const smallBtnStyle = {
  padding: "4px 10px",
  fontSize: 12,
  border: "1px solid var(--border)",
  borderRadius: 5,
  background: "transparent",
  color: "var(--muted)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
};

const primaryBtnStyle = {
  padding: "10px 24px",
  fontSize: 14,
  fontWeight: 700,
  border: "none",
  borderRadius: 8,
  background: "var(--accent)",
  color: "#fff",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  letterSpacing: "0.01em",
  boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
};

const secondaryBtnStyle = {
  padding: "10px 24px",
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid var(--accent)",
  borderRadius: 8,
  background: "transparent",
  color: "var(--accent)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
};

const linkBtnStyle = {
  background: "none",
  border: "none",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  padding: "2px 6px",
};

const fileRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--card)",
  transition: "box-shadow 0.15s ease",
};

// ─── Main App ────────────────────────────────────────────────────────────────

export default function RAGConverter() {
  const [book, setBook] = useState({ title: "", author: "" });
  const [chapters, setChapters] = useState([]);
  const [converting, setConverting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [dragState, setDragState] = useState({ sourceIndex: null, overIndex: null, overPos: null });
  const [resolving, setResolving] = useState(false);
  const [skippedFiles, setSkippedFiles] = useState([]);
  const [importErrors, setImportErrors] = useState([]);

  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const bookRef = useRef(book);
  bookRef.current = book;
  const convertingRef = useRef(false);
  const conversionTimeoutRef = useRef(null);

  const addFiles = useCallback((files) => {
    const inferred = applyBatchConsensus(files);

    // Determine next available chapter number
    setChapters(prev => {
      const usedNums = new Set(prev.map(c => c.chapterNum));
      let nextNum = prev.length + 1;

      const newChapters = inferred.map((item, i) => {
        let num = item.inferredNum;
        if (num == null || usedNums.has(num)) {
          while (usedNums.has(nextNum)) nextNum++;
          num = nextNum++;
        }
        usedNums.add(num);

        return {
          id: crypto.randomUUID(),
          file: item.file,
          fileName: item.file.name,
          fileType: /\.pdf$/i.test(item.file.name) ? "pdf"
            : /\.rtf$/i.test(item.file.name) ? "rtf"
            : /\.odt$/i.test(item.file.name) ? "odt"
            : /\.txt$/i.test(item.file.name) ? "txt"
            : "docx",
          title: item.title,
          slug: slugify(item.title),
          chapterNum: num,
          topics: [],
          keyTerms: [],
          markdownContent: "",
          status: "pending",
        };
      });

      // Sort by chapter number
      const all = [...prev, ...newChapters];
      all.sort((a, b) => a.chapterNum - b.chapterNum);
      return all;
    });
  }, []);

  const updateChapter = useCallback((updated) => {
    setChapters(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  }, []);

  const removeChapter = useCallback((id) => {
    setChapters(prev => prev.filter(c => c.id !== id));
  }, []);

  const moveChapter = useCallback((index, direction) => {
    setChapters(prev => {
      const arr = [...prev];
      const target = index + direction;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  }, []);

  // ─── Drag-and-drop handlers ───
  const handleDragStart = useCallback((e, index) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    setDragState(prev => ({ ...prev, sourceIndex: index }));
    setChapters(prev => prev.map((c, i) => i === index ? { ...c, _dragging: true } : c));
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? "top" : "bottom";
    setDragState(prev => ({ ...prev, overIndex: index, overPos: pos }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ sourceIndex: null, overIndex: null, overPos: null });
    setChapters(prev => prev.map(c => {
      if (c._dragging) {
        const { _dragging, ...rest } = c;
        return rest;
      }
      return c;
    }));
  }, []);

  const handleDrop = useCallback((e, targetIndex) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) {
      handleDragEnd();
      return;
    }

    setChapters(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(sourceIndex, 1);
      // Adjust target for the removed item
      let insertAt = targetIndex;
      if (sourceIndex < targetIndex) insertAt--;
      if (dragState.overPos === "bottom") insertAt++;
      insertAt = Math.max(0, Math.min(insertAt, arr.length));
      arr.splice(insertAt, 0, moved);
      return arr;
    });

    handleDragEnd();
  }, [dragState.overPos, handleDragEnd]);

  // ─── Auto-conversion ───
  const runConversion = useCallback(async () => {
    if (convertingRef.current) return;
    convertingRef.current = true;
    setConverting(true);

    // Mark PDFs as pdf-notice, RTF/ODT as needs-server (until Phase 4 adds JS converters)
    setChapters(prev => prev.map(ch => {
      if (ch.status !== "pending") return ch;
      if (ch.fileType === "pdf") return { ...ch, status: "pdf-notice" };
      if (ch.fileType === "rtf" || ch.fileType === "odt") return { ...ch, status: "needs-server" };
      return ch;
    }));

    // Get pending DOCX and TXT files to convert
    const toConvert = chaptersRef.current.filter(c => c.status === "pending" && ["docx", "txt"].includes(c.fileType));

    for (const ch of toConvert) {
      setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, status: "converting" } : c));

      try {
        const converter = ch.fileType === "txt" ? convertTxt : convertDocx;
        const { md: rawMd, numberingLevels, hasHeadingStyles } = await converter(ch.file);
        let md = rawMd;
        const detectedTitle = extractFirstHeading(md);

        md = normalizeHeadings(md);
        if (!hasHeadingStyles) {
          md = detectAndPromoteHeadings(md, numberingLevels);
        }
        md = cleanMarkdown(md);

        setChapters(prev => prev.map(c => {
          if (c.id !== ch.id) return c;
          const title = (detectedTitle && !c.title) ? detectedTitle : c.title;
          const slug = (detectedTitle && !c.title) ? slugify(detectedTitle) : c.slug;
          const yaml = buildYamlHeader({ ...c, title, slug }, bookRef.current);
          return {
            ...c,
            title,
            slug,
            markdownContent: yaml + md,
            status: "done",
          };
        }));
      } catch (err) {
        console.error(`Error converting ${ch.fileName}:`, err);
        setChapters(prev => prev.map(c => c.id === ch.id ? { ...c, status: "error" } : c));
      }
    }

    convertingRef.current = false;
    setConverting(false);
  }, []);

  // Auto-trigger conversion 800ms after pending files appear
  useEffect(() => {
    const convertableTypes = ["docx", "txt"];
    const serverOnlyTypes = ["pdf", "rtf", "odt"];
    const hasPending = chapters.some(c => c.status === "pending" && convertableTypes.includes(c.fileType));
    const hasServerPending = chapters.some(c => c.status === "pending" && serverOnlyTypes.includes(c.fileType));

    if (hasServerPending) {
      setChapters(prev => prev.map(ch => {
        if (ch.status !== "pending") return ch;
        if (ch.fileType === "pdf") return { ...ch, status: "pdf-notice" };
        if (ch.fileType === "rtf" || ch.fileType === "odt") return { ...ch, status: "needs-server" };
        return ch;
      }));
    }

    if (!hasPending || convertingRef.current) return;

    if (conversionTimeoutRef.current) clearTimeout(conversionTimeoutRef.current);
    conversionTimeoutRef.current = setTimeout(runConversion, 800);

    return () => {
      if (conversionTimeoutRef.current) clearTimeout(conversionTimeoutRef.current);
    };
  }, [chapters, runConversion]);

  // ─── Page-level file drop handler ───
  const handlePageDragOver = useCallback(e => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
    }
  }, []);

  const handlePageDrop = useCallback(async (e) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setResolving(true);
    try {
      // Use webkitGetAsEntry for folder support
      let rawFiles;
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        rawFiles = await resolveDataTransferItems(items);
      } else {
        rawFiles = Array.from(e.dataTransfer.files).filter(
          f => /\.(docx|pdf|rtf|odt|txt|zip)$/i.test(f.name)
        );
      }
      if (!rawFiles.length) return;
      const { files, skippedNames, errors } = await resolveInputs(rawFiles);
      if (skippedNames.length) setSkippedFiles(prev => [...prev, ...skippedNames]);
      if (errors.length) setImportErrors(prev => [...prev, ...errors]);
      if (files.length) addFiles(files);
    } finally {
      setResolving(false);
    }
  }, [addFiles]);

  // ─── Derived state ───
  const doneChapters = chapters.filter(c => c.status === "done");
  const pdfNotice = chapters.filter(c => c.status === "pdf-notice");
  const needsServer = chapters.filter(c => c.status === "needs-server");
  const errors = chapters.filter(c => c.status === "error");
  const indexContent = doneChapters.length ? buildIndexFile(doneChapters, book) : null;

  return (
    <div
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
      style={{
        "--bg": "#faf9f7",
        "--card": "#ffffff",
        "--border": "#e5e2dc",
        "--text": "#1a1814",
        "--muted": "#8a8478",
        "--accent": "#2563eb",
        "--accent-dim": "#dbeafe",
        "--accent-bg": "#eff6ff",
        "--font-body": "'Source Sans 3', 'Source Sans Pro', system-ui, sans-serif",
        "--font-mono": "'IBM Plex Mono', 'SF Mono', monospace",
        minHeight: "100%",
        fontFamily: "var(--font-body)",
        color: "var(--text)",
        padding: "32px 24px",
        maxWidth: 780,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
          RAG Converter
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0", lineHeight: 1.5 }}>
          Convert DOCX, PDF, RTF, ODT, and TXT chapters to RAG-optimized Markdown &mdash; with YAML metadata, heading normalization, and a cross-reference index.
        </p>
      </div>

      <BookMeta book={book} onChange={setBook} />

      <UploadZone
        onFiles={addFiles}
        onSkipped={names => setSkippedFiles(prev => [...prev, ...names])}
        onError={errs => setImportErrors(prev => [...prev, ...errs])}
        onResolving={setResolving}
        compact={chapters.length > 0}
      />

      {/* Download bar — visible when any conversions exist */}
      {(doneChapters.length > 0 || converting) && (
        <DownloadBar chapters={chapters} book={book} converting={converting} />
      )}

      {/* Resolving indicator (ZIP extraction / folder scanning) */}
      {resolving && (
        <div style={{
          padding: 16,
          background: "var(--accent-bg)",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          fontFamily: "var(--font-body)",
          color: "var(--accent)",
        }}>
          Extracting files&hellip;
        </div>
      )}

      {/* Skipped files notice (dismissible) */}
      {skippedFiles.length > 0 && (
        <div style={{
          padding: "12px 16px",
          background: "#fef3c7",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          fontFamily: "var(--font-body)",
          color: "#92400e",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}>
          <div>
            <strong>{skippedFiles.length} file{skippedFiles.length > 1 ? "s" : ""} skipped</strong> (unsupported: {skippedFiles.slice(0, 5).join(", ")}{skippedFiles.length > 5 ? `, +${skippedFiles.length - 5} more` : ""})
          </div>
          <button
            onClick={() => setSkippedFiles([])}
            style={{ background: "none", border: "none", color: "#92400e", cursor: "pointer", fontSize: 16, padding: "0 0 0 8px", lineHeight: 1 }}
          >&times;</button>
        </div>
      )}

      {/* Import errors */}
      {importErrors.length > 0 && (
        <div style={{
          padding: "12px 16px",
          background: "#fef2f2",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          fontFamily: "var(--font-body)",
          color: "#991b1b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}>
          <div>
            <strong>Import error{importErrors.length > 1 ? "s" : ""}:</strong> {importErrors.join("; ")}
          </div>
          <button
            onClick={() => setImportErrors([])}
            style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer", fontSize: 16, padding: "0 0 0 8px", lineHeight: 1 }}
          >&times;</button>
        </div>
      )}

      {/* Converting indicator */}
      {converting && (
        <div style={{
          padding: 16,
          background: "var(--accent-bg)",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          fontFamily: "var(--font-body)",
          color: "var(--accent)",
          backgroundImage: "linear-gradient(90deg, var(--accent-bg) 0%, var(--accent-dim) 50%, var(--accent-bg) 100%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}>
          Converting files via mammoth.js&hellip; DOCX files convert in-browser. PDF files require CLI tools.
        </div>
      )}

      {/* File list */}
      {chapters.length > 0 && (
        <div className="fade-in">
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            Drag to reorder. Click to expand and edit metadata.
          </p>

          {/* Index file row (when converted chapters exist) */}
          {indexContent && (
            <div style={{ ...fileRowStyle, marginBottom: 10 }} className="fade-slide-in">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, flex: 1, color: "var(--text)" }}>00-index.md</span>
              <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-body)" }}>Index</span>
              <button style={linkBtnStyle} onClick={() => setPreview({ name: "00-index.md", content: indexContent })}>Preview</button>
              <button style={linkBtnStyle} onClick={() => downloadFile("00-index.md", indexContent)}>&#11015;</button>
            </div>
          )}

          {chapters.map((ch, i) => (
            <ChapterRow
              key={ch.id}
              ch={ch}
              index={i}
              total={chapters.length}
              onUpdate={updateChapter}
              onRemove={removeChapter}
              onMove={moveChapter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              dragOverPos={dragState.overIndex === i ? dragState.overPos : null}
              onPreview={ch => {
                const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
                setPreview({ name: fn, content: refreshYaml(ch, book) });
              }}
              onDownload={ch => {
                const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
                downloadFile(fn, refreshYaml(ch, book));
              }}
            />
          ))}
        </div>
      )}

      {/* Notices */}
      {pdfNotice.length > 0 && (
        <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8, marginBottom: 16, fontSize: 13, fontFamily: "var(--font-body)", color: "#92400e" }}>
          <strong>{pdfNotice.length} PDF file{pdfNotice.length > 1 ? "s" : ""} skipped.</strong> Start the local API server (<code>python server.py</code>) for browser-based PDF conversion, or use the CLI toolkit (<code>convert.py</code>).
        </div>
      )}

      {needsServer.length > 0 && (
        <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8, marginBottom: 16, fontSize: 13, fontFamily: "var(--font-body)", color: "#92400e" }}>
          <strong>{needsServer.length} RTF/ODT file{needsServer.length > 1 ? "s" : ""} awaiting conversion.</strong> Start the local API server (<code>python server.py</code>) for best quality, or these will convert with basic formatting when browser-side support loads.
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, marginBottom: 16, fontSize: 13, fontFamily: "var(--font-body)", color: "#991b1b" }}>
          <strong>{errors.length} file{errors.length > 1 ? "s" : ""} failed.</strong> Check the console for details.
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
            display: "flex", justifyContent: "center", alignItems: "center", padding: 24,
            animation: "fadeIn 0.15s ease",
          }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{
              background: "var(--bg)", borderRadius: 12, width: "100%", maxWidth: 720,
              maxHeight: "80vh", display: "flex", flexDirection: "column",
              border: "1px solid var(--border)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
              animation: "fadeSlideIn 0.2s ease",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{preview.name}</span>
              <button style={{ ...linkBtnStyle, fontSize: 18 }} onClick={() => setPreview(null)}>&times;</button>
            </div>
            <pre style={{
              flex: 1, overflow: "auto", padding: 20, margin: 0,
              fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6,
              color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {preview.content}
            </pre>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-body)" }}>
        DOCX and TXT convert in-browser. PDF, RTF, and ODT require the local API server (<code>python server.py</code>) or CLI tools. Press Enter after typing a topic or key term to add it.
      </div>
    </div>
  );
}
