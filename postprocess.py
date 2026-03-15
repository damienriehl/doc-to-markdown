#!/usr/bin/env python3
"""
Markdown Post-Processor
========================
Cleans conversion artifacts from Pandoc/Marker output and injects
YAML front matter optimized for RAG retrieval.
"""

import re
from datetime import date

# ─── Outline Pattern Detection ────────────────────────────────────────────────

_ROMAN_MAP = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def _is_valid_roman(s: str) -> bool:
    """Check if a string is a valid Roman numeral (I–CC)."""
    s = s.upper()
    if not re.match(r"^[IVXLC]+$", s):
        return False
    total = 0
    for i, ch in enumerate(s):
        cur = _ROMAN_MAP.get(ch)
        if cur is None:
            return False
        nxt = _ROMAN_MAP.get(s[i + 1]) if i + 1 < len(s) else None
        if nxt and cur < nxt:
            total -= cur
        else:
            total += cur
    return 0 < total <= 200


_OUTLINE_PATTERNS = [
    ("DECIMAL_MULTI",  re.compile(r"^(\d+(?:\.\d+)+)\s{2,}(.+)$"), None),
    ("DECIMAL_SINGLE", re.compile(r"^(\d+\.)\s{2,}(.+)$"), None),
    ("ROMAN_UPPER",    re.compile(r"^([IVXLC]+\.)\s{2,}(.+)$"),
     lambda m: _is_valid_roman(m.group(1)[:-1])),
    ("UPPER_ALPHA",    re.compile(r"^([A-Z]\.)\s{2,}(.+)$"), None),
    ("NUMERIC_PAREN",  re.compile(r"^(\d+\))\s{2,}(.+)$"), None),
    ("LOWER_ALPHA",    re.compile(r"^([a-z][.)])\s{2,}(.+)$"), None),
    ("ROMAN_LOWER",    re.compile(r"^([ivxlc]+\.)\s{2,}(.+)$"),
     lambda m: _is_valid_roman(m.group(1)[:-1])),
]

_DEFAULT_HIERARCHY = [
    "DECIMAL_MULTI", "DECIMAL_SINGLE", "ROMAN_UPPER", "UPPER_ALPHA",
    "NUMERIC_PAREN", "LOWER_ALPHA", "ROMAN_LOWER",
]


