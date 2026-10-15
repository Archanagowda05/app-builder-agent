import { useState, useEffect } from "react";

export default function ProjectSidebar({
  activeProject,
  onSelectProject,
  onNewProject,
  refreshSignal,
  collapsed,
  onToggleCollapse,
}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      const list = data.projects || [];
      setProjects(list);
      if ((!activeProject || activeProject === "default") && list.length > 0) {
        onSelectProject(list[0].id);
      }
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [refreshSignal]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onNewProject(newProjectName.trim());
    setNewProjectName("");
    setIsCreating(false);
  };

  if (collapsed) {
    return (
      <aside
        style={{
          width: "56px",
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--surface-border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "12px 0",
          gap: "12px",
          height: "100vh",
          zIndex: 10,
        }}
      >
        <button
          onClick={onToggleCollapse}
          title="Expand Projects Sidebar"
          style={{
            background: "transparent",
            border: "1px solid var(--surface-border)",
            borderRadius: "6px",
            color: "var(--text-secondary)",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          📂
        </button>

        <button
          onClick={() => {
            onToggleCollapse();
            setIsCreating(true);
          }}
          title="New Project"
          style={{
            background: "var(--accent)",
            border: "none",
            borderRadius: "6px",
            color: "#fff",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          +
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="project-sidebar"
      style={{
        width: "260px",
        background: "var(--bg-elevated)",
        borderRight: "1px solid var(--surface-border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--surface-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "linear-gradient(135deg, #6366f1, #a855f7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold",
              fontSize: "13px",
              color: "#fff",
            }}
          >
            L
          </div>
          <div>
            <div style={{ fontWeight: "700", fontSize: "13.5px", color: "var(--text-primary)" }}>Projects</div>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Workspace History</div>
          </div>
        </div>

        <button
          onClick={onToggleCollapse}
          title="Minimize sidebar"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            padding: "4px 8px",
            fontSize: "13px",
          }}
        >
          ◀
        </button>
      </div>

      {/* New Project Button / Inline Form */}
      <div style={{ padding: "12px 14px" }}>
        {!isCreating ? (
          <button
            onClick={() => setIsCreating(true)}
            style={{
              width: "100%",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 12px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(99, 102, 241, 0.3)",
            }}
          >
            ✨ New Project
          </button>
        ) : (
          <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <input
              type="text"
              autoFocus
              placeholder="e.g. calculator, portfolio..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              style={{
                width: "100%",
                background: "var(--surface)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                padding: "7px 10px",
                fontSize: "12px",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="submit"
                disabled={!newProjectName.trim()}
                style={{
                  flex: 1,
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "5px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewProjectName("");
                }}
                style={{
                  background: "transparent",
                  color: "var(--text-tertiary)",
                  border: "1px solid var(--surface-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "5px 10px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Projects List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 10px 12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "3px",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: "600",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "6px 8px",
          }}
        >
          Your Projects ({projects.length})
        </div>

        {projects.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "12px 8px" }}>
            No projects in workspace yet.
          </div>
        ) : (
          projects.map((p) => {
            const isActive = activeProject === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                style={{
                  background: isActive ? "var(--surface)" : "transparent",
                  border: `1px solid ${isActive ? "var(--accent)" : "transparent"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 10px",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: isActive ? "600" : "500",
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🚀 {p.name}
                  </span>
                  {isActive && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "var(--accent)",
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-tertiary)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{p.file_count} files</span>
                  <span>{p.updated_at}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
