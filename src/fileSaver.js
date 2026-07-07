/**
 * fileSaver.js — Smart file save utility
 *
 * Uses File System Access API (showSaveFilePicker) in Chromium browsers
 * to let the user pick a save location. Falls back to anchor-click download
 * in Firefox/Safari or when forceFallback is specified.
 *
 * Remembers the last chosen FileSystemFileHandle per session so subsequent
 * saves open in the same directory.
 */

// Module-level cache: stores the last FileSystemFileHandle returned by the picker.
// Passing this as `startIn` reopens the dialog in the same folder.
let cachedFileHandle = null;

/** Reset cached handle — test use only. */
export function _resetCachedHandleForTest() {
  cachedFileHandle = null;
}

// ─── smartFilename ────────────────────────────────────────────────────────────

/**
 * Generate a smart, date-prefixed filename for a given file type.
 *
 * @param {"chapter"|"index"|"combined"|"zip"} type
 * @param {{ chapterNum?: number, slug?: string, bookTitle?: string }} [opts]
 * @returns {string}
 */
export function smartFilename(type, opts = {}) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  switch (type) {
    case "chapter": {
      const num = String(opts.chapterNum ?? 0).padStart(2, "0");
      const titled = titleCaseSlug(opts.slug ?? "");
      return `${date} ${num}-${titled}.md`;
    }

    case "index":
      return `${date} 00-index.md`;

    case "combined":
      return `${date} 00-complete-book.md`;

    case "zip": {
      const raw = opts.bookTitle || "";
      const slug = raw.trim()
        ? raw.trim().toLowerCase().replace(/\s+/g, "-")
        : "book";
      return `${date} ${slug}-markdown.zip`;
    }

    default:
      return `${date} file`;
  }
}

/**
 * Convert a hyphenated slug to Title-Case-Hyphenated.
 * "jury-selection" → "Jury-Selection"
 *
 * @param {string} slug
 * @returns {string}
 */
function titleCaseSlug(slug) {
  return slug
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

// ─── Fallback: anchor-click download ─────────────────────────────────────────

/**
 * Download content using the legacy anchor-click approach.
 *
 * @param {string} filename
 * @param {Blob} blob
 */
function anchorDownload(filename, blob) {
  const url = globalThis.URL.createObjectURL(blob);
  const a = globalThis.document.createElement("a");
  a.href = url;
  a.download = filename;
  globalThis.document.body.appendChild(a);
  a.click();
  globalThis.document.body.removeChild(a);
  globalThis.URL.revokeObjectURL(url);
}

// ─── saveFile ─────────────────────────────────────────────────────────────────

/**
 * Save a text string to a file. Uses the File System Access API when available
 * (Chromium), falls back to anchor-click download elsewhere.
 *
 * @param {string} filename       Suggested save filename
 * @param {string} content        Text content to write
 * @param {{ mimeType?: string, forceFallback?: boolean }} [opts]
 */
export async function saveFile(filename, content, opts = {}) {
  const mimeType = opts.mimeType ?? "text/markdown;charset=utf-8";
  const forceFallback = opts.forceFallback ?? false;

  if (!forceFallback && typeof globalThis.showSaveFilePicker === "function") {
    try {
      const fileHandle = await globalThis.showSaveFilePicker({
        suggestedName: filename,
        startIn: cachedFileHandle ?? "downloads",
        types: [
          {
            description: "Markdown file",
            accept: { "text/markdown": [".md"] },
          },
        ],
      });

      cachedFileHandle = fileHandle;

      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — do nothing
        return;
      }
      throw err;
    }
  } else {
    // Fallback: anchor-click
    const blob = new Blob([content], { type: mimeType });
    anchorDownload(filename, blob);
  }
}

// ─── saveBlob ─────────────────────────────────────────────────────────────────

/**
 * Save a pre-built Blob to a file. Uses the File System Access API when
 * available (for ZIP files etc.), falls back to anchor-click download.
 *
 * @param {string} filename   Suggested save filename
 * @param {Blob}   blob       Pre-built Blob to save
 */
export async function saveBlob(filename, blob) {
  if (typeof globalThis.showSaveFilePicker === "function") {
    try {
      const fileHandle = await globalThis.showSaveFilePicker({
        suggestedName: filename,
        startIn: cachedFileHandle ?? "downloads",
      });

      cachedFileHandle = fileHandle;

      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — do nothing
        return;
      }
      throw err;
    }
  } else {
    // Fallback: anchor-click
    anchorDownload(filename, blob);
  }
}
