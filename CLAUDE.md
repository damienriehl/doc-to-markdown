# CLAUDE.md — Instructions for Claude Code

## Project Purpose

This toolkit converts legal textbook chapters (DOCX, PDF, RTF, ODT, and TXT) into RAG-optimized Markdown files for use in CustomGPT, Google Gems, and similar AI platforms. The source material is *Trialbook* by Damien Riehl.

## Architecture

```
Source files (DOCX/PDF/RTF/ODT/TXT/ZIP) → Input Resolver → Converter → Post-processor → Output (Markdown + Index)
```

**convert.py** orchestrates the CLI pipeline:
1. Reads `chapters.yaml` for file-to-chapter mapping
2. Detects file type (DOCX, PDF, RTF, ODT, TXT) — also extracts ZIP files
3. Converts via Pandoc (DOCX/RTF/ODT), Marker/PyMuPDF4LLM (PDF), or direct read (TXT)
4. Runs `postprocess.py` to clean artifacts and inject YAML front matter
5. Runs `generate_index.py` to create the cross-reference index

**server.py** provides an optional local API server (FastAPI on port 9378):
- `GET /health` — health check for web app auto-detection
- `POST /convert` — accepts file upload, returns markdown
- Shares conversion logic with `convert.py` via `convert_buffer()`

**Web app** (`src/App.jsx`) with supporting modules:
- `src/inputResolver.js` — normalizes ZIP, folder, and file inputs into File[]
- `src/convertRtf.js` — browser-side RTF conversion (basic quality)
- `src/convertOdt.js` — browser-side ODT conversion (basic quality via JSZip + DOMParser)
- `src/serverApi.js` — auto-detects and communicates with local API server

## Key Design Decisions

- **Format priority**: When multiple formats exist for the same chapter: DOCX > ODT > RTF > PDF > TXT (ordered by structural fidelity)
- **Separate files per chapter**: Better RAG retrieval precision than a monolithic file
- **YAML front matter**: Gives chunkers high-signal metadata (title, topics, key terms)
- **Index file (00-index.md)**: Bridges cross-chapter concepts for multi-topic queries
- **GFM Markdown**: Most RAG platforms parse GitHub-Flavored Markdown reliably
- **--wrap=none**: Prevents hard line breaks mid-sentence (critical for chunking)

## Commands

```bash
# Install dependencies
./setup.sh

# Convert all files
python convert.py --input-dir ./source --output-dir ./output

# Convert with PyMuPDF4LLM instead of Marker (faster, lower quality)
python convert.py --input-dir ./source --output-dir ./output --pdf-engine pymupdf

# Validate output
python validate.py --output-dir ./output --verbose

# Generate only the index (after manual edits to chapter files)
python generate_index.py

# Start local API server (optional, for web app PDF/RTF/ODT conversion)
python server.py

# Run tests
npx vitest run
```

## Configuration

Edit `chapters.yaml` to:
- Map source filenames to chapter numbers and slugs
- Define topics and key terms for YAML front matter
- Set book title and author

## Extending

- **Add chapters**: Add entries to `chapters.yaml`, drop files in `./source/`
- **Custom cross-references**: Edit `CROSS_REFERENCES` in `generate_index.py`
- **New conversion engines**: Add a `convert_pdf_*` function in `convert.py`
- **Additional cleanup rules**: Add regex patterns in `PostProcessor.clean()`

## Dependencies

- Python 3.10+
- pandoc (system package)
- pyyaml, pymupdf4llm, marker-pdf, python-docx, regex (pip packages)
- fastapi, uvicorn, python-multipart (pip packages, for local API server)
- Node.js 18+ (for web app)
- jszip, mammoth, react (npm packages)
