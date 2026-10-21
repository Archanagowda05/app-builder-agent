const PHASES = [
  { key: "planning", label: "Plan", icon: "📐" },
  { key: "architecting", label: "Arch", icon: "🏗️" },
  { key: "searching", label: "Search", icon: "🔍" },
  { key: "reading", label: "Read", icon: "📖" },
  { key: "coding", label: "Code", icon: "✍️" },
  { key: "completed_file", label: "Done", icon: "✅" },
];

export default function PipelineStatus({ activeNode, completedNodes, status, currentActivity }) {
  const currentAction = currentActivity?.action || (status === "running" ? activeNode : status);

  return (
    <div
      className="glass pipeline"
      style={{
        flexDirection: "column",
        gap: "10px",
        padding: "12px 14px",
        borderRadius: "10px",
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid var(--surface-border)",
      }}
    >
      {/* Visual icon step bar */}
      <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
        {PHASES.map((p, i) => {
          const isActive =
            status === "running" &&
            (currentAction === p.key ||
              (activeNode === "planner" && p.key === "planning") ||
              (activeNode === "architect" && p.key === "architecting") ||
              (activeNode === "coder" && (p.key === "coding" || p.key === "reading" || p.key === "searching")));
          
          const isDone =
            status === "done" ||
            (completedNodes.has("coder") && p.key !== "completed_file") ||
            (completedNodes.has("architect") && (p.key === "planning" || p.key === "architecting")) ||
            (completedNodes.has("planner") && p.key === "planning");

          return (
            <div key={p.key} style={{ display: "flex", alignItems: "center", flex: i < PHASES.length - 1 ? 1 : "none" }}>
              <div
                title={p.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "default",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    background: isActive
                      ? "linear-gradient(135deg, var(--accent), #818cf8)"
                      : isDone
                      ? "rgba(74, 222, 128, 0.15)"
                      : "var(--surface)",
                    border: `1px solid ${
                      isActive
                        ? "var(--accent)"
                        : isDone
                        ? "rgba(74, 222, 128, 0.4)"
                        : "var(--surface-border)"
                    }`,
                    color: isActive ? "#fff" : isDone ? "var(--success)" : "var(--text-tertiary)",
                    boxShadow: isActive ? "0 0 10px rgba(99, 102, 241, 0.4)" : "none",
                    transition: "all 0.25s ease",
                  }}
                >
                  {p.icon}
                </div>
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: isActive ? "var(--text-primary)" : isDone ? "var(--success)" : "var(--text-tertiary)",
                    fontWeight: isActive ? "700" : "500",
                  }}
                >
                  {p.label}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: "2px",
                    margin: "0 6px 14px",
                    background: isDone
                      ? "var(--success)"
                      : isActive
                      ? "var(--accent)"
                      : "var(--surface-border)",
                    opacity: isDone || isActive ? 0.7 : 0.3,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Active Phase Banner */}
      {status === "running" && currentActivity && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(99, 102, 241, 0.1)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "var(--text-primary)",
            animation: "fade-in 0.2s ease",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 8px var(--accent)",
              display: "inline-block",
            }}
          />
          <span style={{ fontWeight: "700", color: "#a5b4fc" }}>
            {currentActivity.action?.replace("_", " ")}:
          </span>
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentActivity.message}
          </span>
        </div>
      )}
    </div>
  );
}
