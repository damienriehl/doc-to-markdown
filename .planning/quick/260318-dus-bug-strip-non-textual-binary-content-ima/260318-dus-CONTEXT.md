# Quick Task 260318-dus: Strip non-textual binary content from converted output - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Task Boundary

BUG: When the original doc (e.g., .docx) has an image, the system converts to binary (base64 data URIs). This blows up the context window for RAG consumers. SOLUTION: Strip non-textual content (images, embedded audio) from output, but preserve important textual signal.

</domain>

<decisions>
## Implementation Decisions

### Image placeholders
- When an image is stripped, replace it with `[Image: alt text]` if alt text exists, otherwise `[Image removed]`
- Preserves signal about what illustrations existed without the binary bloat

### Math/equation safety
- Only strip specifically-targeted patterns: base64 `data:image` URIs, media file references (`![](media/...)`), and known binary embedding patterns
- LaTeX math ($...$, $$...$$, \begin{equation}) is safe — clearly delimited, leave untouched
- Do NOT use aggressive heuristics (e.g., percent non-ASCII) that could strip legitimate Unicode text

### Claude's Discretion
- Pandoc media references (`![](media/...)`) — strip these too since they're useless for RAG (no actual image in the markdown)
- Apply stripping in all conversion paths: browser-side (mammoth DOCX, RTF, ODT) and Python-side (postprocess.py)

</decisions>

<specifics>
## Specific Ideas

- Browser DOCX (mammoth): images become `![alt](data:image/png;base64,...)` — primary bloat source
- Python CLI (Pandoc): images extracted to media/ dir, markdown gets `![](media/image1.png)` — not inline binary but still useless
- Browser RTF: already strips `\pict` groups — images already removed
- Browser ODT: doesn't handle `draw:image` — images silently skipped
- PDF engines (Marker/PyMuPDF): may also embed base64 images

</specifics>
