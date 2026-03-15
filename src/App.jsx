import { useState, useCallback, useRef, useEffect } from "react";
import * as mammoth from "mammoth";

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
  const base = filename.replace(/\.(docx|pdf)$/i, "");
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
  const base = filename.replace(/\.(docx|pdf)$/i, "");
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

// ─── Components ──────────────────────────────────────────────────────────────

const STEPS = ["upload", "configure", "output"];
const STEP_LABELS = ["Upload Files", "Configure Chapters", "Convert & Download"];

function StepIndicator({ current, onNav }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 32 }}>
      {STEPS.map((step, i) => {
        const active = STEPS.indexOf(current) >= i;
        const isCurrent = current === step;
        return (
          <button
            key={step}
            onClick={() => onNav(step)}
            style={{
              flex: 1,
              padding: "14px 8px",
              background: isCurrent ? "var(--accent)" : active ? "var(--accent-dim)" : "var(--card)",
              color: isCurrent ? "#fff" : active ? "var(--accent)" : "var(--muted)",
              border: "1px solid var(--border)",
              borderRight: i < 2 ? "none" : "1px solid var(--border)",
              borderRadius: i === 0 ? "8px 0 0 8px" : i === 2 ? "0 8px 8px 0" : 0,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: isCurrent ? 700 : 500,
              fontFamily: "var(--font-body)",
              letterSpacing: "0.02em",
              transition: "all 0.2s",
            }}
          >
            <span style={{ opacity: 0.6, marginRight: 6 }}>{i + 1}.</span>
            {STEP_LABELS[i]}
          </button>
        );
      })}
    </div>
  );
}

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

function UploadZone({ onFiles }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const handleDrop = useCallback(
    e => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter(
        f => f.name.endsWith(".docx") || f.name.endsWith(".pdf")
      );
      if (files.length) onFiles(files);
    },
    [onFiles]
  );
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
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
        accept=".docx,.pdf"
        style={{ display: "none" }}
        onChange={e => {
          const files = Array.from(e.target.files);
          if (files.length) onFiles(files);
        }}
      />
      <div style={{ fontSize: 36, marginBottom: 8 }}>&#128196;</div>
      <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 600, fontFamily: "var(--font-body)" }}>
        Drop DOCX or PDF files here
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontFamily: "var(--font-body)" }}>
        or click to browse
      </div>
    </div>
  );
}

function ChapterRow({ ch, index, total, onUpdate, onRemove, onMove, onDragStart, onDragOver, onDragEnd, onDrop, dragOverPos }) {
  const [expanded, setExpanded] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [termInput, setTermInput] = useState("");
  const fileTypeIcon = ch.fileType === "docx" ? "\uD83D\uDCD8" : "\uD83D\uDCD5";
  const statusColors = {
    pending: "var(--muted)",
    converting: "var(--accent)",
    done: "#22c55e",
    error: "#ef4444",
    "pdf-notice": "#f59e0b",
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
        e.preventDefault();
        onDragOver(e, index);
      }}
      onDrop={e => onDrop(e, index)}
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
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: statusColors[ch.status] || "var(--muted)",
          }}
        />
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

