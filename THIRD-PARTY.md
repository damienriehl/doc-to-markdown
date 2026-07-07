# Third-Party Licenses & Attribution

doc-to-markdown (`rag-converter`) is licensed **MIT** (see `LICENSE`). It incorporates the open-source components below. It does not consume or redistribute FOLIO or other CC-BY data.

## Notable dependencies

### Web app (TypeScript / npm)

| Component | License | Notes |
|-----------|---------|-------|
| react, react-dom | MIT | UI framework |
| dexie | Apache-2.0 | IndexedDB wrapper |
| jszip | MIT (dual MIT-or-GPL — MIT elected here) | ZIP extraction |
| mammoth | BSD-2-Clause | Browser-side DOCX → HTML/Markdown |
| vite, vitest | MIT | Build / test tooling |

### Optional local pipeline (Python, installed via `setup.sh`)

These power the optional CLI/`server.py` conversion path and are run as separate tools or engines, not vendored into the repo.

| Component | License | Notes |
|-----------|---------|-------|
| fastapi | MIT | Local API server |
| uvicorn | BSD-3-Clause | ASGI server |
| python-docx | MIT | DOCX handling |
| pyyaml | MIT | Chapter config |
| regex | Apache-2.0 / PSF | Post-processing |
| **pymupdf4llm** | **AGPL-3.0** | **AGPL copyleft** — optional PDF engine (imported when `--pdf-engine pymupdf`). Only used in the local, non-distributed pipeline. |
| **marker-pdf** | **GPL-3.0** (with commercial-use revenue cap) | **GPL copyleft** — optional PDF engine invoked as a separate `marker_single` subprocess. |
| pandoc *(system package)* | GPL-2.0-or-later | Invoked as an external subprocess for DOCX/RTF/ODT; not linked or bundled. |

**Copyleft flags:** the optional PDF-conversion tools **pymupdf4llm (AGPL-3.0)**, **marker-pdf (GPL-3.0)**, and the external **pandoc (GPL-2.0)** binary are copyleft. They are used only in the optional local pipeline — invoked as separate processes or an optional import — and are not part of the distributed MIT web app. The npm-published web app carries no copyleft dependencies.
