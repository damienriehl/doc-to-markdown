import { useState, useRef, useEffect } from "react";

/**
 * ProjectList — collapsible list of saved projects.
 *
 * Props:
 *   projects       — Array<{ id, name, updatedAt, chapters: Array, ... }> (from useProjectStore.projectList)
 *   activeProjectId — string | null
 *   isDirty        — boolean (unused here; App.jsx handles the modal guard)
 *   onSwitch       — (id: string) => void
 *   onNew          — () => void
 *   onRename       — (id: string, newName: string) => void
 *   onDelete       — (id: string) => void
 */
export function ProjectList({ projects, activeProjectId, isDirty, onSwitch, onNew, onRename, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, chapters } or null
  const [trashHovered, setTrashHovered] = useState(null);
  const editRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.select();
    }
  }, [editingId]);

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
