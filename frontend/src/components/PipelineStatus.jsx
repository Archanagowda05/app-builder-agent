const NODES = [
  { key: "planner", label: "Planner" },
  { key: "architect", label: "Architect" },
  { key: "coder", label: "Coder" },
];

export default function PipelineStatus({ activeNode, completedNodes, status, currentActivity }) {
  return (
    <div className="glass pipeline" style={{ flexDirection: "column", gap: "10px", padding: "12px 14px" }}>
      <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
        {NODES.map((node, i) => {
          const isActive = activeNode === node.key && status === "running";
          const isDone =
            completedNodes.has(node.key) &&
            (activeNode !== node.key || status === "done");
          const isError = status === "error" && activeNode === node.key;

          let dotClass = "pipeline-dot";
          if (isError) dotClass += " error";
          else if (isActive) dotClass += " active";
          else if (isDone) dotClass += " done";

          return (
            <div key={node.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <div className="pipeline-node">
                <div className={dotClass} />
                <span className={`pipeline-label ${isActive ? "active" : ""}`}>
                  {node.label}
                </span>
              </div>
              {i < NODES.length - 1 && <div className="pipeline-connector" />}
            </div>
          );
        })}
      </div>

      {/* Live granular activity badge */}
      {status === "running" && currentActivity && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(99, 102, 241, 0.12)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            color: "var(--text-primary)",
            animation: "fade-in 0.2s ease",
          }}
        >
          <span className="pulse-indicator" style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#6366f1" }} />
          <span style={{ fontWeight: "600", textTransform: "capitalize", color: "#818cf8" }}>
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
