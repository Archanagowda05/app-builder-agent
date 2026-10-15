import { useEffect, useRef } from "react";

export default function LogStream({ logs }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  if (logs.length === 0) {
    return <div className="log-empty">No activity yet. Describe a project to begin.</div>;
  }

  const getBadgeColor = (type = "") => {
    if (type.includes("planning")) return { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "rgba(168, 85, 247, 0.3)" };
    if (type.includes("architecting")) return { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", border: "rgba(59, 130, 246, 0.3)" };
    if (type.includes("searching")) return { bg: "rgba(234, 179, 8, 0.15)", text: "#fde047", border: "rgba(234, 179, 8, 0.3)" };
    if (type.includes("reading")) return { bg: "rgba(20, 184, 166, 0.15)", text: "#2dd4bf", border: "rgba(20, 184, 166, 0.3)" };
    if (type.includes("coding")) return { bg: "rgba(99, 102, 241, 0.15)", text: "#818cf8", border: "rgba(99, 102, 241, 0.3)" };
    if (type.includes("completed_file")) return { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80", border: "rgba(34, 197, 94, 0.3)" };
    if (type === "error") return { bg: "rgba(239, 68, 68, 0.15)", text: "#f87171", border: "rgba(239, 68, 68, 0.3)" };
    return { bg: "var(--surface)", text: "var(--text-secondary)", border: "var(--surface-border)" };
  };

  return (
    <div className="log-stream">
      {logs.map((log, i) => {
        const badgeStyle = getBadgeColor(log.type);
        return (
          <div
            key={i}
            className={`glass log-entry ${log.type}`}
            style={{
              borderLeft: `3px solid ${badgeStyle.text}`,
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "8px 10px",
            }}
          >
            {log.node && (
              <span
                style={{
                  background: badgeStyle.bg,
                  color: badgeStyle.text,
                  border: `1px solid ${badgeStyle.border}`,
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                {log.node.replace("_", " ")}
              </span>
            )}
            <span style={{ flex: 1, wordBreak: "break-word" }}>{log.text}</span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
