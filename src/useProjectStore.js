/**
 * useProjectStore — central persistence hook
 *
 * Bridges Phase 1 storage primitives (projectDb, projectSerializer) with the
 * React UI. This hook owns ALL persistence logic:
 *
 *   - Boot hydration: loads last-opened project from IndexedDB on mount
 *   - save(name): serializes and persists project to IndexedDB
 *   - load(id): restores project from IndexedDB (with File objects reattached)
 *   - isDirty: true whenever in-memory state diverges from last save
 *   - saveStatus: "saved" | "unsaved" | "saving"
 *   - bootStatus: "idle" | "loading" | "ready"
 *   - beforeunload guard: warns user on navigation when isDirty is true
 *   - load-sequence token: prevents stale async results from corrupting state
 *   - switchProject / confirmSwitch / cancelSwitch: dirty-state guard for project switching
 *   - newProject: resets to blank in-memory state
 */

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import {
  putProject,
  getProject,
  listProjects,
  putFiles,
  getFiles,
  saveLastProjectId,
  getLastProjectId,
  requestPersistentStorage,
} from "./projectDb.js";
import { serializeProject, deserializeProject } from "./projectSerializer.js";

// --- Exported helper (also used internally) ---------------------------------

/**
 * Produce a stable JSON string snapshot of book + chapters for dirty checking.
 *
 * Deliberately excludes:
 *   - `file` — live File object; not part of content identity
 *   - `_dragging` — transient UI flag; must not trigger dirty state
 *
 * @param {{ title: string, author: string }} book
 * @param {Array<object>} chapters
 * @returns {string} JSON snapshot
 */
export function buildSnapshot(book, chapters) {
  return JSON.stringify({
    book,
    chapters: chapters.map(({ file, _dragging, ...rest }) => rest),
  });
}

// --- Hook -------------------------------------------------------------------

/**
 * useProjectStore — all persistence state and actions for the application.
 *
 * @returns {{
 *   book: object,
 *   setBook: Function,
 *   chapters: Array,
 *   setChapters: Function,
 *   activeProjectId: string|null,
 *   activeProjectName: string,
 *   projectList: Array,
 *   isDirty: boolean,
 *   saveStatus: "saved"|"unsaved"|"saving",
 *   bootStatus: "idle"|"loading"|"ready",
 *   save: Function,
 *   load: Function,
 *   switchProject: Function,
 *   confirmSwitch: Function,
 *   cancelSwitch: Function,
 *   newProject: Function,
 * }}
 */
