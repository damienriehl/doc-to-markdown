#!/usr/bin/env python3
"""
Index File Generator
=====================
Creates a cross-reference index file (00-index.md) that bridges
chapters for RAG retrieval. This file acts as a retrieval scaffold:
when a query spans multiple chapters, the index file's chunks surface
and point the AI toward the right chapter content.
"""

from datetime import date
from pathlib import Path


# Cross-reference mappings: concepts that span multiple chapters.
# Customize these for your textbook's actual cross-references.
CROSS_REFERENCES = [
    {
        "concept": "Impeachment",
        "locations": [
            {"chapter": 3, "context": "Impeachment techniques during cross-examination"},
            {"chapter": 4, "context": "Evidentiary foundations for impeachment exhibits"},
        ],
    },
    {
        "concept": "Expert Witnesses",
        "locations": [
            {"chapter": 1, "context": "Preparing expert witnesses for trial"},
            {"chapter": 3, "context": "Qualifying and examining expert witnesses"},
            {"chapter": 4, "context": "Admitting expert reports and exhibits"},
        ],
    },
    {
        "concept": "Hearsay",
        "locations": [
            {"chapter": 3, "context": "Hearsay objections during witness examination"},
            {"chapter": 4, "context": "Hearsay exceptions and exhibit admission"},
        ],
    },
    {
        "concept": "Motions in Limine",
        "locations": [
            {"chapter": 1, "context": "Pretrial motion strategy and preparation"},
            {"chapter": 2, "context": "Drafting and arguing motions in limine"},
        ],
    },
    {
        "concept": "Foundation",
        "locations": [
            {"chapter": 3, "context": "Laying foundation through witness testimony"},
            {"chapter": 4, "context": "Foundation requirements for exhibit admission"},
        ],
    },
]


def generate_index(
    chapters: list[dict], book_config: dict, output_path: Path
) -> None:
    """Generate the cross-reference index file."""
    lines = [
        "---",
        f"title: \"Index and Cross-Reference Guide\"",
        "chapter: 0",
        f"book: \"{book_config.get('book_title', 'Unknown')}\"",
        f"author: \"{book_config.get('book_author', 'Unknown')}\"",
        "topics:",
        '  - "index"',
        '  - "cross-reference"',
        '  - "table of contents"',
        '  - "overview"',
        f"converted_date: \"{date.today().isoformat()}\"",
        "---",
        "",
        f"# {book_config.get('book_title', 'Unknown')}: Index and Cross-Reference Guide",
        "",
        f"*{book_config.get('book_author', 'Unknown')}*",
        "",
        "## Chapter Overview",
        "",
    ]

    # Chapter summaries table
    lines.append("| Chapter | Title | Key Topics |")
    lines.append("|---------|-------|------------|")
    for ch in sorted(chapters, key=lambda c: c.get("chapter", 0)):
        num = ch.get("chapter", "?")
        title = ch.get("title", "Untitled")
        topics = ", ".join(ch.get("topics", [])[:4])
        filename = f"{num:02d}-{ch.get('slug', 'unknown')}.md"
        lines.append(f"| {num} | {title} (`{filename}`) | {topics} |")

    lines.append("")

    # Chapter detail sections
    lines.append("## Chapter Summaries")
    lines.append("")
    for ch in sorted(chapters, key=lambda c: c.get("chapter", 0)):
        num = ch.get("chapter", "?")
        title = ch.get("title", "Untitled")
        lines.append(f"### Chapter {num}: {title}")
        lines.append("")

        topics = ch.get("topics", [])
        if topics:
            lines.append(f"This chapter covers: {', '.join(topics)}.")
            lines.append("")

        key_terms = ch.get("key_terms", [])
        if key_terms:
            lines.append(f"Key terms: {', '.join(key_terms)}.")
            lines.append("")

    # Cross-reference section
    lines.append("## Cross-Chapter References")
    lines.append("")
    lines.append(
        "Several concepts span multiple chapters. "
        "This section maps each concept to its relevant chapters."
    )
    lines.append("")

    for xref in CROSS_REFERENCES:
        concept = xref["concept"]
        lines.append(f"### {concept}")
        lines.append("")
        for loc in xref["locations"]:
            ch_num = loc["chapter"]
            context = loc["context"]
            # Find the matching chapter slug
            matching = [c for c in chapters if c.get("chapter") == ch_num]
            if matching:
                slug = matching[0].get("slug", "unknown")
                filename = f"{ch_num:02d}-{slug}.md"
                lines.append(f"- **Chapter {ch_num}** (`{filename}`): {context}")
            else:
                lines.append(f"- **Chapter {ch_num}**: {context}")
        lines.append("")

    # Key terms index (aggregated across all chapters)
    lines.append("## Master Key Terms Index")
    lines.append("")
    all_terms: dict[str, list[int]] = {}
    for ch in chapters:
        ch_num = ch.get("chapter", 0)
        for term in ch.get("key_terms", []):
            all_terms.setdefault(term, []).append(ch_num)

    for term in sorted(all_terms.keys()):
        ch_nums = sorted(all_terms[term])
        ch_refs = ", ".join(f"Ch. {n}" for n in ch_nums)
        lines.append(f"- **{term}**: {ch_refs}")

    lines.append("")

    # Write the file
    output_path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    # Test with sample data
    sample_chapters = [
        {"chapter": 1, "slug": "trial-preparation", "title": "Trial Preparation",
         "topics": ["case theory", "pretrial motions"], "key_terms": ["case theory", "voir dire"]},
        {"chapter": 2, "slug": "motion-practice", "title": "Motion Practice",
         "topics": ["motion drafting"], "key_terms": ["motion in limine", "summary judgment"]},
    ]
    sample_config = {"book_title": "Trialbook", "book_author": "Damien Riehl"}
    generate_index(sample_chapters, sample_config, Path("test-index.md"))
    print("Test index generated: test-index.md")
