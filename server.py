#!/usr/bin/env python3
"""
Local API Server for RAG Converter
===================================
Optional FastAPI server that provides full-quality document conversion
for the web app. Shares conversion logic with convert.py.

Usage:
    python server.py                  # Start on default port 9378
    python server.py --port 9378      # Explicit port
    uvicorn server:app --port 9378    # Direct uvicorn usage

The web app auto-detects this server and routes PDF/RTF/ODT conversion
through it for higher quality results (Pandoc/Marker).
"""

import argparse
import os
import re
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from postprocess import PostProcessor

app = FastAPI(title="RAG Converter API", version="1.0.0")

# CORS: allow localhost on any port (local-only tool)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:*",
        "http://127.0.0.1:*",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {".docx", ".pdf", ".rtf", ".odt", ".txt"}


def convert_buffer(contents: bytes, filename: str, pdf_engine: str = "marker") -> str:
    """Convert file contents to markdown. Shared by CLI and API."""
    from convert import (
        convert_docx,
        convert_odt,
        convert_pdf,
        convert_rtf,
        convert_txt,
    )

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")

    # Write to temp file for conversion
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = Path(tmp.name)

    try:
        output_path = tmp_path.with_suffix(".md")
        media_dir = tmp_path.parent / "media"
        media_dir.mkdir(exist_ok=True)

        if ext == ".docx":
            success = convert_docx(tmp_path, output_path, media_dir)
        elif ext == ".pdf":
            success = convert_pdf(tmp_path, output_path, media_dir, pdf_engine)
        elif ext == ".rtf":
            success = convert_rtf(tmp_path, output_path, media_dir)
        elif ext == ".odt":
            success = convert_odt(tmp_path, output_path, media_dir)
        elif ext == ".txt":
            success = convert_txt(tmp_path, output_path)
        else:
            raise ValueError(f"Unsupported file type: {ext}")

        if not success:
            raise RuntimeError(f"Conversion failed for {filename}")

        md_content = output_path.read_text(encoding="utf-8")

        # Post-process
        processor = PostProcessor()
        md_content = processor.clean(md_content)

        # Extract numbering levels for DOCX heading detection
        numbering_levels = None
        if ext == ".docx":
            try:
                from postprocess import extract_numbering_from_docx
                numbering_levels = extract_numbering_from_docx(str(tmp_path))
            except Exception:
                pass

        md_content = processor.detect_and_promote_headings(md_content, numbering_levels)

        return md_content

    finally:
        # Clean up temp files
        tmp_path.unlink(missing_ok=True)
        if output_path.exists():
            output_path.unlink(missing_ok=True)


@app.get("/health")
async def health():
    """Health check endpoint for web app auto-detection."""
    return {"status": "ok"}


@app.post("/convert")
async def convert_file(file: UploadFile = File(...)):
    """Convert an uploaded document to markdown."""
    # Validate file type
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Sanitize filename
    safe_filename = re.sub(r"[^\w.\-]", "_", file.filename or "upload")

    try:
        contents = await file.read()
        markdown = convert_buffer(contents, safe_filename)
        return {"filename": safe_filename, "markdown": markdown}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion error: {e}")


def main():
    parser = argparse.ArgumentParser(description="RAG Converter local API server")
    parser.add_argument(
        "--port", type=int, default=9378,
        help="Port to listen on (default: 9378)"
    )
    parser.add_argument(
        "--host", default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1, localhost only)"
    )
    args = parser.parse_args()

    try:
        import uvicorn
    except ImportError:
        print("ERROR: uvicorn not installed. Run: pip install uvicorn fastapi python-multipart")
        sys.exit(1)

    print(f"Starting RAG Converter API server on {args.host}:{args.port}")
    print(f"Health check: http://{args.host}:{args.port}/health")
    print(f"Convert endpoint: POST http://{args.host}:{args.port}/convert")
    print()
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
