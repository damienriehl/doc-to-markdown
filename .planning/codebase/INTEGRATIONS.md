# External Integrations

**Analysis Date:** 2026-03-17

## APIs & External Services

**System/CLI Tools:**
- Pandoc (system package) - Document conversion engine
  - Used for: DOCX, RTF, ODT to Markdown conversion
  - Invoked via: subprocess calls in `convert.py`
  - Commands: `pandoc`, `marker_single` (from marker-pdf)

## Data Storage

**Databases:**
- None - This is a file processing toolkit, not a service with persistent data

**File Storage:**
- Local filesystem only
  - Input: `./source/` directory (user-provided)
  - Output: `./output/` directory (generated)
  - Configuration: `chapters.yaml` (YAML file in project root)
  - Media extraction: Temp directories created during conversion

**Caching:**
- Web app only: 30-second cache for server availability check (`src/serverApi.js`)
  - `CACHE_DURATION_MS = 30_000`
  - Cached in browser memory; no persistent cache

## Authentication & Identity

**Auth Provider:**
- None - This toolkit is single-user and local-only
- Web app and API server have no authentication requirements
- Local-only CORS restrictions in `server.py`:
  - `http://localhost:*` (any port on localhost)
  - `http://127.0.0.1:*` (any port on loopback)

## Monitoring & Observability

**Error Tracking:**
- None - Errors logged to stdout/stderr only

**Logs:**
- Console output (CLI and server)
  - Python: `print()` statements for status, warnings, errors
  - JavaScript: browser console for web app
- No log file output configured
- Server response codes: HTTP 400 (bad request), 422 (validation error), 500 (server error)

## CI/CD & Deployment

**Hosting:**
- Not configured - This is a local toolkit
- Web app: Static files (Vite build output in `dist/`)
- API server: Optional local FastAPI server for enhanced conversion quality

**CI Pipeline:**
- None configured
- Manual testing via `npm run test` and `python validate.py` (if it exists)

## Environment Configuration

**Required env vars:**
- None - All configuration via CLI arguments and `chapters.yaml`

**Optional Features:**
- PDF conversion engine: Controllable via `--pdf-engine` flag (default: `marker`, fallback: `pymupdf`)
- Input/output directories: Configurable via CLI arguments
- Chapter configuration file: Customizable path via `--config` flag

**Secrets location:**
- No secrets managed - Single-user, local-only tool

## Webhooks & Callbacks

**Incoming:**
- None - This is not a service that receives webhooks

**Outgoing:**
- None - This is not a service that sends webhooks
- No external API calls made by the application
- No callbacks to external systems

## Client-Server Communication

**Local API Server (Optional):**
- Endpoint: `http://127.0.0.1:9378/health` (GET) - Health check for server availability
- Endpoint: `http://127.0.0.1:9378/convert` (POST) - File upload and conversion
  - Request: Multipart form data with `file` field
  - Response: JSON with `{ markdown, filename }` on success
- CORS enabled for local development (see Authentication & Identity section)
- Error responses: JSON with `{ detail: "error message" }` in body, HTTP error status codes

## Framework Integrations

**Vite:**
- Dev server on port 9377
- Hot module reloading for development
- Static file serving and building

**FastAPI:**
- Automatic OpenAPI documentation at `/docs` (if server runs)
- CORS middleware for localhost access
- Multipart form data parsing via `python-multipart`
- JSON request/response handling

**React:**
- No external state management (useState only)
- No API client library (raw fetch() calls)
- Component-based architecture with hooks for async operations

---

*Integration audit: 2026-03-17*
