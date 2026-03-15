# Legal Textbook RAG Converter

Convert DOCX and PDF chapter files into RAG-optimized Markdown with consistent naming, YAML metadata headers, and a cross-reference index file.

## Quick Start

```bash
# 1. Install dependencies
./setup.sh

# 2. Configure your chapters
#    Edit chapters.yaml to map your source files to chapter metadata

# 3. Run the conversion
python convert.py --input-dir ./source --output-dir ./output

# 4. Validate the output
python validate.py --output-dir ./output
```

## Project Structure

```
rag-converter/
├── README.md              # This file
├── setup.sh               # Install all dependencies
├── chapters.yaml          # Chapter mapping config (edit this)
├── convert.py             # Main conversion script
├── postprocess.py         # Markdown cleanup and YAML injection
├── generate_index.py      # Cross-reference index generator
├── validate.py            # Output validation and test queries
├── source/                # Place your DOCX/PDF files here
└── output/                # Converted Markdown files land here
```

## Configuration

Edit `chapters.yaml` to map each source file to its chapter number, slug, and key topics. The converter uses this mapping to name output files and generate YAML metadata headers.

If you omit a file from the mapping, the converter auto-detects the title from the document's first heading and assigns the next chapter number.

## Conversion Priority

- If both DOCX and PDF exist for the same chapter, the converter uses DOCX (preserves more structural information).
- DOCX files convert via Pandoc (GFM output, no hard wrapping).
- PDF files convert via Marker (deep learning layout detection) with PyMuPDF4LLM as fallback.

## Output Format

Each chapter file includes:
- YAML front matter (title, chapter number, topics, key terms)
- Clean GFM Markdown with consistent heading hierarchy
- No hard line breaks mid-sentence
- Stripped conversion artifacts

The index file (`00-index.md`) maps chapters to core concepts and cross-references.
