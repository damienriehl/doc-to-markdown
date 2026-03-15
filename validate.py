#!/usr/bin/env python3
"""
Output Validator
=================
Checks converted Markdown files for common issues and reports
statistics useful for RAG tuning.

Usage:
    python validate.py --output-dir ./output
    python validate.py --output-dir ./output --verbose
"""

import argparse
import re
import sys
from pathlib import Path


class ValidationResult:
    def __init__(self, filename: str):
        self.filename = filename
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.stats: dict = {}


def validate_file(filepath: Path, verbose: bool = False) -> ValidationResult:
    """Validate a single Markdown file for RAG readiness."""
    result = ValidationResult(filepath.name)

    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        result.errors.append(f"Cannot read file: {e}")
        return result

    lines = content.split("\n")

    # --- Check YAML front matter ---
    if not content.startswith("---"):
        result.errors.append("Missing YAML front matter")
    else:
        yaml_end = content.find("---", 3)
        if yaml_end == -1:
            result.errors.append("YAML front matter not closed")
        else:
            yaml_block = content[3:yaml_end].strip()
            required_fields = ["title", "chapter", "book"]
            for field in required_fields:
                if f"{field}:" not in yaml_block:
                    result.errors.append(f"YAML missing required field: {field}")

    # --- Check heading hierarchy ---
    heading_levels = []
    for line in lines:
        match = re.match(r"^(#{1,6})\s", line)
        if match:
            heading_levels.append(len(match.group(1)))

    if heading_levels:
        if 1 in heading_levels:
            # H1 in body is OK only if it's the first heading and matches title
            h1_count = heading_levels.count(1)
            if h1_count > 1:
                result.warnings.append(f"Multiple H1 headings found ({h1_count})")

        # Check for skipped levels (e.g., H2 → H4 with no H3)
        for i in range(1, len(heading_levels)):
            if heading_levels[i] > heading_levels[i - 1] + 1:
                result.warnings.append(
                    f"Heading level skip: H{heading_levels[i-1]} → H{heading_levels[i]}"
                )

    # --- Check for conversion artifacts ---
    artifact_patterns = [
        (r"\\[.,:;!?]", "Stray backslash escapes"),
        (r"\{\.unnumbered\}", "Pandoc {.unnumbered} attributes"),
        (r"\{#[^}]+\}", "Pandoc ID attributes on headings"),
        (r"\n{4,}", "Excessive blank lines (4+)"),
        (r"\[.*?\]\(\s+", "Broken Markdown links (space in URL)"),
    ]
    for pattern, description in artifact_patterns:
        matches = re.findall(pattern, content)
        if matches:
            result.warnings.append(f"{description}: {len(matches)} occurrence(s)")

    # --- Statistics ---
    word_count = len(content.split())
    char_count = len(content)
    heading_count = len(heading_levels)
    paragraph_count = len(re.findall(r"\n\n[^\n#\-\|>]", content))

    # Estimate token count (rough: ~0.75 words per token for English)
    estimated_tokens = int(word_count / 0.75)

    result.stats = {
        "words": word_count,
        "characters": char_count,
        "estimated_tokens": estimated_tokens,
        "headings": heading_count,
        "paragraphs": paragraph_count,
        "lines": len(lines),
    }

    # Token count warnings
    if estimated_tokens > 100_000:
        result.warnings.append(
            f"Very large file (~{estimated_tokens:,} tokens). "
            "Some RAG platforms may truncate."
        )
    elif estimated_tokens > 50_000:
        result.warnings.append(
            f"Large file (~{estimated_tokens:,} tokens). "
            "Verify your RAG platform handles this size."
        )

    if verbose and not result.errors and not result.warnings:
        print(f"  ✓ {filepath.name}: No issues")

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Validate converted Markdown files for RAG readiness."
    )
    parser.add_argument(
        "--output-dir", default="./output",
        help="Directory containing converted Markdown files (default: ./output)"
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Show detailed output for each file"
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    if not output_dir.exists():
        print(f"ERROR: Output directory '{args.output_dir}' does not exist.")
        sys.exit(1)

    md_files = sorted(output_dir.glob("*.md"))
    if not md_files:
        print(f"No Markdown files found in '{args.output_dir}'.")
        sys.exit(1)

    print(f"Validating {len(md_files)} file(s) in '{args.output_dir}'...")
    print("")

    total_errors = 0
    total_warnings = 0
    total_tokens = 0

    for md_file in md_files:
        result = validate_file(md_file, args.verbose)

        has_issues = result.errors or result.warnings
        if has_issues or args.verbose:
            print(f"  {md_file.name}")

        for err in result.errors:
            print(f"    ✗ ERROR: {err}")
            total_errors += 1

        for warn in result.warnings:
            print(f"    ⚠ WARNING: {warn}")
            total_warnings += 1

        if args.verbose:
            stats = result.stats
            print(
                f"    Stats: {stats['words']:,} words, "
                f"~{stats['estimated_tokens']:,} tokens, "
                f"{stats['headings']} headings, "
                f"{stats['paragraphs']} paragraphs"
            )
            print("")

        total_tokens += result.stats.get("estimated_tokens", 0)

    # Summary
    print("")
    print("=" * 50)
    print(f"Files validated:    {len(md_files)}")
    print(f"Total est. tokens:  {total_tokens:,}")
    print(f"Errors:             {total_errors}")
    print(f"Warnings:           {total_warnings}")
    print("=" * 50)

    if total_errors > 0:
        print("")
        print("Fix errors before uploading to your RAG platform.")
        sys.exit(1)
    elif total_warnings > 0:
        print("")
        print("Review warnings. Most can be safely ignored for RAG use.")
    else:
        print("")
        print("All files passed validation. Ready for RAG upload.")


if __name__ == "__main__":
    main()
