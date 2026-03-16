#!/bin/bash
set -euo pipefail

echo "=== Legal Textbook RAG Converter: Setup ==="
echo ""

# Check OS for package manager
if command -v brew &>/dev/null; then
    PKG_MGR="brew"
elif command -v apt-get &>/dev/null; then
    PKG_MGR="apt"
else
    echo "ERROR: No supported package manager found (brew or apt)."
    exit 1
fi

# Install Pandoc
if ! command -v pandoc &>/dev/null; then
    echo "Installing Pandoc..."
    if [ "$PKG_MGR" = "brew" ]; then
        brew install pandoc
    else
        sudo apt-get update && sudo apt-get install -y pandoc
    fi
else
    echo "Pandoc already installed: $(pandoc --version | head -1)"
fi

# Install Python dependencies
echo ""
echo "Installing Python packages..."
pip install --upgrade pip
pip install \
    pyyaml \
    pymupdf4llm \
    marker-pdf \
    python-docx \
    regex \
    fastapi \
    uvicorn \
    python-multipart

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Place your DOCX/PDF/RTF/ODT/TXT files in ./source/"
echo "  2. Edit chapters.yaml to map your files"
echo "  3. Run: python convert.py --input-dir ./source --output-dir ./output"
echo "  4. Optional: python server.py  (starts local API for web app PDF conversion)"
