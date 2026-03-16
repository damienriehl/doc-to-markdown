/**
 * Input Resolver — Unified Input Layer
 *
 * Normalizes any input source (ZIP archives, dropped folders, individual files)
 * into a flat list of convertible File objects.
 */

const SUPPORTED_EXTENSIONS = new Set(["docx", "pdf", "rtf", "odt", "txt"]);

const OS_ARTIFACT_NAMES = new Set([
  ".DS_Store", "Thumbs.db", "desktop.ini",
]);

const OS_ARTIFACT_PREFIXES = [
  "__MACOSX/", "__MACOSX\\",
  ".Spotlight-V100/", ".Trashes/",
  "__pycache__/", ".git/",
];

const MAX_ZIP_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_ZIP_ENTRIES = 1000;

/**
 * Get file extension (lowercase, without dot).
 */
function getExtension(name) {
  const m = name.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Check if a filename has a supported extension.
 */
export function isSupportedFile(name) {
  return SUPPORTED_EXTENSIONS.has(getExtension(name));
}

/**
 * Check if a path should be skipped (OS artifacts, hidden files).
 */
function isOsArtifact(path) {
  const name = path.split("/").pop().split("\\").pop();
  if (OS_ARTIFACT_NAMES.has(name)) return true;
  if (name.startsWith(".")) return true;
  for (const prefix of OS_ARTIFACT_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Extract convertible files from a ZIP archive.
 * Returns synthetic File objects constructed from the ZIP contents.
 */
export async function extractZip(zipFile) {
  const JSZip = (await import("jszip")).default;
  const buf = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // ZIP bomb protection: check entry count
  const entries = Object.values(zip.files).filter(f => !f.dir);
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP has ${entries.length} entries (max ${MAX_ZIP_ENTRIES}). Skipping for safety.`);
  }

  // Check cumulative decompressed size
  let totalSize = 0;
  for (const entry of entries) {
    if (entry._data && entry._data.uncompressedSize) {
      totalSize += entry._data.uncompressedSize;
    }
  }
  if (totalSize > MAX_ZIP_SIZE) {
    throw new Error(`ZIP decompressed size exceeds 500MB. Skipping for safety.`);
  }

  const files = [];
  const usedNames = new Set();

  for (const entry of entries) {
    const fullPath = entry.name;

    // Skip OS artifacts
    if (isOsArtifact(fullPath)) continue;

    // Get just the filename (flatten hierarchy)
    const originalName = fullPath.split("/").pop();
    if (!originalName) continue;

    // Skip nested ZIPs and unsupported files
    const ext = getExtension(originalName);
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    // Handle duplicate names with counter suffix
    let finalName = originalName;
    if (usedNames.has(finalName.toLowerCase())) {
      const stem = originalName.replace(/\.[^.]+$/, "");
      let counter = 2;
      while (usedNames.has(`${stem}-${counter}.${ext}`.toLowerCase())) {
        counter++;
      }
      finalName = `${stem}-${counter}.${ext}`;
    }
    usedNames.add(finalName.toLowerCase());

    const blob = await entry.async("blob");
    const file = new File([blob], finalName, { type: blob.type });
    files.push(file);
  }

  return files;
}

/**
 * Filter files into supported and skipped categories.
 * Returns { supported: File[], skippedNames: string[] }.
 */
export function filterSupportedFiles(files) {
  const supported = [];
  const skippedNames = [];

  for (const f of files) {
    if (isSupportedFile(f.name) || getExtension(f.name) === "zip") {
      supported.push(f);
    } else {
      skippedNames.push(f.name);
    }
  }

  return { supported, skippedNames };
}

/**
 * Resolve inputs: extract ZIPs, pass through regular files.
 * Returns { files: File[], skippedNames: string[], errors: string[] }.
 */
export async function resolveInputs(files) {
  const resolved = [];
  const skippedNames = [];
  const errors = [];

  for (const f of files) {
    if (getExtension(f.name) === "zip") {
      try {
        const extracted = await extractZip(f);
        resolved.push(...extracted);
        if (extracted.length === 0) {
          skippedNames.push(`${f.name} (no convertible files inside)`);
        }
      } catch (err) {
        errors.push(`${f.name}: ${err.message}`);
      }
    } else if (isSupportedFile(f.name)) {
      resolved.push(f);
    } else {
      skippedNames.push(f.name);
    }
  }

  return { files: resolved, skippedNames, errors };
}
