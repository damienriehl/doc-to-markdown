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
  deleteProject as deleteProjectFromDb,
  renameProject as renameProjectInDb,
} from "./projectDb.js";
import { serializeProject, deserializeProject } from "./projectSerializer.js";
import {
  isServerAvailable,
  slugify,
  saveProjectToServer,
  renameProjectOnServer,
  deleteProjectOnServer,
} from "./serverApi.js";
import { saveBlob, smartFilename } from "./fileSaver.js";

/**
 * Fire-and-forget — calls a promise without awaiting, catches errors silently.
 * Used for non-blocking server persistence operations.
 */
function fireAndForget(promise) {
  promise.catch(e => console.warn("[server sync]", e));
}

// --- buildIndexContent -------------------------------------------------------

/**
 * Build the 00-index.md content from a list of converted chapters.
 * Replicates App.jsx buildIndexFile logic as a standalone helper.
 *
 * @param {Array<object>} chapters - Chapters with markdownContent
 * @param {{ title: string, author: string }} book
 * @returns {string} Index Markdown content
 */
function buildIndexContent(chapters, book) {
  const sorted = [...chapters].sort((a, b) => a.chapterNum - b.chapterNum);
  const lines = [
    "---",
    `title: "Index and Cross-Reference Guide"`,
    `chapter: 0`,
    `book: "${book?.title ?? ""}"`,
    `author: "${book?.author ?? ""}"`,
    `topics:`,
    `  - "index"`,
    `  - "cross-reference"`,
    `  - "table of contents"`,
    `  - "overview"`,
    `converted_date: "${new Date().toISOString().split("T")[0]}"`,
    "---", "",
    `# ${book?.title ?? ""}: Index and Cross-Reference Guide`, "",
    `*${book?.author ?? ""}*`, "",
    "## Chapter Overview", "",
    "| Chapter | Title | Key Topics |",
    "|---------|-------|------------|",
  ];
  sorted.forEach(ch => {
    const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
    const topics = (ch.topics ?? []).slice(0, 4).join(", ");
    lines.push(`| ${ch.chapterNum} | ${ch.title} (\`${fn}\`) | ${topics} |`);
  });
  lines.push("", "## Chapter Summaries", "");
  sorted.forEach(ch => {
    lines.push(`### Chapter ${ch.chapterNum}: ${ch.title}`, "");
    if (ch.topics?.length) lines.push(`This chapter covers: ${ch.topics.join(", ")}.`, "");
    if (ch.keyTerms?.length) lines.push(`Key terms: ${ch.keyTerms.join(", ")}.`, "");
  });
  lines.push("## Master Key Terms Index", "");
  const allTerms = {};
  sorted.forEach(ch => {
    (ch.keyTerms ?? []).forEach(t => {
      if (!allTerms[t]) allTerms[t] = [];
      allTerms[t].push(ch.chapterNum);
    });
  });
  Object.keys(allTerms).sort().forEach(term => {
    const refs = allTerms[term].map(n => `Ch. ${n}`).join(", ");
    lines.push(`- **${term}**: ${refs}`);
  });
  lines.push("");
  return lines.join("\n");
}

// --- exportProject -----------------------------------------------------------

/**
 * Export a project as a ZIP archive.
 *
 * @param {string} id - Project UUID
 * @param {"full"|"outputs-only"} mode - Export mode
 * @returns {Promise<void>}
 */
export async function exportProject(id, mode) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const record = await getProject(id);
  if (!record) throw new Error("Project not found");

  const doneChapters = (record.chapters ?? []).filter(
    ch => ch.markdownContent && ch.markdownContent.trim() !== ""
  );

  if (mode === "full") {
    // project.json at root
    zip.file("project.json", JSON.stringify(record, null, 2));

    // sources/ — original uploaded files as blobs from IDB
    const blobMap = await getFiles(id);
    const sourcesFolder = zip.folder("sources");
    for (const chapter of record.chapters ?? []) {
      const file = blobMap.get(chapter.blobId);
      if (file) {
        const ab = await file.arrayBuffer();
        sourcesFolder.file(chapter.fileName, ab);
      }
    }

    // outputs/ — generated Markdown
    if (doneChapters.length > 0) {
      const outputsFolder = zip.folder("outputs");
      for (const ch of doneChapters) {
        const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
        outputsFolder.file(fn, ch.markdownContent);
      }
      // 00-index.md in outputs/
      outputsFolder.file("00-index.md", buildIndexContent(doneChapters, record.book));
    }

  } else {
    // "outputs-only": flat ZIP with .md files
    if (doneChapters.length === 0) {
      throw new Error("No converted outputs to export. Convert files first.");
    }
    for (const ch of doneChapters) {
      const fn = `${String(ch.chapterNum).padStart(2, "0")}-${ch.slug}.md`;
      zip.file(fn, ch.markdownContent);
    }
    // 00-index.md at root
    zip.file("00-index.md", buildIndexContent(doneChapters, record.book));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const filename = smartFilename("zip", { bookTitle: record.book?.title || record.name });
  await saveBlob(filename, blob);
}

