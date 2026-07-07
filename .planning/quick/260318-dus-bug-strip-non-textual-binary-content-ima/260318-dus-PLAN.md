---
phase: quick-260318-dus
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.jsx
  - postprocess.py
  - src/__tests__/stripBinaryContent.test.js
autonomous: true
requirements: [DUS-01]

must_haves:
  truths:
    - "Base64 data URI images are stripped from browser-converted DOCX output"
    - "Pandoc media/ image references are stripped from Python CLI output"
    - "Alt text is preserved as [Image: alt text] placeholder when available"
    - "Images with no alt text become [Image removed]"
    - "LaTeX math expressions ($...$, $$...$$) are never stripped"
    - "Stripping occurs in both browser-side and Python-side pipelines"
  artifacts:
    - path: "src/App.jsx"
      provides: "stripBinaryContent function + integration into htmlToMarkdown img case and cleanMarkdown"
    - path: "postprocess.py"
      provides: "Image stripping in PostProcessor.clean()"
    - path: "src/__tests__/stripBinaryContent.test.js"
      provides: "Tests for browser-side stripping logic"
  key_links:
    - from: "src/App.jsx htmlToMarkdown()"
      to: "stripBinaryContent()"
      via: "img case returns placeholder instead of data URI"
      pattern: "\\[Image:"
    - from: "src/App.jsx cleanMarkdown()"
      to: "regex strip"
      via: "catches any remaining base64/media images from server path"
      pattern: "data:image|media/"
    - from: "postprocess.py PostProcessor.clean()"
      to: "regex strip"
      via: "strips image markdown in Python pipeline"
      pattern: "data:image|media/"
---

<objective>
Strip non-textual binary content (base64 images, media file references) from all conversion output paths to prevent context window bloat in RAG consumers. Replace stripped images with textual placeholders preserving alt-text signal.

Purpose: Converted markdown currently contains full base64 data URIs from DOCX images (mammoth) and media/ references from Pandoc, which are useless for RAG and massively inflate token counts.
Output: Clean markdown across all conversion paths with `[Image: alt text]` placeholders instead of binary blobs.
</objective>

<execution_context>
@/home/damienriehl/.claude/get-shit-done/workflows/execute-plan.md
@/home/damienriehl/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@postprocess.py
@src/App.jsx (htmlToMarkdown lines 145-208, cleanMarkdown lines 210-225, convertDocx lines 478-528, conversion pipeline lines 1290-1355)
@src/__tests__/convertRtf.test.js (test pattern reference)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add image stripping to browser-side pipeline (App.jsx) with tests</name>
  <files>src/App.jsx, src/__tests__/stripBinaryContent.test.js</files>
  <behavior>
    - Test 1: `![photo](data:image/png;base64,iVBOR...)` becomes `[Image: photo]`
    - Test 2: `![](data:image/jpeg;base64,/9j/4A...)` (no alt) becomes `[Image removed]`
    - Test 3: `![diagram](media/image1.png)` becomes `[Image: diagram]`
    - Test 4: `![](media/image2.png)` (no alt) becomes `[Image removed]`
    - Test 5: `$E = mc^2$` and `$$\int_0^1 f(x)dx$$` are NOT stripped (LaTeX safety)
    - Test 6: `![chart](https://example.com/chart.png)` external URLs are NOT stripped (only data: and media/)
    - Test 7: Multiple images in one string are all replaced
    - Test 8: `![fig](data:audio/mpeg;base64,...)` audio embeds are also stripped
  </behavior>
  <action>
    1. Create a `stripBinaryContent(md)` function in App.jsx (above `cleanMarkdown`), exported for testing via a comment marker or by extracting to a testable location. Actually — since App.jsx functions are not exported, create the function inline and also add it to a test file that duplicates the logic. Better approach: add the stripping as regex patterns directly in `cleanMarkdown()` and in the `htmlToMarkdown` img handler, then test via the conversion pipeline.

    Specific implementation:

    **In `htmlToMarkdown()`, `case "img"` (line 181-184):**
    Replace the current logic:
    ```js
    case "img": {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src") || "";
      return `![${alt}](${src})`;
    }
    ```
    With:
    ```js
    case "img": {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src") || "";
      // Strip binary content (base64 data URIs, media/ refs) — useless for RAG
      if (/^data:|^media\//i.test(src)) {
        return alt.trim() ? `[Image: ${alt.trim()}]` : "[Image removed]";
      }
      return `![${alt}](${src})`;
    }
    ```

    **In `cleanMarkdown()` (line 210-225), add AFTER the existing cleanup rules (belt-and-suspenders for server-converted output):**
    ```js
    // Strip base64 image embeds: ![alt](data:image/...) or ![alt](data:audio/...)
    t = t.replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, (_, alt) =>
      alt.trim() ? `[Image: ${alt.trim()}]` : "[Image removed]"
    );
    // Strip Pandoc media references: ![alt](media/...)
    t = t.replace(/!\[([^\]]*)\]\(media\/[^)]+\)/g, (_, alt) =>
      alt.trim() ? `[Image: ${alt.trim()}]` : "[Image removed]"
    );
    ```

    2. Create `src/__tests__/stripBinaryContent.test.js` that tests the regex patterns directly (extract the two regexes into testable const patterns, or test by running cleanMarkdown if it can be imported — but since App.jsx functions are module-private, extract just the `stripImages` regex replacements into a tiny `src/stripImages.js` utility that both cleanMarkdown and tests import).

    **Revised approach (cleaner):** Create `src/stripImages.js` with a single exported function `stripImageEmbeds(md)` that applies the two regex replacements. Import it in App.jsx's `cleanMarkdown` and in the test file. This avoids duplicating logic.

    `src/stripImages.js`:
    ```js
    /**
     * Strip binary image/audio embeds and local media references from markdown.
     * Replaces with [Image: alt] or [Image removed] placeholders.
     * Preserves external URL images and LaTeX math.
     */
    export function stripImageEmbeds(md) {
      // Strip base64 data URI embeds (images, audio, etc.)
      let t = md.replace(/!\[([^\]]*)\]\(data:[^)]+\)/g, (_, alt) =>
        alt.trim() ? `[Image: ${alt.trim()}]` : "[Image removed]"
      );
      // Strip Pandoc/converter media directory references
      t = t.replace(/!\[([^\]]*)\]\(media\/[^)]+\)/g, (_, alt) =>
        alt.trim() ? `[Image: ${alt.trim()}]` : "[Image removed]"
      );
      return t;
    }
    ```

    In App.jsx:
    - Add import: `import { stripImageEmbeds } from "./stripImages.js";`
    - In `htmlToMarkdown` img case: add the early return for data:/media/ src (inline check, does not need the util — catches at HTML-to-MD conversion time)
    - In `cleanMarkdown`: add `t = stripImageEmbeds(t);` after existing cleanup rules (catches anything from server-converted markdown)
  </action>
  <verify>
    <automated>cd "/home/damienriehl/Coding Projects/doc-to-markdown" && npx vitest run src/__tests__/stripBinaryContent.test.js</automated>
  </verify>
  <done>
    - stripImageEmbeds utility function exists and is tested
    - htmlToMarkdown img handler strips data: and media/ sources at parse time
    - cleanMarkdown calls stripImageEmbeds as belt-and-suspenders
    - All 8 behavior tests pass
    - LaTeX math and external URLs are provably unaffected
  </done>
