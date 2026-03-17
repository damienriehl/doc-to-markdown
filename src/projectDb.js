/**
 * projectDb.js — IndexedDB persistence layer (Dexie adapter)
 *
 * Provides the storage API consumed by Phase 2's useProjectStore hook.
 * All IndexedDB access goes through this module — no other file imports Dexie.
 *
 * Schema:
 *   projects — metadata JSON (id, name, updatedAt, book, chapters, uiState)
 *   files    — binary blobs keyed by blobId, indexed by projectId for bulk-delete
 */

import Dexie from "dexie";

// --- Constants ---------

export const DB_VERSION = 1;
const DB_NAME = "doc-to-markdown";

// --- Singleton ---------

let _db = null;

/**
 * Open (or return cached) Dexie database instance.
 *
 * onversionchange: closes this tab's connection so other tabs can upgrade.
 * blocked: fires if this tab is blocking an upgrade from another tab.
 *
 * @returns {Dexie}
 */
function getDb() {
  if (_db) return _db;

  const db = new Dexie(DB_NAME);

  db.version(DB_VERSION).stores({
    // projects: metadata JSON (no blobs — File objects live in `files`)
    // id is our UUID string (NOT auto-increment)
    projects: "id, name, updatedAt",

    // files: binary blobs keyed by blobId
    // projectId index enables bulk-delete when a project is removed
    files: "id, projectId",
  });

  db.on("versionchange", () => {
    db.close();
  });

  db.on("blocked", () => {
    console.warn("[projectDb] IndexedDB upgrade blocked -- close other tabs to proceed.");
  });

  _db = db;
  return db;
}

/**
 * Close and delete the Dexie database, then reset the singleton.
 * Used in tests to ensure a clean state between test cases.
 * @returns {Promise<void>}
 */
export async function _resetDbForTest() {
  if (_db) {
    _db.close();
    await _db.delete();
    _db = null;
  }
}

// --- Project CRUD ---------

/**
 * Save or replace a project record (metadata only — no blobs).
 * Throws with a user-friendly message if storage is full.
 *
 * @param {Object} projectRecord - The project metadata object to persist
 * @returns {Promise<void>}
 */
export async function putProject(projectRecord) {
  try {
    await getDb().projects.put(projectRecord);
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      throw new Error("Storage full. Free up browser storage and try again.");
    }
    throw err;
  }
}

/**
 * Get a single project record by UUID.
 *
 * @param {string} id - Project UUID
 * @returns {Promise<Object|undefined>} The project record, or undefined if not found
 */
export async function getProject(id) {
  return getDb().projects.get(id);
}

/**
 * List all projects sorted by most recently updated (descending).
 *
 * @returns {Promise<Object[]>} Array of project records
 */
export async function listProjects() {
  return getDb().projects.orderBy("updatedAt").reverse().toArray();
}

/**
 * Delete a project record AND all its associated file blobs in a single transaction.
 *
 * @param {string} id - Project UUID
 * @returns {Promise<void>}
 */
export async function deleteProject(id) {
  await getDb().transaction("rw", [getDb().projects, getDb().files], async () => {
    await getDb().projects.delete(id);
    await getDb().files.where("projectId").equals(id).delete();
  });
}

/**
 * Rename a project by updating its name and updatedAt timestamp.
 * No-op if the project does not exist.
 *
 * @param {string} id - Project UUID
 * @param {string} newName - New project name
 * @returns {Promise<void>}
 */
export async function renameProject(id, newName) {
  const record = await getProject(id);
  if (!record) return;
  await putProject({ ...record, name: newName, updatedAt: new Date().toISOString() });
}

// --- File Blob Storage ---------

/**
 * Store multiple file blobs in a single bulkPut transaction.
 * Throws with a user-friendly message if storage is full.
 *
 * @param {string} projectId - Project UUID that owns these blobs
 * @param {Array<{ id: string, file: File, name: string }>} blobs - Blobs to store
 * @returns {Promise<void>}
 */
export async function putFiles(projectId, blobs) {
  const records = blobs.map(({ id, file, name }) => ({
    id,
    projectId,
    blob: file,
    name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  }));

  try {
    await getDb().files.bulkPut(records);
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      throw new Error("Storage full. Free up browser storage and try again.");
    }
    throw err;
  }
}

/**
 * Retrieve all file blobs for a project as a Map keyed by blobId.
 * Each entry is a reconstructed File object with correct name, type, and lastModified.
 *
 * @param {string} projectId - Project UUID
 * @returns {Promise<Map<string, File>>} Map of blobId to File
 */
export async function getFiles(projectId) {
  const records = await getDb().files.where("projectId").equals(projectId).toArray();
  const map = new Map();
  for (const rec of records) {
    map.set(rec.id, new File([rec.blob], rec.name, {
      type: rec.type,
      lastModified: rec.lastModified,
    }));
  }
  return map;
}

// --- Storage Persistence ---------

/**
 * Request persistent storage to prevent browser eviction of IndexedDB data.
 * Returns true if granted, false if denied or API is unavailable.
 * Never throws.
 *
 * @returns {Promise<boolean>}
 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // navigator.storage unavailable (e.g. Node test environment) — not an error
  }
  return false;
}

// --- Last Active Project ---------

const LAST_PROJECT_KEY = "doc-to-markdown:lastProjectId";

/**
 * Persist the last-opened project ID to localStorage.
 * Silently swallows errors (e.g. private browsing mode).
 *
 * @param {string} id - Project UUID to persist
 * @returns {void}
 */
export function saveLastProjectId(id) {
  try { localStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* private browsing */ }
}

/**
 * Retrieve the last-opened project ID from localStorage.
 * Returns null if nothing is saved or localStorage is unavailable.
 *
 * @returns {string|null}
 */
export function getLastProjectId() {
  try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
}
