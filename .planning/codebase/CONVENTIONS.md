# Coding Conventions

**Analysis Date:** 2026-03-17

## Naming Patterns

**Files:**
- JavaScript/JSX: camelCase with `.js` or `.jsx` extension (e.g., `inputResolver.js`, `convertRtf.js`, `serverApi.js`)
- Python: snake_case with `.py` extension (e.g., `convert.py`, `postprocess.py`, `generate_index.py`)
- Test files: same name as source with `.test.js` suffix, located in `src/__tests__/` (e.g., `src/__tests__/convertRtf.test.js`)

**Functions:**
- JavaScript: camelCase (e.g., `isSupportedFile`, `extractZip`, `resolveInputs`, `convertRtf`)
- Python: snake_case (e.g., `load_config`, `find_source_files`, `convert_docx`, `extract_numbering_from_docx`)
- Private/internal functions: prefixed with underscore in Python (e.g., `_extract_zip`, `_is_valid_roman`)

**Variables:**
- JavaScript: camelCase for all variables, including object keys (e.g., `cachedStatus`, `cachedAt`, `zipFile`, `mediaDir`)
- Python: snake_case (e.g., `output_dir`, `numbering_levels`, `temp_dir`, `max_zip_size`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_ZIP_SIZE`, `SUPPORTED_EXTENSIONS`, `ROMAN_MAP`, `SERVER_URL`)

**Types:**
- No TypeScript in this codebase; plain JavaScript used throughout
- JSDoc comments for function signatures (see **Comments** section)

## Code Style

**Formatting:**
- No formal linter configured (no `.eslintrc` or `.prettierrc`)
- Code is formatted manually with these conventions:
  - 2-space indentation (JavaScript and Python)
  - 80-character line guidance (practical soft limit, not enforced)
  - Blank lines: double newlines between logical sections within functions

**Python style:**
- Type hints used in function signatures: `def load_config(config_path: str) -> dict:` (see `convert.py` line 25, `postprocess.py` line 122)
- Return type annotations: `-> dict`, `-> list[Path]`, `-> str | None` (modern Python 3.10+ union syntax used in `convert.py` line 170)
- Docstrings for modules and classes: triple-quoted strings at file/class head

**JavaScript style:**
- Use `async/await` for Promise handling (see `src/inputResolver.js` line 55, `src/App.jsx` async functions)
- Use `const` for all variable declarations; no `var` or `let` except when reassignment required
- Template literals for multi-line strings (e.g., `String.raw` in test fixtures)

## Import Organization

**JavaScript:**
- Order: 1) External libraries (React, third-party packages), 2) Local modules with relative paths (`./*`), 3) Named or namespace imports
- Explicit file extensions: all imports include `.js` extension (e.g., `import { convertRtf } from "./convertRtf.js"` in `src/App.jsx`)
- Both named imports and namespace imports used (e.g., `import * as mammoth from "mammoth"`)

**Python:**
- Order: 1) Standard library, 2) Third-party packages, 3) Local imports
- Explicit relative imports from local modules: `from postprocess import PostProcessor, extract_numbering_from_docx` (`convert.py` line 22)
- Lazy imports for optional features: `from convert import (...)` inside functions to delay import until needed (`server.py` line 50)

## Error Handling

**JavaScript patterns:**
- Try-catch blocks: used around network calls, ZIP extraction, file reading
- Promise rejection handling: `.catch()` with fallback logic (e.g., `src/serverApi.js` line 60: `res.json().catch(() => ...)`)
- Error messages propagated to UI: HTTPException in FastAPI catches and returns user-friendly error messages
- Graceful degradation: if server unavailable, browser-side converters used as fallback (`src/App.jsx`)

**Python patterns:**
- Exception catching by type: specific exceptions (e.g., `FileNotFoundError`, `zipfile.BadZipFile`) with fallback behavior (`convert.py` line 156-167)
- Generic `Exception` catch for third-party integrations: `except Exception as e:` with wrapping in HTTPException (`server.py` line 100, 140)
- Context managers for resource cleanup: `with open()`, `with tempfile.NamedTemporaryFile()` ensure proper cleanup
- Explicit cleanup in finally blocks: `try/finally` pattern for temp file removal (`server.py` line 107-111)

## Logging

**Framework:** console output (no structured logging library)

**Patterns:**
- JavaScript: no logging; errors thrown or returned in error objects
- Python: print() for CLI output and FastAPI logging
  - Informational: `print(f"  INFO: ...")` (indented with two spaces, see `convert.py` line 63)
  - Warnings: `print(f"  WARNING: ...")` (same indentation)
  - Errors: `print(f"  ERROR: ...")` (same indentation)
  - Prompts/status: unindented messages to stdout

## Comments

**When to Comment:**
- Function purpose: required for all exported functions (JSDoc in JavaScript, module docstrings in Python)
- Non-obvious logic: inline comments for regex patterns, complex conditionals, temporary workarounds
- Section headers: visual separators for logical blocks using `# ─── Section Name ──────────` style (e.g., `src/App.jsx` line 8, `src/inputResolver.js` line 12)

**JSDoc/TSDoc:**
- JavaScript functions: JSDoc-style comments with `@param`, `@returns` (e.g., `src/inputResolver.js` lines 23-29, 50-54)
- Format: `/** ... */` block comments above function declarations
- Include parameter types and return types in description (no formal JSDoc @ tags for types used, just inline descriptions)
- Example from `src/inputResolver.js` line 114-116:
  ```javascript
  /**
   * Filter files into supported and skipped categories.
   * Returns { supported: File[], skippedNames: string[] }.
   */
  export function filterSupportedFiles(files) {
  ```

**Python docstrings:**
- Module docstring: triple-quoted at file head with purpose, usage examples (e.g., `convert.py` lines 1-10)
- Function docstring: description + Args + behavior (e.g., `postprocess.py` lines 121-134)
- Inline comments for complex logic: `# Comment on line above code` (not end-of-line comments)

## Function Design

**Size:** Keep functions focused on single responsibility
- Most functions 10-50 lines
- Longer functions (100+ lines) break complex workflows into helper functions: e.g., `detect_and_promote_headings` in `postprocess.py` line 121 uses helper patterns for Pass 1, Pass 2, Pass 3

**Parameters:**
- Prefer positional parameters for required arguments
- Named parameters for optional features: `pdf_engine="marker"` in `server.py` line 48
- Return objects (dicts/objects) to pass multiple values: `{ supported: File[], skippedNames: string[] }` from `filterSupportedFiles` (`src/inputResolver.js` line 130)

**Return Values:**
- Explicit return types in function comments/docstrings
- Return early pattern used for error cases: `if not file_path.exists(): ... return False` (`convert.py` line 156-161)
- Compound returns: dictionaries/objects for multiple values (e.g., `resolveInputs` returns `{ files, skippedNames, errors }` in `src/inputResolver.js`)

## Module Design

**Exports:**
- JavaScript: explicit named exports using `export function/const` (e.g., `export function isSupportedFile(name) { ... }` in `src/inputResolver.js` line 34)
- Python: all public functions implicitly exported; no `__all__` list used
- Barrel files: NOT used; imports reference specific modules

**File Responsibilities:**
- `src/inputResolver.js`: ZIP extraction, file validation, input normalization
- `src/convertRtf.js`: browser-side RTF to markdown conversion
- `src/convertOdt.js`: browser-side ODT to markdown conversion
- `src/serverApi.js`: HTTP client for local API server communication with caching
- `src/App.jsx`: React component orchestrating UI, state management, batch processing
- `convert.py`: CLI orchestration, file type detection, format routing
- `postprocess.py`: markdown cleaning, heading promotion, YAML front matter injection
- `server.py`: FastAPI server sharing conversion logic with CLI

---

*Convention analysis: 2026-03-17*
