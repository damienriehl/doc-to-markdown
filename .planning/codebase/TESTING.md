# Testing Patterns

**Analysis Date:** 2026-03-17

## Test Framework

**Runner:**
- Vitest (v4.1.0)
- Config: `vite.config.js` (no separate vitest config; uses Vite plugin)

**Assertion Library:**
- Vitest built-in expect API

**Run Commands:**
```bash
npm test                  # Run all tests
npm run test             # Same as npm test (from package.json line 10)
```

## Test File Organization

**Location:**
- Co-located with source: tests stored in `src/__tests__/` directory
- File naming: `[sourceFileName].test.js` (e.g., `convertRtf.test.js` mirrors `convertRtf.js`)

**Naming:**
- Test files: `src/__tests__/convertRtf.test.js`, `src/__tests__/inputResolver.test.js`
- Suite names: match module names (e.g., `describe("convertRtf", ...)`, `describe("isSupportedFile", ...)`)

**Structure:**
```
src/__tests__/
├── convertRtf.test.js
└── inputResolver.test.js
```

## Test Structure

**Suite Organization:**
```javascript
// From src/__tests__/convertRtf.test.js
describe("convertRtf", () => {
  function fakeRtfFile(content) {
    return {
      text: () => Promise.resolve(content),
      name: "test.rtf",
    };
  }

  it("extracts plain text from basic RTF", async () => {
    const rtf = String.raw`{\rtf1\ansi{...`;
    const result = await convertRtf(fakeRtfFile(rtf));
    expect(result.md).toContain("Hello World");
    expect(result.isBasicQuality).toBe(true);
  });
});
```

**Patterns:**
- Setup per suite: local helper functions (e.g., `fakeRtfFile`) defined in describe block (not beforeEach)
- No teardown: no explicit cleanup needed for unit tests (no state between tests)
- Async tests: `async` keyword in `it` callback, `await` for async operations (e.g., `src/__tests__/convertRtf.test.js` line 12-19)
- String templates: `String.raw` for RTF test fixtures to avoid escape sequence confusion

## Mocking

**Framework:** Not explicitly mocked; manual test doubles used

**Patterns:**
```javascript
// From src/__tests__/inputResolver.test.js line 28-30
function fakeFile(name) {
  return { name };
}

// From src/__tests__/convertRtf.test.js line 5-10
function fakeRtfFile(content) {
  return {
    text: () => Promise.resolve(content),
    name: "test.rtf",
  };
}
```

**What to Mock:**
- File objects: create minimal test doubles implementing only required interface (name property, text() method)
- No mocking of imported modules or external APIs in current test suite

**What NOT to Mock:**
- Actual conversion logic: tests verify real behavior of `convertRtf`, `isSupportedFile`, etc.
- File system: tests use in-memory objects, not filesystem access

## Fixtures and Factories

**Test Data:**
- Inline RTF strings using `String.raw` template literals:
  ```javascript
  // src/__tests__/convertRtf.test.js line 13
  const rtf = String.raw`{\rtf1\ansi{\fonttbl\f0 Times New Roman;}\f0\fs24 Hello World}`;
  ```
- Fake file factory functions scoped to test suites (see **Mocking** section above)
- No external fixture files used

**Location:**
- Fixtures defined as local functions in describe blocks (e.g., `fakeRtfFile`, `fakeFile`)
- No shared fixture directory

## Coverage

**Requirements:** Not enforced; no coverage targets detected

**View Coverage:**
- No coverage reporting configured in `vite.config.js` or `package.json`
- To add coverage: would require vitest coverage plugin configuration

## Test Types

**Unit Tests:**
- Scope: individual functions and modules
- Approach: test behavior with minimal dependencies, use test doubles for File/input objects
- Examples:
  - `convertRtf.test.js`: Tests RTF stripping, paragraph breaks, special characters, hex escapes
  - `inputResolver.test.js`: Tests file validation, ZIP handling, directory traversal

**Integration Tests:**
- Not present in current codebase
- Python CLI/API testing (manual or shell-based) not in test suite

**E2E Tests:**
- Not used; browser-based testing would require end-to-end framework

## Common Patterns

**Async Testing:**
```javascript
// From src/__tests__/convertRtf.test.js line 12-20
it("extracts plain text from basic RTF", async () => {
  const rtf = String.raw`{\rtf1\ansi{\fonttbl\f0 Times New Roman;}\f0\fs24 Hello World}`;
  const result = await fakeRtfFile(rtf).text().then(text => {
    return convertRtf(fakeRtfFile(rtf));
  });
  expect(result.md).toContain("Hello World");
  expect(result.isBasicQuality).toBe(true);
});
```
- Use `async` in test function signature
- Await Promise-returning functions
- Mix Promise.then() with await (line 14) for nested async operations

**Error Testing:**
- Not heavily covered in current tests
- Pattern for future error tests: create test inputs that trigger error conditions (e.g., missing required properties)
- Example approach from `inputResolver.test.js`:
  ```javascript
  it("skips unsupported files with names", async () => {
    const files = [fakeFile("ch1.docx"), fakeFile("image.png")];
    const result = await resolveInputs(files);
    expect(result.files.map(f => f.name)).toEqual(["ch1.docx"]);
    expect(result.skippedNames).toEqual(["image.png"]);
  });
  ```
  - Returns error information in result object rather than throwing
  - Tests verify error info is collected/returned correctly

## Notable Test Coverage

**Well-tested:**
- Input validation: `isSupportedFile()` tests multiple extension cases and case-insensitivity
- File filtering: `filterSupportedFiles()` separates supported vs. skipped files
- RTF conversion: paragraph breaks, special characters (em-dash, quotes), hex escapes
- Input resolution: file pass-through, ZIP handling, unsupported file skipping

**Gaps:**
- No tests for `convertOdt()` (browser-side ODT converter)
- No tests for `serverApi.js` (HTTP client)
- No tests for `App.jsx` (React component)
- No tests for Python modules (`convert.py`, `postprocess.py`, `server.py`)

---

*Testing analysis: 2026-03-17*
