/**
 * Project Serializer
 *
 * Handles the serialization boundary between the in-memory App.jsx state
 * (which contains live File objects) and the JSON-safe representation stored
 * in IndexedDB or written to disk.
 *
 * The problem: File objects collapse to {} under JSON.stringify silently.
 * The solution: serializeProject() extracts File objects into a separate
 * blobs array, keyed by a stable blobId. deserializeProject() reattaches
 * them from a blobMap (Map<blobId, File>) at load time.
 */

// --- Schema ---------

/**
 * Current schema version. Increment when the stored shape changes in a way
 * that requires migration logic.
 */
export const SCHEMA_VERSION = 1;

// --- Serialize ---------

/**
 * Convert an in-memory project (with File objects) into a JSON-safe
 * projectRecord plus a separate blobs array.
 *
 * @param {object} params
 * @param {string} params.id - Stable project UUID
 * @param {string} params.name - Human-readable project name
 * @param {{ title: string, author: string }} params.book - Book metadata
 * @param {Array<object>} params.chapters - Chapter objects from App.jsx state
 * @param {object} [params.uiState={}] - Serializable UI state
 * @param {string} [params.createdAt] - Existing ISO timestamp; generated if omitted
 * @returns {{ projectRecord: object, blobs: Array<{ id: string, file: File, name: string }> }}
 *   projectRecord is JSON-safe; blobs holds extracted File references keyed by id
 */
export function serializeProject({ id, name, book, chapters, uiState = {}, createdAt }) {
  const now = new Date().toISOString();
  const blobs = [];

  const serializedChapters = chapters.map((chapter) => {
    const blobId = chapter.blobId ?? crypto.randomUUID();

    // Only push a blob entry when the chapter has a live File object
    if (chapter.file) {
      blobs.push({ id: blobId, file: chapter.file, name: chapter.fileName });
    }

    // Return every safe-to-serialize field; deliberately omit `file`
    return {
      id: chapter.id,
      blobId,
      fileName: chapter.fileName,
      fileType: chapter.fileType,
      title: chapter.title,
      slug: chapter.slug,
      chapterNum: chapter.chapterNum,
      topics: chapter.topics ?? [],
      keyTerms: chapter.keyTerms ?? [],
      markdownContent: chapter.markdownContent ?? "",
      status: chapter.status ?? "pending",
    };
  });

  const projectRecord = {
    id,
    name,
    version: SCHEMA_VERSION,
    createdAt: createdAt ?? now,
    updatedAt: now,
    book: {
      title: book.title ?? "",
      author: book.author ?? "",
    },
    chapters: serializedChapters,
    uiState,
  };

  return { projectRecord, blobs };
}

// --- Deserialize ---------

/**
 * Reconstruct in-memory project state from a stored projectRecord and a
 * blobMap that maps blobId strings back to live File objects.
 *
 * @param {object} projectRecord - JSON-safe record as produced by serializeProject
 * @param {Map<string, File>} [blobMap=new Map()] - Map from blobId to File; entries
 *   missing from the map result in null file references on the chapter
 * @returns {{ book: object, chapters: Array<object>, uiState: object }}
 */
export function deserializeProject(projectRecord, blobMap = new Map()) {
  const chapters = (projectRecord.chapters ?? []).map((chapter) => ({
    ...chapter,
    file: blobMap.get(chapter.blobId) ?? null,
    keyTerms: chapter.keyTerms ?? [],
    topics: chapter.topics ?? [],
  }));

  return {
    book: projectRecord.book ?? { title: "", author: "" },
    chapters,
    uiState: projectRecord.uiState ?? {},
  };
}
