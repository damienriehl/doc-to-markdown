# Technology Stack

**Analysis Date:** 2026-03-17

## Languages

**Primary:**
- Python 3.10+ - CLI conversion pipeline, local API server, document processing
- JavaScript/JSX (ES Modules) - Browser-based web app, file input handling

**Secondary:**
- Markdown - Output format (GitHub-Flavored Markdown)
- YAML - Chapter configuration (`chapters.yaml`)
- Bash - Setup and utility scripts (`setup.sh`)

## Runtime

**Environment:**
- Python 3.10+ for CLI and API server
- Node.js 18+ for web app bundling and testing

**Package Manager:**
- npm (Node.js) - JavaScript dependencies
- pip (Python) - Python dependencies via setup.sh

**Lockfile:**
- `package-lock.json` present for npm
- No Python lockfile (requirements installed via setup.sh)

## Frameworks

**Frontend:**
- React 19.0.0 - Web UI component framework
- Vite 6.0.0 - Development server and build tool (dev server: port 9377)

**Backend:**
- FastAPI - Local API server for full-quality document conversion (port 9378)
- Uvicorn - ASGI application server for FastAPI

**Testing:**
- Vitest 4.1.0 - JavaScript/JSX unit testing framework

**Build/Dev:**
- Vite 6.0.0 - Module bundler, dev server, preview server
- @vitejs/plugin-react 4.3.4 - React JSX support in Vite

## Key Dependencies

**Critical:**

**Frontend:**
- jszip 3.10.1 - ZIP file extraction and decompression (browser-side ZIP handling)
- mammoth 1.8.0 - DOCX to HTML/Markdown conversion (browser-side DOCX conversion)
- react 19.0.0 - UI framework
- react-dom 19.0.0 - DOM rendering

**Backend/CLI:**
- pyyaml - YAML configuration parsing (`chapters.yaml`)
- pandoc (system package) - Primary document converter for DOCX/RTF/ODT to Markdown (via subprocess)
- marker-pdf - High-quality PDF to Markdown conversion (default PDF engine, optional)
- pymupdf4llm - Fallback PDF to Markdown conversion (lower quality, faster)
- python-docx - DOCX document parsing and inspection
- regex - Enhanced regex support for pattern detection (outline pattern validation)
- fastapi - Web framework for local API server
- uvicorn - ASGI server for FastAPI
- python-multipart - Multipart form data parsing for file uploads

## Configuration

**Environment:**
- No `.env` file required for basic operation
- Configuration via `chapters.yaml` for chapter mapping, book metadata, and topics
- Command-line arguments for input/output directories and PDF engine selection

**Build:**
- `vite.config.js` - Vite bundling configuration (React plugin, port 9377)
- `package.json` - npm scripts and dependencies
- `setup.sh` - Bash setup script for Python dependencies and Pandoc installation

**Chapter Configuration:**
- `chapters.yaml` - Maps source files to chapter metadata (number, slug, title, topics, key terms)

## Platform Requirements

**Development:**
- Python 3.10+ (required)
- Node.js 18+ (required for web app)
- Pandoc system package (required for DOCX/RTF/ODT conversion)
- macOS or Linux (bash-based setup.sh; Linux requires apt-get, macOS requires brew)

**Production/Deployment:**
- Python 3.10+ runtime
- Pandoc system package
- Optional: marker-pdf Python package (for high-quality PDF conversion)
- Optional: pymupdf4llm Python package (PDF fallback)
- Web app deployed as static files (dist/ directory from Vite build)

## Port Configuration

**Development:**
- Vite dev server: port 9377 (configurable in `vite.config.js`)
- FastAPI local server: port 9378 (configurable via command-line flag in `server.py`)

**Web App Autodiscovery:**
- Web app probes `http://127.0.0.1:9378/health` for local API server availability (hardcoded in `src/serverApi.js`)

## Conversion Pipeline

**Document Format Support:**
- DOCX - Via Pandoc (primary) or Mammoth (browser-side basic)
- PDF - Via Marker (primary, server) or PyMuPDF4LLM (fallback, server or browser)
- RTF - Via Pandoc (primary) or browser-side basic conversion
- ODT - Via Pandoc (primary) or JSZip + DOMParser (browser-side basic)
- TXT - Direct text reading
- ZIP - Extracted and recursively converted (safety limits enforced)

**Output:**
- GitHub-Flavored Markdown (gfm) with `--wrap=none` (line wrapping disabled for RAG chunking)
- YAML front matter for RAG optimization (chapter number, title, topics, key terms)
- Media extraction to separate directory (for Pandoc-converted formats)

---

*Stack analysis: 2026-03-17*
