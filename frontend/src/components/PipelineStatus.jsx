const NODES = [
  { key: "planner", label: "planner" },
  { key: "architect", label: "architect" },
  { key: "coder", label: "coder" },
];

export default function PipelineStatus({ activeNode, completedNodes, status }) {
  return (
    <div className="glass pipeline">
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
  );
}
