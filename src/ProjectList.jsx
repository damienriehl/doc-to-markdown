import { useState, useRef, useEffect } from "react";

/**
 * ProjectList — collapsible list of saved projects.
 *
 * Props:
 *   projects        — Array<{ id, name, updatedAt, chapters: Array, ... }> (from useProjectStore.projectList)
 *   activeProjectId — string | null
 *   isDirty         — boolean (unused here; App.jsx handles the modal guard)
 *   onSwitch        — (id: string) => void
 *   onNew           — () => void
 *   onRename        — (id: string, newName: string) => void
 *   onDelete        — (id: string) => void
 *   onExport        — (id: string, mode: "full"|"outputs-only") => Promise<void>
 *   onImport        — (file: File) => Promise<string>
 */
export function ProjectList({ projects, activeProjectId, isDirty, onSwitch, onNew, onRename, onDelete, onExport, onImport }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, chapters } or null
  const [trashHovered, setTrashHovered] = useState(null);
  const [exportMenuId, setExportMenuId] = useState(null);    // project.id or null — controls which card's dropdown is open
  const [exportingId, setExportingId] = useState(null);      // project.id or null — shows spinner during export
  const [importStatus, setImportStatus] = useState(null);    // null | { state: "importing"|"done"|"error", message: string }
  const editRef = useRef(null);
  const importInputRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (!exportMenuId) return;
    const handler = () => {
      setExportMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuId]);

  function startRename(project) {
    setEditingId(project.id);
    setEditName(project.name);
    cancelledRef.current = false;
  }

  function handleRenameConfirm(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return; // reject empty names — keep editing
    setEditingId(null);
    if (trimmed !== projects.find(p => p.id === id)?.name) {
      onRename(id, trimmed);
    }
  }

  async function handleExport(projectId, mode) {
    setExportMenuId(null);
    setExportingId(projectId);
    try {
      await onExport(projectId, mode);
    } catch (err) {
      console.error("[export]", err);
    } finally {
      setExportingId(null);
    }
  }

  async function handleImportFile(file) {
    setImportStatus({ state: "importing", message: "Importing..." });
    try {
      await onImport(file);
      setImportStatus({ state: "done", message: "Project imported successfully." });
      setTimeout(() => setImportStatus(null), 3000);
    } catch (err) {
      setImportStatus({ state: "error", message: err.message || "Import failed." });
      setTimeout(() => setImportStatus(null), 5000);
    }
  }

  if (!expanded) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        marginBottom: 16,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "var(--font-body)",
        color: "var(--muted)",
      }}>
        <span>{projects.length} saved project{projects.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "var(--font-body)",
          }}
        >
          Show
        </button>
      </div>
    );
  }

  return (
    <div style={{
      marginBottom: 16,
      border: "1px solid var(--border)",
      borderRadius: 8,
      overflow: "hidden",
    }}>
      {/* Spinner keyframes — injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
      }}>
        <span style={{
          fontSize: 13,
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          color: "var(--text)",
        }}>
          Projects
        </span>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "var(--font-body)",
          }}
        >
          Hide
        </button>
      </div>

      {/* Project cards */}
      {projects.length === 0 ? (
        <div style={{
          padding: 16,
          fontSize: 13,
          color: "var(--muted)",
          fontFamily: "var(--font-body)",
          textAlign: "center",
        }}>
          No saved projects yet. Save your current workspace to get started.
        </div>
      ) : (
        projects.map(project => {
          const isActive = project.id === activeProjectId;
          const isHov = hovered === project.id && !isActive;
          const isEditing = editingId === project.id;
          const showActions = hovered === project.id && !isEditing;

          return (
            <div
              key={project.id}
              onClick={() => !isActive && !isEditing && onSwitch(project.id)}
              onMouseEnter={() => setHovered(project.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                cursor: isActive || isEditing ? "default" : "pointer",
                background: isActive
                  ? "var(--accent-bg)"
                  : isHov
                    ? "var(--accent-dim)"
                    : "var(--bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "background 0.1s ease",
              }}
            >
              {/* Left side — name area */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <input
                    ref={editRef}
                    value={editName}
                    autoFocus
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        handleRenameConfirm(project.id, editName);
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        cancelledRef.current = true;
                        setEditingId(null);
                      }
                    }}
                    onBlur={() => {
                      if (!cancelledRef.current) {
                        handleRenameConfirm(project.id, editName);
                      }
                      cancelledRef.current = false;
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      fontSize: 14,
                      fontWeight: 400,
                      fontFamily: "var(--font-body)",
                      color: "var(--text)",
                      background: "var(--bg)",
                      border: editName.trim()
                        ? "1px solid var(--accent)"
                        : "1px solid #dc2626",
                      borderRadius: 4,
                      padding: "2px 6px",
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <div>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: "var(--font-body)",
                      color: "var(--text)",
                    }}>
                      {project.name}
                      {isActive && (
                        <span style={{
                          marginLeft: 8,
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: "var(--accent-bg)",
                          color: "var(--accent)",
                        }}>
                          active
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      fontFamily: "var(--font-body)",
                      marginTop: 2,
                    }}>
                      {project.chapters.length} file{project.chapters.length !== 1 ? "s" : ""}
                      {" \u00b7 "}
                      {new Date(project.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right side — hover action icons */}
              <div style={{
                display: "flex",
                gap: 4,
                marginLeft: 8,
                flexShrink: 0,
                opacity: showActions ? 1 : 0,
                pointerEvents: showActions ? "auto" : "none",
                transition: "opacity 0.1s ease",
              }}>
                {/* Pencil / rename button */}
                <button
                  tabIndex={showActions ? 0 : -1}
                  onClick={e => { e.stopPropagation(); startRename(project); }}
                  title="Rename project"
                  aria-label={"Rename project: " + project.name}
                  style={{
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    cursor: "pointer",
                    padding: 0,
                    color: "var(--muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    <path d="m15 5 4 4"/>
                  </svg>
                </button>

                {/* Export / download button */}
                <div style={{ position: "relative" }}>
                  <button
                    tabIndex={showActions ? 0 : -1}
                    onClick={e => {
                      e.stopPropagation();
                      setExportMenuId(exportMenuId === project.id ? null : project.id);
                    }}
                    title="Export project"
                    aria-label={"Export project: " + project.name}
                    style={{
                      width: 28, height: 28, display: "flex", alignItems: "center",
                      justifyContent: "center", borderRadius: 4,
                      border: "1px solid var(--border)", background: "var(--bg)",
                      cursor: "pointer", padding: 0,
                      color: exportingId === project.id ? "var(--accent)" : "var(--muted)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {exportingId === project.id ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="40" strokeDashoffset="10" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    )}
                  </button>

                  {/* Export mode dropdown */}
                  {exportMenuId === project.id && (
                    <div
                      onMouseDown={e => e.stopPropagation()}
                      style={{
                        position: "absolute", top: 32, right: 0, zIndex: 100,
                        background: "var(--bg)", border: "1px solid var(--border)",
                        borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        minWidth: 150, overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={e => { e.stopPropagation(); handleExport(project.id, "full"); }}
                        style={{
                          display: "block", width: "100%", padding: "8px 12px", fontSize: 13,
                          fontFamily: "var(--font-body)", border: "none",
                          background: "var(--bg)", color: "var(--text)", cursor: "pointer",
                          textAlign: "left",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--accent-dim)"}
                        onMouseLeave={e => e.currentTarget.style.background = "var(--bg)"}
                      >
                        Full project
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleExport(project.id, "outputs-only"); }}
                        style={{
                          display: "block", width: "100%", padding: "8px 12px", fontSize: 13,
                          fontFamily: "var(--font-body)", border: "none",
                          borderTop: "1px solid var(--border)",
                          background: "var(--bg)", color: "var(--text)", cursor: "pointer",
                          textAlign: "left",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--accent-dim)"}
                        onMouseLeave={e => e.currentTarget.style.background = "var(--bg)"}
                      >
                        Outputs only
                      </button>
                    </div>
                  )}
                </div>

                {/* Trash / delete button */}
                <button
                  tabIndex={showActions ? 0 : -1}
                  onClick={e => {
                    e.stopPropagation();
                    setDeleteTarget({ id: project.id, name: project.name, chapters: project.chapters });
                  }}
                  onMouseEnter={() => setTrashHovered(project.id)}
                  onMouseLeave={() => setTrashHovered(null)}
                  title="Delete project"
                  aria-label={"Delete project: " + project.name}
                  style={{
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    border: trashHovered === project.id ? "1px solid #dc2626" : "1px solid var(--border)",
                    background: trashHovered === project.id ? "#fef2f2" : "var(--bg)",
                    cursor: "pointer",
                    padding: 0,
                    color: trashHovered === project.id ? "#dc2626" : "var(--muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* Import section */}
      <div style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <button
          onClick={() => importInputRef.current?.click()}
          style={{
            padding: "6px 14px", fontSize: 13, fontFamily: "var(--font-body)",
            border: "1px solid var(--border)", borderRadius: 6,
            background: "var(--bg)", color: "var(--text)", cursor: "pointer",
          }}
        >
          Import project
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = "";
            await handleImportFile(file);
          }}
        />
        {/* Import status message */}
        {importStatus && (
          <span style={{
            fontSize: 12,
            fontFamily: "var(--font-body)",
            color: importStatus.state === "error" ? "#dc2626"
              : importStatus.state === "done" ? "#10b981"
              : "var(--muted)",
          }}>
            {importStatus.message}
          </span>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
            display: "flex", justifyContent: "center", alignItems: "center",
          }}
          onKeyDown={e => { if (e.key === "Escape") setDeleteTarget(null); }}
        >
          <div style={{
            background: "var(--bg)", borderRadius: 12, padding: 24, maxWidth: 400,
            border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Delete Project?</h3>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 4px", lineHeight: 1.5 }}>
              Delete <strong style={{ color: "var(--text)" }}>{deleteTarget.name}</strong>? This project has {deleteTarget.chapters.length} file{deleteTarget.chapters.length !== 1 ? "s" : ""} and cannot be recovered.
            </p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.5 }}>
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                autoFocus
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: "6px 16px", fontSize: 13, border: "1px solid var(--border)",
                  borderRadius: 6, background: "var(--bg)", color: "var(--text)", cursor: "pointer",
                }}
              >
                Keep Project
              </button>
              <button
                onClick={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }}
                style={{
                  padding: "6px 16px", fontSize: 13, border: "1px solid #dc2626",
                  borderRadius: 6, background: "#dc2626", color: "#fff", cursor: "pointer", fontWeight: 700,
                }}
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