</task>

<task type="auto">
  <name>Task 2: Add image stripping to Python-side PostProcessor.clean()</name>
  <files>postprocess.py</files>
  <action>
    In `PostProcessor.clean()` method, add these regex substitutions BEFORE the final `text.strip()` call (around line 84):

    ```python
    # Strip base64 data URI image/audio embeds (from PDF engines, etc.)
    text = re.sub(
        r"!\[([^\]]*)\]\(data:[^)]+\)",
        lambda m: f"[Image: {m.group(1).strip()}]" if m.group(1).strip() else "[Image removed]",
        text,
    )
    # Strip Pandoc media directory references (useless without actual images)
    text = re.sub(
        r"!\[([^\]]*)\]\(media/[^)]+\)",
        lambda m: f"[Image: {m.group(1).strip()}]" if m.group(1).strip() else "[Image removed]",
        text,
    )
    ```

    These patterns are intentionally narrow:
    - Only targets `data:` URIs (base64 embeds) and `media/` paths (Pandoc extractions)
    - Does NOT touch `![alt](https://...)` external URLs
    - Does NOT touch LaTeX math (`$...$`, `$$...$$`, `\begin{equation}`)
    - The `[^)]+` after data:/media/ is greedy-safe since markdown image syntax cannot contain unescaped `)` in the URL

    Also update the module docstring to mention image stripping.
  </action>
  <verify>
    <automated>cd "/home/damienriehl/Coding Projects/doc-to-markdown" && python3 -c "
from postprocess import PostProcessor
pp = PostProcessor()
# Test base64 stripping with alt
assert '[Image: photo]' in pp.clean('Hello ![photo](data:image/png;base64,iVBOR...) world')
# Test base64 stripping without alt
assert '[Image removed]' in pp.clean('Hello ![](data:image/jpeg;base64,/9j/4A...) world')
# Test media/ stripping
assert '[Image: diagram]' in pp.clean('![diagram](media/image1.png)')
# Test media/ without alt
assert '[Image removed]' in pp.clean('![](media/image2.png)')
# Test LaTeX is safe
result = pp.clean(r'Math: \$E = mc^2\$ and \$\$\int f(x)dx\$\$')
assert 'Image' not in result
# Test external URL is preserved
result = pp.clean('![chart](https://example.com/chart.png)')
assert '![chart](https://example.com/chart.png)' in result
print('All Python stripping tests passed')
"
    </automated>
  </verify>
  <done>
    - PostProcessor.clean() strips base64 data URI images with alt-text placeholders
    - PostProcessor.clean() strips media/ references with alt-text placeholders
    - LaTeX math expressions pass through untouched
    - External URL images pass through untouched
    - Both CLI pipeline (convert.py) and server pipeline (server.py) benefit since both call PostProcessor.clean()
  </done>
</task>

</tasks>

<verification>
1. `npx vitest run` — all existing tests still pass (no regressions)
2. `npx vitest run src/__tests__/stripBinaryContent.test.js` — new stripping tests pass
3. Python inline test (in Task 2 verify) passes
4. Manual spot check: convert a DOCX with images, confirm no base64 in output
</verification>

<success_criteria>
- No `data:image` or `data:audio` URIs survive in any conversion output path
- No `media/imageN.png` references survive in any conversion output path
- Alt text is preserved as `[Image: alt text]` when present
- Missing alt text produces `[Image removed]`
- LaTeX math ($, $$, \begin{equation}) is never affected
- External URL images (https://...) are never affected
- All existing tests continue to pass
</success_criteria>

<output>
After completion, create `.planning/quick/260318-dus-bug-strip-non-textual-binary-content-ima/260318-dus-SUMMARY.md`
</output>
