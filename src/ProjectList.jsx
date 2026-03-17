import { useState } from "react";

/**
 * ProjectList — collapsible list of saved projects.
 *
 * Props:
 *   projects       — Array<{ id, name, updatedAt, chapters: Array, ... }> (from useProjectStore.projectList)
 *   activeProjectId — string | null
 *   isDirty        — boolean (unused here; App.jsx handles the modal guard)
 *   onSwitch       — (id: string) => void
 *   onNew          — () => void
 */
export function ProjectList({ projects, activeProjectId, isDirty, onSwitch, onNew }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(null);

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
          return (
            <div
              key={project.id}
              onClick={() => !isActive && onSwitch(project.id)}
              onMouseEnter={() => setHovered(project.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                cursor: isActive ? "default" : "pointer",
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
            </div>
          );
        })
      )}
    </div>
  );
}
