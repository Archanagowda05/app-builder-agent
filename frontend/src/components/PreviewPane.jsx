import { useEffect, useRef, useState } from "react";

export default function PreviewPane({ project, refreshSignal, hasFiles }) {
  const [entry, setEntry] = useState(null);
  const [checked, setChecked] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const projParam = project ? `?project=${encodeURIComponent(project)}` : "";
    const token = localStorage.getItem("app_builder_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/preview/entry${projParam}`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setEntry(data.entry ?? null);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) {
          setEntry(null);
          setChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project, refreshSignal]);

  if (!hasFiles || (!entry && checked)) {
    return (
      <div className="code-viewer-empty">
        {hasFiles
          ? "No HTML entry file found in this project."
          : "Live preview will appear here once the project is generated."}
      </div>
    );
  }

  return (
    <div className="preview-pane">
      <div className="preview-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--accent)", textTransform: "uppercase" }}>
            Live Preview:
          </span>
          <span className="preview-url">{entry ?? "loading…"}</span>
        </div>
        <button
          className="preview-refresh"
          onClick={() => {
            if (iframeRef.current) {
              iframeRef.current.src = iframeRef.current.src.split("?")[0] + `?t=${Date.now()}`;
            }
          }}
        >
          🔄 Refresh
        </button>
      </div>
      <div className="preview-frame-wrap">
        {entry && (
          <iframe
            ref={iframeRef}
            key={entry}
            src={entry}
            title="Project preview"
            sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups"
          />
        )}
      </div>
    </div>
  );
}
