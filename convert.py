#!/usr/bin/env python3
"""
Legal Textbook RAG Converter
=============================
Batch-converts DOCX, PDF, RTF, ODT, and TXT files to RAG-optimized Markdown.

Usage:
    python convert.py --input-dir ./source --output-dir ./output
    python convert.py --input-dir ./source --output-dir ./output --config chapters.yaml
    python convert.py --input-dir ./source --output-dir ./output --pdf-engine pymupdf
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

import yaml

from postprocess import PostProcessor, extract_numbering_from_docx


def load_config(config_path: str) -> dict:
    """Load chapter mapping from YAML config."""
    config_file = Path(config_path)
    if not config_file.exists():
        print(f"WARNING: Config file '{config_path}' not found. Using auto-detection.")
        return {"chapters": [], "book_title": "Unknown", "book_author": "Unknown"}
    with open(config_file, "r") as f:
        return yaml.safe_load(f)


FORMAT_PRIORITY = {".docx": 0, ".odt": 1, ".rtf": 2, ".pdf": 3, ".txt": 4}


def find_source_files(input_dir: str) -> list[Path]:
    """Find all convertible files in the input directory."""
    input_path = Path(input_dir)
    if not input_path.exists():
        print(f"ERROR: Input directory '{input_dir}' does not exist.")
        sys.exit(1)

    files = []
    for ext in ("*.docx", "*.pdf", "*.rtf", "*.odt", "*.txt"):
        files.extend(input_path.glob(ext))

    # Also extract ZIP files
    for zip_path in input_path.glob("*.zip"):
        files.extend(_extract_zip(zip_path))

    # Deduplicate: keep highest-priority format (DOCX > ODT > RTF > PDF > TXT)
    seen_bases = {}
    for f in files:
        base = f.stem.lower()
        f_priority = FORMAT_PRIORITY.get(f.suffix.lower(), 99)
        if base not in seen_bases:
            seen_bases[base] = f
        else:
            existing_priority = FORMAT_PRIORITY.get(seen_bases[base].suffix.lower(), 99)
            if f_priority < existing_priority:
                print(f"  INFO: Multiple formats for '{f.stem}'. Using {f.suffix}.")
                seen_bases[base] = f

    return sorted(seen_bases.values(), key=lambda p: p.name)


def _extract_zip(zip_path: Path) -> list[Path]:
    """Extract convertible files from a ZIP archive to a temp directory."""
    import tempfile
    import zipfile

    convertible_exts = set(FORMAT_PRIORITY.keys())
    skip_prefixes = ("__MACOSX/", ".", "__pycache__/")
    skip_names = {".DS_Store", "Thumbs.db", "desktop.ini"}

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            # ZIP bomb protection
            total_size = sum(info.file_size for info in zf.infolist())
            if total_size > 500 * 1024 * 1024:  # 500MB
                print(f"  WARNING: ZIP '{zip_path.name}' exceeds 500MB uncompressed. Skipping.")
                return []
            if len(zf.infolist()) > 1000:
                print(f"  WARNING: ZIP '{zip_path.name}' has >1000 entries. Skipping.")
                return []

            extracted = []
            temp_dir = Path(tempfile.mkdtemp(prefix="rag-zip-"))
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = Path(info.filename).name
                # Skip OS artifacts and hidden files
                if any(info.filename.startswith(p) for p in skip_prefixes):
                    continue
                if name in skip_names or name.startswith("."):
                    continue
                # Skip non-convertible files and nested ZIPs
                ext = Path(name).suffix.lower()
                if ext not in convertible_exts:
                    continue
                # Path traversal protection
                if ".." in info.filename:
                    continue

                # Handle duplicate names by adding counter
                target = temp_dir / name
                counter = 2
                while target.exists():
                    stem = Path(name).stem
                    target = temp_dir / f"{stem}-{counter}{ext}"
                    counter += 1

                with zf.open(info) as src, open(target, "wb") as dst:
                    dst.write(src.read())
                extracted.append(target)

            print(f"  Extracted {len(extracted)} file(s) from {zip_path.name}")
            return extracted
    except (zipfile.BadZipFile, RuntimeError) as e:
        print(f"  WARNING: Could not extract '{zip_path.name}': {e}")
        return []


def get_chapter_config(source_file: Path, config: dict, auto_counter: int) -> dict:
    """Match a source file to its chapter config, or auto-generate one."""
    for ch in config.get("chapters", []):
        if ch["source"].lower() == source_file.name.lower():
            return ch

    # Auto-generate config from filename
    title = source_file.stem.replace("_", " ").replace("-", " ").title()
    slug = re.sub(r"[^a-z0-9]+", "-", source_file.stem.lower()).strip("-")
    return {
        "source": source_file.name,
        "chapter": auto_counter,
        "slug": slug,
        "title": title,
        "topics": [],
        "key_terms": [],
    }


def convert_docx(source: Path, output: Path, media_dir: Path) -> bool:
    """Convert DOCX to Markdown via Pandoc."""
    cmd = [
        "pandoc",
        str(source),
        "-t", "gfm",
        "--wrap=none",
        f"--extract-media={media_dir}",
        "-o", str(output),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  ERROR (Pandoc): {result.stderr.strip()}")
            return False
        return True
    except FileNotFoundError:
        print("  ERROR: Pandoc not installed. Run ./setup.sh first.")
        return False
    except subprocess.TimeoutExpired:
        print("  ERROR: Pandoc timed out.")
        return False


def convert_pdf_marker(source: Path, output_dir: Path) -> Path | None:
    """Convert PDF to Markdown via Marker."""
    try:
        cmd = [
            "marker_single",
            str(source),
            str(output_dir),
            "--output_format", "markdown",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            print(f"  WARNING (Marker): {result.stderr.strip()}")
            return None

        # Marker creates a subdirectory named after the PDF
        marker_dir = output_dir / source.stem
        md_files = list(marker_dir.glob("*.md"))
        if md_files:
            return md_files[0]
        return None
    except FileNotFoundError:
        print("  WARNING: Marker not installed. Falling back to PyMuPDF4LLM.")
        return None
    except subprocess.TimeoutExpired:
        print("  WARNING: Marker timed out. Falling back to PyMuPDF4LLM.")
        return None


def convert_pdf_pymupdf(source: Path, output: Path) -> bool:
    """Convert PDF to Markdown via PyMuPDF4LLM (fallback)."""
    try:
        import pymupdf4llm

        md_text = pymupdf4llm.to_markdown(str(source))
        output.write_text(md_text, encoding="utf-8")
        return True
    except ImportError:
        print("  ERROR: pymupdf4llm not installed. Run ./setup.sh first.")
        return False
    except Exception as e:
        print(f"  ERROR (PyMuPDF4LLM): {e}")
        return False


def convert_rtf(source: Path, output: Path, media_dir: Path) -> bool:
    """Convert RTF to Markdown via Pandoc."""
    cmd = [
        "pandoc",
        str(source),
        "-f", "rtf",
        "-t", "gfm",
        "--wrap=none",
        f"--extract-media={media_dir}",
        "-o", str(output),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  ERROR (Pandoc RTF): {result.stderr.strip()}")
            return False
        return True
    except FileNotFoundError:
        print("  ERROR: Pandoc not installed. Run ./setup.sh first.")
        return False
    except subprocess.TimeoutExpired:
        print("  ERROR: Pandoc timed out.")
        return False


def convert_odt(source: Path, output: Path, media_dir: Path) -> bool:
    """Convert ODT to Markdown via Pandoc."""
    cmd = [
        "pandoc",
        str(source),
        "-f", "odt",
        "-t", "gfm",
        "--wrap=none",
        f"--extract-media={media_dir}",
        "-o", str(output),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  ERROR (Pandoc ODT): {result.stderr.strip()}")
            return False
        return True
    except FileNotFoundError:
        print("  ERROR: Pandoc not installed. Run ./setup.sh first.")
        return False
    except subprocess.TimeoutExpired:
        print("  ERROR: Pandoc timed out.")
        return False


def convert_txt(source: Path, output: Path) -> bool:
    """Convert plain text to Markdown (minimal processing)."""
    try:
        try:
            text = source.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = source.read_text(encoding="windows-1252")
        # Preserve paragraph structure
        paragraphs = re.split(r"\n{2,}", text.replace("\r\n", "\n").replace("\r", "\n"))
        md = "\n\n".join(p.strip() for p in paragraphs if p.strip())
        output.write_text(md, encoding="utf-8")
        return True
    except Exception as e:
        print(f"  ERROR (TXT): {e}")
        return False


def convert_pdf(source: Path, output: Path, media_dir: Path, engine: str) -> bool:
    """Convert PDF to Markdown, trying Marker first, then PyMuPDF4LLM."""
    if engine == "marker":
        marker_result = convert_pdf_marker(source, output.parent)
        if marker_result:
            # Move Marker output to the expected filename
            marker_result.rename(output)
            return True
        # Fall through to PyMuPDF4LLM
        print("  Falling back to PyMuPDF4LLM...")

    return convert_pdf_pymupdf(source, output)


def main():
    parser = argparse.ArgumentParser(
        description="Convert legal textbook chapters (DOCX/PDF/RTF/ODT/TXT) to RAG-optimized Markdown."
    )
    parser.add_argument(
        "--input-dir", default="./source",
        help="Directory containing source DOCX/PDF files (default: ./source)"
    )
    parser.add_argument(
        "--output-dir", default="./output",
        help="Directory for converted Markdown files (default: ./output)"
    )
    parser.add_argument(
        "--config", default="chapters.yaml",
        help="Chapter mapping config file (default: chapters.yaml)"
    )
    parser.add_argument(
        "--pdf-engine", default="marker", choices=["marker", "pymupdf"],
        help="PDF conversion engine (default: marker, falls back to pymupdf)"
    )
    parser.add_argument(
        "--skip-index", action="store_true",
        help="Skip index file generation"
    )
    args = parser.parse_args()

    # Setup directories
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    media_dir = output_dir / "media"
    media_dir.mkdir(exist_ok=True)

    # Load config
    config = load_config(args.config)
    print(f"Book: {config.get('book_title', 'Unknown')}")
    print(f"Author: {config.get('book_author', 'Unknown')}")
    print("")

    # Find source files
    source_files = find_source_files(args.input_dir)
    if not source_files:
        print(f"No convertible files found in '{args.input_dir}'.")
        sys.exit(1)

    print(f"Found {len(source_files)} source file(s):")
    for f in source_files:
        print(f"  {f.name}")
    print("")

    # Process each file
    processor = PostProcessor()
    auto_counter = max(
        (ch.get("chapter", 0) for ch in config.get("chapters", [])),
        default=0,
    ) + 1

    converted = []
    for source in source_files:
        ch_config = get_chapter_config(source, config, auto_counter)
        if ch_config.get("chapter") == auto_counter:
            auto_counter += 1

        chapter_num = ch_config["chapter"]
        slug = ch_config["slug"]
        output_filename = f"{chapter_num:02d}-{slug}.md"
        output_path = output_dir / output_filename

        print(f"Converting: {source.name} → {output_filename}")

        # Convert based on file type
        success = False
        ext = source.suffix.lower()
        if ext == ".docx":
            success = convert_docx(source, output_path, media_dir)
        elif ext == ".pdf":
            success = convert_pdf(source, output_path, media_dir, args.pdf_engine)
        elif ext == ".rtf":
            success = convert_rtf(source, output_path, media_dir)
        elif ext == ".odt":
            success = convert_odt(source, output_path, media_dir)
        elif ext == ".txt":
            success = convert_txt(source, output_path)

        if not success:
            print(f"  FAILED: {source.name}")
            continue

        # Post-process: clean artifacts, promote headings, inject YAML front matter
        md_content = output_path.read_text(encoding="utf-8")
        md_content = processor.clean(md_content)

        # Extract DOCX numbering levels for heading detection
        numbering_levels = None
        if source.suffix.lower() == ".docx":
            try:
                numbering_levels = extract_numbering_from_docx(str(source))
            except Exception as e:
                print(f"  WARNING: Could not extract numbering from DOCX: {e}")

        md_content = processor.detect_and_promote_headings(
            md_content, numbering_levels
        )
        md_content = processor.inject_yaml_header(md_content, ch_config, config)
        output_path.write_text(md_content, encoding="utf-8")

        converted.append(ch_config)
        print(f"  OK: {output_filename}")

    print("")
    print(f"Converted {len(converted)} / {len(source_files)} files.")

    # Generate index file
    if not args.skip_index and converted:
        from generate_index import generate_index
        index_path = output_dir / "00-index.md"
        generate_index(converted, config, index_path)
        print(f"Generated index: {index_path.name}")

    print("")
    print("Done. Run 'python validate.py --output-dir ./output' to check results.")


if __name__ == "__main__":
    main()
