# Legal Textbook RAG Converter

Convert DOCX, PDF, RTF, ODT, and TXT chapter files into RAG-optimized Markdown with consistent naming, YAML metadata headers, and a cross-reference index file.

Two ways to run it: a **browser app** (drop files in, get Markdown out, nothing leaves your machine) and a **Python CLI** for batch conversion with the highest-fidelity engines. An optional local API server bridges the two — the web app auto-detects it and routes PDF/RTF/ODT through the good converters when it's up.

## Who it's for

- **Authors and publishers** turning a finished manuscript into something an AI platform can actually retrieve from (CustomGPT, Google Gems, Claude Projects, a homegrown RAG stack).
- **Anyone assembling a knowledge base** out of mixed-format documents who wants per-chapter files with clean headings, not one giant blob.
- **Developers** who need a repeatable conversion step with an inspectable pipeline — every stage is a script you can run on its own.

## Use cases

- **Convert a book into a RAG corpus** — one Markdown file per chapter, each with YAML front matter (title, chapter number, topics, key terms), plus a generated `00-index.md` that bridges cross-chapter concepts.
- **Work entirely in the browser** — the web app converts DOCX (and basic RTF/ODT) client-side with no upload, saves work as named projects in IndexedDB, and exports a ZIP.
- **Upgrade quality when it matters** — start the local API server and the same web app routes PDF/RTF/ODT through Pandoc and Marker instead of the browser-side fallbacks.
- **Batch a whole directory** — point the CLI at `./source`, get `./output`, then validate it.
- **Hand a corpus to someone else** — export a full project ZIP (sources + outputs) and import it elsewhere; the round trip is lossless.

## Quick start — web app

```bash
npm install
npm run dev          # Vite dev server
npm test             # Vitest suite
```

Drop in files, a folder, or a ZIP. DOCX converts in the browser via `mammoth`; RTF and ODT have basic browser-side converters; PDF needs the local API server (below).

## Quick start — CLI

```bash
# 1. Install dependencies (pandoc + Python packages)
./setup.sh

# 2. Configure your chapters
#    Edit chapters.yaml to map your source files to chapter metadata

# 3. Run the conversion
python convert.py --input-dir ./source --output-dir ./output

# 4. Validate the output
python validate.py --output-dir ./output --verbose
```

Useful flags: `--config chapters.yaml`, `--pdf-engine marker|pymupdf` (default `marker`, falls back to `pymupdf`), `--skip-index`. Regenerate just the cross-reference file with `python generate_index.py`.

## Optional local API server

```bash
python server.py                # FastAPI on port 9378
```

- `GET /health` — what the web app polls to auto-detect the server.
- `POST /convert` — file upload in, Markdown out; shares `convert_buffer()` with the CLI.

With it running, the web app's PDF/RTF/ODT paths get Pandoc/Marker quality instead of the browser fallbacks. Everything stays on localhost.

## Supported inputs and conversion priority

| Format | Engine |
|---|---|
| DOCX | Pandoc (CLI/server) · `mammoth` (browser) |
| RTF, ODT | Pandoc (CLI/server) · basic browser-side converters |
| PDF | Marker (deep-learning layout detection), falling back to PyMuPDF4LLM |
| TXT | direct read |
| ZIP | extracted, then each member routed by format |

When multiple formats exist for the same chapter, the highest-fidelity one wins: **DOCX > ODT > RTF > PDF > TXT**.

## Project structure

```
doc-to-markdown/
├── README.md              # This file
├── setup.sh               # Install pandoc + Python dependencies
├── chapters.yaml          # Chapter mapping config (edit this)
├── convert.py             # CLI pipeline orchestrator
├── postprocess.py         # Markdown cleanup and YAML injection
├── generate_index.py      # Cross-reference index generator
├── validate.py            # Output validation and test queries
├── server.py              # Optional local FastAPI conversion server
├── index.html             # Web app entry (Vite)
├── vite.config.js
├── src/                   # React web app
│   ├── App.jsx            #   converter UI
│   ├── ProjectList.jsx    #   saved-project browser
│   ├── inputResolver.js   #   normalizes ZIP / folder / file inputs into File[]
│   ├── convertRtf.js      #   browser-side RTF conversion
│   ├── convertOdt.js      #   browser-side ODT conversion (JSZip + DOMParser)
│   ├── projectDb.js       #   IndexedDB (Dexie) persistence
│   ├── projectSerializer.js  # ZIP export / import
│   ├── serverApi.js       #   auto-detects and calls the local API server
│   └── __tests__/         #   Vitest suite
├── rag-converter-app.jsx  # Original single-file component, kept as reference
├── source/                # Place your DOCX/PDF files here (CLI)
└── output/                # Converted Markdown lands here (CLI)
```

## Configuration

Edit `chapters.yaml` to map each source file to its chapter number, slug, and key topics. The converter uses this mapping to name output files and generate YAML metadata headers.

If you omit a file from the mapping, the converter auto-detects the title from the document's first heading and assigns the next chapter number.

## Output format

Each chapter file includes:

- YAML front matter (title, chapter number, topics, key terms)
- Clean GFM Markdown with consistent heading hierarchy
- No hard line breaks mid-sentence (`--wrap=none` — critical for chunking)
- Stripped conversion artifacts

The index file (`00-index.md`) maps chapters to core concepts and cross-references.

## Web app: projects (save / export / import)

The browser app persists work as named **projects** in IndexedDB. From the project list you can:

- **Export** a project as a ZIP in two modes:
  - **Full project** — `project.json` + `sources/` (original uploads) + `outputs/` (generated Markdown, incl. `00-index.md`).
  - **Outputs only** — a flat ZIP of just the `.md` files.
- **Import** a previously exported ZIP. A full ZIP restores sources and outputs; an
  outputs-only ZIP reconstructs chapters from the `.md` filenames. Imports always get
  a fresh identity (project id and per-chapter blob ids are regenerated), so importing
  the same ZIP twice never overwrites or corrupts an existing project. A name collision
  auto-appends ` (2)`, ` (3)`, etc.

Round-trip is lossless: exporting an imported project yields byte-identical `sources/`
and `outputs/` files. See `docs/evidence/uat-04/` for the verified UAT pack.

## Tech stack

**Web app:** React 19 + Vite 6, Dexie (IndexedDB), JSZip, mammoth; Vitest + fake-indexeddb for tests. **CLI/server:** Python 3.10+, FastAPI + uvicorn, PyYAML, python-docx, regex; Pandoc as an external binary; Marker and PyMuPDF4LLM as optional PDF engines.

## License

MIT — see [LICENSE](LICENSE).

**Read [THIRD-PARTY.md](THIRD-PARTY.md) before redistributing.** The MIT web app carries no copyleft dependencies, but the optional local Python pipeline reaches for copyleft PDF tooling — `pymupdf4llm` (AGPL-3.0), `marker-pdf` (GPL-3.0), and the external `pandoc` binary (GPL-2.0-or-later). They run as separate processes or optional imports in a local, non-distributed pipeline; bundling any of them into a distributed artifact would change the analysis.
