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