function OutputView({ chapters, book, converting, onConvert }) {
  const converted = chapters.filter(c => c.status === "done");
  const pdfNotice = chapters.filter(c => c.status === "pdf-notice");
  const errors = chapters.filter(c => c.status === "error");
  const [preview, setPreview] = useState(null);

  const indexContent = converted.length ? buildIndexFile(converted, book) : null;

  const downloadAll = () => {
    converted.forEach(ch => {
      const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
      downloadFile(fn, ch.markdownContent);
    });
    if (indexContent) {
      setTimeout(() => downloadFile("00-index.md", indexContent), 300);
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <button style={primaryBtnStyle} onClick={onConvert} disabled={converting}>
          {converting ? "Converting\u2026" : `Convert ${chapters.length} Chapter${chapters.length !== 1 ? "s" : ""}`}
        </button>
        {converted.length > 0 && (
          <button style={secondaryBtnStyle} onClick={downloadAll}>
            &#11015; Download All ({converted.length + 1} files)
          </button>
        )}
      </div>

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
          Converting files via mammoth.js&hellip; DOCX files convert in-browser. PDF files require CLI tools (Marker or PyMuPDF4LLM).
        </div>
      )}

      {pdfNotice.length > 0 && (
        <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8, marginBottom: 16, fontSize: 13, fontFamily: "var(--font-body)", color: "#92400e" }}>
          <strong>{pdfNotice.length} PDF file{pdfNotice.length > 1 ? "s" : ""} skipped.</strong> Browser-based PDF conversion lacks the structural detection that Marker provides. Use the CLI toolkit (<code>convert.py</code>) for PDF files.
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, marginBottom: 16, fontSize: 13, fontFamily: "var(--font-body)", color: "#991b1b" }}>
          <strong>{errors.length} file{errors.length > 1 ? "s" : ""} failed.</strong> Check the console for details.
        </div>
      )}

      {/* File list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {indexContent && (
          <div style={fileRowStyle} className="fade-slide-in">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, flex: 1, color: "var(--text)" }}>00-index.md</span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-body)" }}>Index</span>
            <button style={linkBtnStyle} onClick={() => setPreview({ name: "00-index.md", content: indexContent })}>Preview</button>
            <button style={linkBtnStyle} onClick={() => downloadFile("00-index.md", indexContent)}>&#11015;</button>
          </div>
        )}
        {[...chapters].sort((a, b) => a.chapterNum - b.chapterNum).map((ch, i) => {
          const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
          const done = ch.status === "done";
          return (
            <div
              key={ch.id}
              className="fade-slide-in"
              style={{
                ...fileRowStyle,
                opacity: done ? 1 : 0.5,
                animationDelay: `${(i + 1) * 50}ms`,
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, flex: 1, color: "var(--text)" }}>{fn}</span>
              <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-body)" }}>{ch.title}</span>
              <span style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                padding: "2px 6px",
                borderRadius: 4,
                background: done ? "#dcfce7" : ch.status === "pdf-notice" ? "#fef3c7" : ch.status === "error" ? "#fef2f2" : "var(--card)",
                color: done ? "#166534" : ch.status === "pdf-notice" ? "#92400e" : ch.status === "error" ? "#991b1b" : "var(--muted)",
              }}>
                {ch.status === "done" ? "\u2713" : ch.status === "pdf-notice" ? "PDF" : ch.status === "error" ? "\u2717" : "\u2014"}
              </span>
              {done && <button style={linkBtnStyle} onClick={() => setPreview({ name: fn, content: ch.markdownContent })}>Preview</button>}
              {done && <button style={linkBtnStyle} onClick={() => downloadFile(fn, ch.markdownContent)}>&#11015;</button>}
            </div>
          );
        })}
      </div>

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
  const [step, setStep] = useState("upload");
  const [book, setBook] = useState({ title: "", author: "" });
  const [chapters, setChapters] = useState([]);
  const [converting, setConverting] = useState(false);
  const [dragState, setDragState] = useState({ sourceIndex: null, overIndex: null, overPos: null });

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
          fileType: item.file.name.endsWith(".pdf") ? "pdf" : "docx",
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

  const runConversion = useCallback(async () => {
    setConverting(true);
    const updated = [...chapters];
    for (let i = 0; i < updated.length; i++) {
      const ch = { ...updated[i] };
      if (ch.fileType === "pdf") {
        ch.status = "pdf-notice";
        updated[i] = ch;
        setChapters([...updated]);
        continue;
      }
      ch.status = "converting";
      updated[i] = ch;
      setChapters([...updated]);
      try {
        const { md: rawMd, numberingLevels, hasHeadingStyles } = await convertDocx(ch.file);
        let md = rawMd;
        const detectedTitle = extractFirstHeading(md);
        if (detectedTitle && !ch.title) {
          ch.title = detectedTitle;
          ch.slug = slugify(detectedTitle);
        }
        md = normalizeHeadings(md);
        // Only use text-based detection if mammoth didn't find heading styles
        if (!hasHeadingStyles) {
          md = detectAndPromoteHeadings(md, numberingLevels);
        }
        md = cleanMarkdown(md);
        const yaml = buildYamlHeader(ch, book);
        ch.markdownContent = yaml + md;
        ch.status = "done";
      } catch (err) {
        console.error(`Error converting ${ch.fileName}:`, err);
        ch.status = "error";
      }
      updated[i] = ch;
      setChapters([...updated]);
    }
    setConverting(false);
    setStep("output");
  }, [chapters, book]);

  return (
    <div
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
          Convert DOCX chapters to RAG-optimized Markdown &mdash; with YAML metadata, heading normalization, and a cross-reference index.
        </p>
      </div>

      <BookMeta book={book} onChange={setBook} />
      <StepIndicator current={step} onNav={setStep} />

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="fade-in">
          <UploadZone onFiles={addFiles} />
          {chapters.length > 0 && (
            <>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                {chapters.length} file{chapters.length !== 1 ? "s" : ""} queued
              </div>
              {chapters.map((ch, i) => (
                <div key={ch.id} className="fade-slide-in" style={{ ...fileRowStyle, marginBottom: 6, animationDelay: `${i * 40}ms` }}>
                  <span style={{ fontSize: 16 }}>{ch.fileType === "docx" ? "\uD83D\uDCD8" : "\uD83D\uDCD5"}</span>
                  <span style={{ flex: 1, fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text)" }}>{ch.fileName}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>Ch. {ch.chapterNum}</span>
                  <button style={{ ...linkBtnStyle, color: "#ef4444" }} onClick={() => removeChapter(ch.id)}>&times;</button>
                </div>
              ))}
              <button style={{ ...primaryBtnStyle, marginTop: 16 }} onClick={() => setStep("configure")}>
                Configure Chapters &rarr;
              </button>
            </>
          )}
        </div>
      )}

      {/* Step: Configure */}
      {step === "configure" && (
        <div className="fade-in">
          {chapters.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>No files uploaded. Go back to Step 1.</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
                Drag chapters to reorder. Click to expand and edit title, slug, topics, and key terms.
              </p>
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
                />
              ))}
              <button style={{ ...primaryBtnStyle, marginTop: 16 }} onClick={() => { setStep("output"); }}>
                Convert &amp; Download &rarr;
              </button>
            </>
          )}
        </div>
      )}

      {/* Step: Output */}
      {step === "output" && (
        <OutputView
          chapters={chapters}
          book={book}
          converting={converting}
          onConvert={runConversion}
        />
      )}

      {/* Footer */}
      <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-body)" }}>
        DOCX converts in-browser via mammoth.js. PDF files require CLI tools &mdash; use the <code>convert.py</code> script with Marker or PyMuPDF4LLM. Press Enter after typing a topic or key term to add it.
      </div>
    </div>
  );
}