class PostProcessor:
    """Clean and enhance converted Markdown for RAG consumption."""

    def clean(self, text: str) -> str:
        """Remove common conversion artifacts from Markdown text."""
        # Remove stray backslash escapes before punctuation
        text = re.sub(r"\\([.,:;!?'\"\-\(\)\[\]])", r"\1", text)

        # Collapse multiple blank lines to double newline
        text = re.sub(r"\n{3,}", "\n\n", text)

        # Remove trailing whitespace on each line
        text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)

        # Fix broken Markdown links from Pandoc (spaces in URLs)
        text = re.sub(r"\]\(\s+", "](", text)
        text = re.sub(r"\s+\)", ")", text)

        # Strip empty markdown link clusters (Word bookmark artifacts)
        text = re.sub(r"(\[\]\(#?[^)]*\))+", "", text)

        # Remove Word-style smart quotes that survived as escape sequences
        text = text.replace("\u2018", "'").replace("\u2019", "'")
        text = text.replace("\u201c", '"').replace("\u201d", '"')

        # Remove Pandoc's {.unnumbered} and similar attributes on headings
        text = re.sub(r"\s*\{[^}]*\}\s*$", "", text, flags=re.MULTILINE)

        # Normalize heading spacing: ensure blank line before headings
        text = re.sub(r"([^\n])\n(#{1,6}\s)", r"\1\n\n\2", text)

        # Strip leading/trailing whitespace from the whole document
        text = text.strip() + "\n"

        return text

    def normalize_headings(self, text: str) -> str:
        """Ensure heading hierarchy starts at H2 (H1 reserved for title)."""
        lines = text.split("\n")
        # Find the minimum heading level present
        min_level = 6
        for line in lines:
            match = re.match(r"^(#{1,6})\s", line)
            if match:
                level = len(match.group(1))
                min_level = min(min_level, level)

        # If headings start at H1, shift everything down by 1
        if min_level == 1:
            shifted_lines = []
            first_h1_removed = False
            for line in lines:
                match = re.match(r"^(#{1,6})\s(.+)$", line)
                if match:
                    level = len(match.group(1))
                    # Remove the first H1 (it becomes the title in YAML)
                    if level == 1 and not first_h1_removed:
                        first_h1_removed = True
                        continue
                    # Shift remaining headings: H1->H2, H2->H3, etc.
                    new_level = min(level + 1, 6)
                    shifted_lines.append(f"{'#' * new_level} {match.group(2)}")
                else:
                    shifted_lines.append(line)
            return "\n".join(shifted_lines)

        return text

    def detect_and_promote_headings(
        self, text: str, numbering_levels: dict[int, int] | None = None
    ) -> str:
        """Promote outline-numbered lines to markdown headings.

        Uses adaptive detection: scans for outline patterns (2+ spaces after
        label), detects hierarchy from interleaving, and optionally merges
        with DOCX numbering levels for accurate heading depth.

        Args:
            text: Markdown text to process.
            numbering_levels: Optional dict mapping paragraph index to
                outline/numbering level (from python-docx).
        """
        lines = text.split("\n")

        # Pass 1: Scan — identify standalone lines matching outline patterns
        headings: list[dict] = []
        for i, line in enumerate(lines):
            prev_blank = i == 0 or lines[i - 1].strip() == ""
            next_blank = i == len(lines) - 1 or lines[i + 1].strip() == ""
            if not prev_blank or not next_blank:
                continue

            for ptype, regex, validate in _OUTLINE_PATTERNS:
                m = regex.match(line)
                if m and (validate is None or validate(m)):
                    headings.append({
                        "line_idx": i, "type": ptype,
                        "label": m.group(1), "title": m.group(2),
                    })
                    break

        if not headings:
            return text

        # Pass 2: Detect hierarchy via interleaving evidence
        types_found = list(dict.fromkeys(h["type"] for h in headings))
        subordinates: dict[str, set[str]] = {t: set() for t in types_found}
        headings_by_type: dict[str, list[dict]] = {}
        for h in headings:
            headings_by_type.setdefault(h["type"], []).append(h)

        for ptype in types_found:
            entries = headings_by_type[ptype]
            for j in range(len(entries) - 1):
                start_idx = headings.index(entries[j])
                end_idx = headings.index(entries[j + 1])
                for k in range(start_idx + 1, end_idx):
                    subordinates[ptype].add(headings[k]["type"])

        hierarchy = sorted(types_found, key=lambda t: (
            -len(subordinates[t]),
            _DEFAULT_HIERARCHY.index(t) if t in _DEFAULT_HIERARCHY else 99,
        ))
        type_to_rank = {t: i for i, t in enumerate(hierarchy)}

        # Build DOCX paragraph-to-line mapping if available
        para_levels_by_line: dict[int, int] | None = None
        if numbering_levels:
            para_levels_by_line = {}
            para_idx = 0
            in_para = False
            for i in range(len(lines)):
                if lines[i].strip():
                    if not in_para:
                        if para_idx in numbering_levels:
                            para_levels_by_line[i] = numbering_levels[para_idx]
                        para_idx += 1
                        in_para = True
                else:
                    in_para = False

        # Pass 3: Apply — map each heading to its level (H2+)
        heading_set = {h["line_idx"] for h in headings}
        heading_map = {h["line_idx"]: h for h in headings}
        result = []
        for i, line in enumerate(lines):
            if i not in heading_set:
                result.append(line)
                continue
            h = heading_map[i]
            if para_levels_by_line and i in para_levels_by_line:
                level = min(para_levels_by_line[i] + 2, 6)
            else:
                level = min(type_to_rank[h["type"]] + 2, 6)
            result.append(f"{'#' * level} {h['label']} {h['title']}")

        return "\n".join(result)

    def extract_first_heading(self, text: str) -> str | None:
        """Extract the first H1 heading text from Markdown."""
        match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        if match:
            return match.group(1).strip()
        return None

    def inject_yaml_header(
        self, text: str, chapter_config: dict, book_config: dict
    ) -> str:
        """Prepend YAML front matter to the Markdown content."""
        # Try to extract title from document if not in config
        title = chapter_config.get("title") or self.extract_first_heading(text) or "Untitled"

        # Normalize headings (shift H1 → H2, remove duplicate title)
        text = self.normalize_headings(text)

        # Build YAML front matter
        yaml_lines = [
            "---",
            f"title: \"{title}\"",
            f"chapter: {chapter_config.get('chapter', 0)}",
            f"book: \"{book_config.get('book_title', 'Unknown')}\"",
            f"author: \"{book_config.get('book_author', 'Unknown')}\"",
        ]

        topics = chapter_config.get("topics", [])
        if topics:
            yaml_lines.append("topics:")
            for topic in topics:
                yaml_lines.append(f"  - \"{topic}\"")

        key_terms = chapter_config.get("key_terms", [])
        if key_terms:
            yaml_lines.append("key_terms:")
            for term in key_terms:
                yaml_lines.append(f"  - \"{term}\"")

        yaml_lines.append(f"converted_date: \"{date.today().isoformat()}\"")
        yaml_lines.append("---")
        yaml_lines.append("")

        yaml_header = "\n".join(yaml_lines)
        return yaml_header + text


WML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def extract_numbering_from_docx(docx_path: str) -> dict[int, int]:
    """Read outline/numbering levels from DOCX paragraph properties.

    Returns a dict mapping paragraph index to numbering level (0-based).
    Checks outlineLvl first, then falls back to w:numPr/w:ilvl.
    """
    from docx import Document

    doc = Document(docx_path)
    levels: dict[int, int] = {}
    for i, para in enumerate(doc.paragraphs):
        pPr = para._element.find(f"{{{WML_NS}}}pPr")
        if pPr is not None:
            outline_el = pPr.find(f"{{{WML_NS}}}outlineLvl")
            if outline_el is not None:
                levels[i] = int(outline_el.get(f"{{{WML_NS}}}val"))
                continue
        numPr = para._element.find(f".//{{{WML_NS}}}numPr")
        if numPr is not None:
            ilvl = numPr.find(f"{{{WML_NS}}}ilvl")
            if ilvl is not None:
                levels[i] = int(ilvl.get(f"{{{WML_NS}}}val"))
    return levels


if __name__ == "__main__":
    # Quick test
    sample = """# Trial Preparation

## Getting Started

This is a test of the \\post-processor\\.

### Subsection

Multiple


blank


lines above.

Some text with {.unnumbered} artifacts.
"""
    pp = PostProcessor()
    result = pp.clean(sample)
    result = pp.normalize_headings(result)
    print(result)