// --- importProject -----------------------------------------------------------

/**
 * Import a project from a ZIP archive file.
 *
 * @param {File} file - ZIP file
 * @param {Function} [setProjectList] - State setter for project list refresh (optional — tests omit it)
 * @param {Function} [setServerConnected] - State setter for server status (optional — tests omit it)
 * @returns {Promise<string>} The new project ID
 */
export async function importProject(file, setProjectList, setServerConnected) {
  const JSZip = (await import("jszip")).default;
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  // Filter out __MACOSX and dot-prefixed entries
  const validEntries = Object.keys(zip.files).filter(
    name => !name.startsWith("__MACOSX/") && !name.split("/").some(part => part.startsWith("."))
  );

  const hasProjectJson = validEntries.includes("project.json");
  const mdFiles = validEntries.filter(
    name => !zip.files[name].dir && name.endsWith(".md")
  );

  if (!hasProjectJson && mdFiles.length === 0) {
    throw new Error("Unrecognized ZIP format: expected project.json or .md files.");
  }

  // --- Parse project record ---
  let projectRecord;
  if (hasProjectJson) {
    const raw = await zip.files["project.json"].async("string");
    projectRecord = JSON.parse(raw);
  } else {
    // Outputs-only ZIP: construct minimal projectRecord from .md filenames
    const zipName = file.name.replace(/\.zip$/i, "") || "Imported Project";
    const chapters = [];
    for (const path of mdFiles) {
      const basename = path.split("/").pop();
      if (basename === "00-index.md") continue; // skip index
      const match = basename.match(/^(\d+)-(.+)\.md$/);
      if (match) {
        chapters.push({
          id: crypto.randomUUID(),
          blobId: crypto.randomUUID(),
          fileName: basename,
          fileType: "md",
          title: match[2].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          slug: match[2],
          chapterNum: parseInt(match[1], 10),
          topics: [],
          keyTerms: [],
          markdownContent: await zip.files[path].async("string"),
          status: "done",
        });
      }
    }
    projectRecord = {
      id: crypto.randomUUID(), // will be overwritten below
      name: zipName,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      book: { title: "", author: "" },
      chapters,
      uiState: {},
    };
  }

  // --- Assign new UUIDs (always fresh, never overwrite) ---
  // The project id AND every chapter blobId must be regenerated. The `files`
  // store is keyed by blobId, so reusing the blobIds embedded in an imported
  // project.json would make putFiles() overwrite an existing project's blob
  // records and silently steal its source files (data loss). Fresh blobIds
  // (and chapter ids) keep every imported project fully independent.
  const newId = crypto.randomUUID();
  projectRecord = {
    ...projectRecord,
    id: newId,
    updatedAt: new Date().toISOString(),
    chapters: (projectRecord.chapters ?? []).map((ch) => ({
      ...ch,
      id: crypto.randomUUID(),
      blobId: crypto.randomUUID(),
    })),
  };

  // --- Name collision resolution ---
  const existingProjects = await listProjects();
  const existingNames = new Set(existingProjects.map(p => p.name));
  let finalName = projectRecord.name;
  if (existingNames.has(finalName)) {
    let counter = 2;
    while (existingNames.has(`${projectRecord.name} (${counter})`)) counter++;
    finalName = `${projectRecord.name} (${counter})`;
  }
  projectRecord.name = finalName;

  // --- Write to IDB ---
  await putProject(projectRecord);

  // --- Write source blobs (full project ZIPs only) ---
  const blobs = [];
  for (const chapter of projectRecord.chapters ?? []) {
    const path = `sources/${chapter.fileName}`;
    if (zip.files[path]) {
      const blobData = await zip.files[path].async("blob");
      const fileObj = new File([blobData], chapter.fileName);
      blobs.push({ id: chapter.blobId, file: fileObj, name: chapter.fileName });
    }
  }
  if (blobs.length > 0) await putFiles(newId, blobs);

  // --- Fire-and-forget server sync ---
  fireAndForget(
    isServerAvailable().then(up => {
      if (setServerConnected) setServerConnected(up);
      if (up) return saveProjectToServer(slugify(projectRecord.name), projectRecord);
    })
  );

  // --- Refresh project list ---
  if (setProjectList) {
    const list = await listProjects();
    setProjectList(list);
  }

  return newId;
}

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
 *   exportProject: Function,
 *   importProject: Function,
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
  const [serverConnected, setServerConnected] = useState(false);

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
        // Check server availability for status dot (no extra network round-trip if already cached)
        isServerAvailable().then(up => setServerConnected(up));
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
        // Fire-and-forget server sync
        const slug = slugify(projectName);
        fireAndForget(
          isServerAvailable().then(up => {
            setServerConnected(up);
            if (up) return saveProjectToServer(slug, projectRecord);
          })
        );
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

  // --- renameProject --------------------------------------------------------

  /**
   * Rename a project in IndexedDB and update the in-memory project list.
   * @param {string} id - Project UUID
   * @param {string} newName - New project name
   */
  const renameProject = useCallback(async (id, newName) => {
    // Capture old name before IDB update (needed for server rename)
    const oldName = projectList.find(p => p.id === id)?.name || "untitled";
    await renameProjectInDb(id, newName);
    // Update in-memory list optimistically
    setProjectList(prev => prev.map(p =>
      p.id === id ? { ...p, name: newName, updatedAt: new Date().toISOString() } : p
    ));
    if (id === activeProjectId) {
      setActiveProjectName(newName);
    }
    // Fire-and-forget server rename
    fireAndForget(
      isServerAvailable().then(up => {
        setServerConnected(up);
        if (up) {
          const oldSlug = slugify(oldName);
          const newSlug = slugify(newName);
          if (oldSlug !== newSlug) return renameProjectOnServer(oldSlug, newSlug);
        }
      })
    );
  }, [activeProjectId, projectList]);

  // --- deleteProject --------------------------------------------------------

  /**
   * Delete a project from IndexedDB and refresh the project list.
   * If the deleted project is the active one, reset to blank workspace.
   * @param {string} id - Project UUID
   */
  const handleDeleteProject = useCallback(async (id) => {
    // Capture name before IDB delete (needed for server delete)
    const deletedName = projectList.find(p => p.id === id)?.name;
    await deleteProjectFromDb(id);
    const list = await listProjects();
    setProjectList(list);
    if (id === activeProjectId) {
      // Reset to blank workspace when deleting the active project
      setBook({ title: "", author: "" });
      setChapters([]);
      setActiveProjectId(null);
      setActiveProjectName("");
      savedSnapshotRef.current = null;
      setSaveStatus("saved");
      try { localStorage.removeItem("doc-to-markdown:lastProjectId"); } catch { /* ignore */ }
    }
    // Fire-and-forget server delete
    if (deletedName) {
      fireAndForget(
        isServerAvailable().then(up => {
          setServerConnected(up);
          if (up) return deleteProjectOnServer(slugify(deletedName));
        })
      );
    }
  }, [activeProjectId, projectList]);

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

  // --- exportProject (hook wrapper) -----------------------------------------

  const handleExport = useCallback(async (id, mode) => {
    return exportProject(id, mode);
  }, []);

  // --- importProject (hook wrapper) -----------------------------------------

  const handleImport = useCallback(async (file) => {
    return importProject(file, setProjectList, setServerConnected);
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
    serverConnected,
    save,
    load,
    switchProject,
    confirmSwitch,
    cancelSwitch,
    newProject,
    renameProject,
    deleteProject: handleDeleteProject,
    exportProject: handleExport,
    importProject: handleImport,
  };
}
