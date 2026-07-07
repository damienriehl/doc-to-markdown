/**
 * Local API Server client
 *
 * Handles auto-detection and communication with the optional
 * local FastAPI server (python server.py) for full-quality conversion.
 */

const SERVER_URL = "http://127.0.0.1:9378";
const CACHE_DURATION_MS = 30_000; // 30 seconds

let cachedStatus = null;
let cachedAt = 0;

/**
 * Check if the local API server is running.
 * Caches the result for 30 seconds.
 */
export async function isServerAvailable() {
  const now = Date.now();
  if (cachedStatus !== null && now - cachedAt < CACHE_DURATION_MS) {
    return cachedStatus;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${SERVER_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    cachedStatus = data.status === "ok";
  } catch {
    cachedStatus = false;
  }
  cachedAt = now;
  return cachedStatus;
}

/**
 * Clear the server status cache (e.g., when user wants to recheck).
 */
export function clearServerCache() {
  cachedStatus = null;
  cachedAt = 0;
}

/**
 * Convert a project name to a filesystem-safe slug.
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}

/**
 * Save project metadata to the server filesystem.
 * Fire-and-forget — resolves even if server is unreachable.
 *
 * @param {string} slug - Filesystem slug
 * @param {Object} projectRecord - Project metadata (JSON-serializable)
 * @returns {Promise<{slug: string, path: string}|null>}
 */
export async function saveProjectToServer(slug, projectRecord) {
  try {
    const formData = new FormData();
    formData.append("metadata", JSON.stringify(projectRecord));
    const res = await fetch(`${SERVER_URL}/projects/${encodeURIComponent(slug)}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      console.warn("[server sync] save failed:", res.status);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn("[server sync] save error:", e);
    return null;
  }
}

/**
 * Rename a project directory on the server.
 * Fire-and-forget — resolves even if server is unreachable.
 *
 * @param {string} oldSlug - Current directory slug
 * @param {string} newSlug - New directory slug
 * @returns {Promise<{slug: string, path: string}|null>}
 */
export async function renameProjectOnServer(oldSlug, newSlug) {
  try {
    const formData = new FormData();
    formData.append("new_slug", newSlug);
    const res = await fetch(`${SERVER_URL}/projects/${encodeURIComponent(oldSlug)}/rename`, {
      method: "PUT",
      body: formData,
    });
    if (!res.ok) {
      console.warn("[server sync] rename failed:", res.status);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn("[server sync] rename error:", e);
    return null;
  }
}

/**
 * Delete a project directory on the server.
 * Fire-and-forget — resolves even if server is unreachable.
 *
 * @param {string} slug - Directory slug to delete
 * @returns {Promise<{deleted: boolean, slug: string}|null>}
 */
export async function deleteProjectOnServer(slug) {
  try {
    const res = await fetch(`${SERVER_URL}/projects/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      console.warn("[server sync] delete failed:", res.status);
      return null;
    }
    return res.json();
  } catch (e) {
    console.warn("[server sync] delete error:", e);
    return null;
  }
}

/**
 * Convert a file using the local API server.
 * Returns { markdown, filename } or throws on error.
 */
export async function convertViaServer(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const res = await fetch(`${SERVER_URL}/convert`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Server error: ${res.status}`);
  }

  return res.json();
}