export function useProjectStore() {
  const [book, setBook] = useState({ title: "", author: "" });
  const [chapters, setChapters] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProjectName, setActiveProjectName] = useState("");
  const [projectList, setProjectList] = useState([]);
  const [bootStatus, setBootStatus] = useState("idle");   // "idle" | "loading" | "ready"
  const [saveStatus, setSaveStatus] = useState("saved");  // "saved" | "unsaved" | "saving"

  // Tracks the snapshot at last save/load — used for isDirty comparison
  const savedSnapshotRef = useRef(null);

  // Monotonically increasing counter — stale async loads are detected by mismatch
  const loadTokenRef = useRef(0);

  // Stores the project ID that a blocked switchProject wants to load
  const pendingSwitchRef = useRef(null);

  // --- Boot hydration -------------------------------------------------------

  useEffect(() => {
    async function boot() {
      setBootStatus("loading");
      try {
        const list = await listProjects();
        setProjectList(list);
        const lastId = getLastProjectId();
        if (lastId) {
          const record = await getProject(lastId);
          if (record) {
            const blobMap = await getFiles(lastId);
            const { book: b, chapters: c } = deserializeProject(record, blobMap);
            setBook(b);
            setChapters(c);
            setActiveProjectId(lastId);
            setActiveProjectName(record.name);
            // Set snapshot from deserialized values (NOT from React state, which hasn't
            // updated yet) — prevents false-positive isDirty flicker after mount
            savedSnapshotRef.current = buildSnapshot(b, c);
          }
        }
      } finally {
        setBootStatus("ready");
      }
    }
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- isDirty (derived) ----------------------------------------------------

  const isDirty = useMemo(() => {
    if (savedSnapshotRef.current === null) {
      // No project ever saved/loaded — dirty only when user has added content
      return chapters.length > 0 || book.title !== "";
    }
    return buildSnapshot(book, chapters) !== savedSnapshotRef.current;
  }, [book, chapters]);

  // --- saveStatus sync effect -----------------------------------------------

  useEffect(() => {
    setSaveStatus((prev) => {
      if (prev === "saving") return prev; // never interrupt an in-flight save
      return isDirty ? "unsaved" : "saved";
    });
  }, [isDirty]);

  // --- beforeunload guard ---------------------------------------------------

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // --- save -----------------------------------------------------------------

  /**
   * Persist the current book + chapters to IndexedDB.
   *
   * @param {string} [name] - Project name. Falls back to activeProjectName or "Untitled".
   * @returns {Promise<string>} The project ID.
   */
  const save = useCallback(
    async (name) => {
      const id = activeProjectId || crypto.randomUUID();
      const projectName = name || activeProjectName || "Untitled";
      setSaveStatus("saving");
      try {
        const { projectRecord, blobs } = serializeProject({
          id,
          name: projectName,
          book,
          chapters,
          uiState: {},
        });
        await putProject(projectRecord);
        if (blobs.length > 0) await putFiles(id, blobs);
        saveLastProjectId(id);
        await requestPersistentStorage();
        setActiveProjectId(id);
        setActiveProjectName(projectName);
        // Capture snapshot from local vars (NOT React state — state may not have
        // re-rendered yet, but book/chapters captured via useCallback closure are current)
        savedSnapshotRef.current = buildSnapshot(book, chapters);
        setSaveStatus("saved");
        // Refresh project list
        const list = await listProjects();
        setProjectList(list);
        return id;
      } catch (err) {
        setSaveStatus("unsaved");
        throw err;
      }
    },
    [book, chapters, activeProjectId, activeProjectName]
  );

  // --- load -----------------------------------------------------------------

  /**
   * Restore a project from IndexedDB into React state.
   * Uses a load-sequence token to discard results from stale concurrent loads.
   *
   * @param {string} id - Project UUID.
   * @returns {Promise<{book: object, chapters: Array}|null>} Loaded data, or null if not found/stale.
   */
  const load = useCallback(async (id) => {
    const token = ++loadTokenRef.current;
    const record = await getProject(id);
    if (!record) return null;
    const blobMap = await getFiles(id);
    if (token !== loadTokenRef.current) return null; // stale — a newer load won
    const { book: b, chapters: c } = deserializeProject(record, blobMap);
    setBook(b);
    setChapters(c);
    setActiveProjectId(id);
    setActiveProjectName(record.name);
    saveLastProjectId(id);
    // Set snapshot from deserialized values — prevents false-positive isDirty after load
    savedSnapshotRef.current = buildSnapshot(b, c);
    setSaveStatus("saved");
    return { book: b, chapters: c };
  }, []);

  // --- switchProject --------------------------------------------------------

  /**
   * Switch to a different project.
   *
   * If isDirty is true, returns `{ blocked: true, pendingId: id }` without
   * loading — the caller must show a confirmation dialog, then call confirmSwitch().
   *
   * @param {string} id - Target project UUID.
   * @returns {Promise<object|{blocked:true,pendingId:string}|null>}
   */
  const switchProject = useCallback(
    async (id) => {
      if (isDirty) {
        pendingSwitchRef.current = id;
        return { blocked: true, pendingId: id };
      }
      return load(id);
    },
    [isDirty, load]
  );

  /**
   * Proceed with the blocked project switch (after user confirms losing unsaved work).
   * @returns {Promise<object|null>}
   */
  const confirmSwitch = useCallback(async () => {
    const id = pendingSwitchRef.current;
    if (!id) return null;
    pendingSwitchRef.current = null;
    return load(id);
  }, [load]);

  /**
   * Cancel the blocked project switch (user chose to stay on current project).
   */
  const cancelSwitch = useCallback(() => {
    pendingSwitchRef.current = null;
  }, []);

  // --- newProject -----------------------------------------------------------

  /**
   * Reset to a blank in-memory project (does not delete anything from IDB).
   */
  const newProject = useCallback(() => {
    setBook({ title: "", author: "" });
    setChapters([]);
    setActiveProjectId(null);
    setActiveProjectName("");
    savedSnapshotRef.current = null;
    setSaveStatus("saved");
  }, []);

  // --- Return ---------------------------------------------------------------

  return {
    book,
    setBook,
    chapters,
    setChapters,
    activeProjectId,
    activeProjectName,
    projectList,
    isDirty,
    saveStatus,
    bootStatus,
    save,
    load,
    switchProject,
    confirmSwitch,
    cancelSwitch,
    newProject,
  };
}
