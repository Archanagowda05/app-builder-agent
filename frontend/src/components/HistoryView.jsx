import { useState, useEffect } from "react";

export default function HistoryView({ project, refreshSignal, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const projParam = project ? `?project=${encodeURIComponent(project)}` : "";
      const token = localStorage.getItem("app_builder_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(`/api/history${projParam}`, { headers });
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (e) {
      console.error("Failed to load history", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [project, refreshSignal]);

  const handleRestore = async (versionId) => {
    if (!confirm(`Rollback project "${project}" to version "${versionId}"?`)) return;
    setRestoring(versionId);
    try {
      const token = localStorage.getItem("app_builder_token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/history/restore", {
        method: "POST",
        headers,
        body: JSON.stringify({ project, version_id: versionId }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Version restored successfully!");
        if (onRestore) onRestore();
        fetchHistory();
      } else {
        alert("Restore failed: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      alert("Restore error: " + e.message);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="history-view" style={{ padding: "16px", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h2 style={{ fontSize: "15px", margin: "0 0 4px 0", color: "var(--text-primary)" }}>
            History & Snapshots for <span style={{ color: "var(--accent)" }}>{project}</span>
          </h2>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
            Every initial build and subsequent chat modification automatically saves a restore point.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
            color: "var(--text-secondary)",
            padding: "5px 12px",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          {loading ? "..." : "🔄 Refresh"}
        </button>
      </div>

      {versions.length === 0 ? (
        <div style={{ color: "var(--text-tertiary)", textAlign: "center", padding: "40px", fontSize: "13px" }}>
          No previous snapshots saved for this project yet. Edit or generate to create version history.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {versions.map((v) => (
            <div
              key={v.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--bg-elevated)",
                border: "1px solid var(--surface-border)",
                borderRadius: "var(--radius)",
                padding: "12px 16px",
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: "600", color: "var(--text-primary)" }}>
                  📦 {v.name}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                  {v.created_at} • {v.file_count} file(s)
                </div>
              </div>
              <button
                onClick={() => handleRestore(v.id)}
                disabled={restoring === v.id}
                style={{
                  background: "var(--accent-soft)",
                  border: "1px solid var(--accent)",
                  color: "var(--text-primary)",
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                {restoring === v.id ? "Restoring..." : "Rollback to here"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
