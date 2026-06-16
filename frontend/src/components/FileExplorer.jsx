import { useEffect, useState } from "react";

export default function FileExplorer({ refreshSignal }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/files")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setFiles(data.files ?? []);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  useEffect(() => {
    if (!selected) {
      setContent("");
      return;
    }

    let cancelled = false;
    setLoadingContent(true);

    fetch(`/api/files/content?path=${encodeURIComponent(selected)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setContent(data.content ?? data.error ?? "");
      })
      .catch(() => {
        if (!cancelled) setContent("Failed to load file.");
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, refreshSignal]);

  return (
    <div className="file-explorer">
      <div className="glass file-tree">
        {files.length === 0 ? (
          <div className="file-tree-empty">No files generated yet.</div>
        ) : (
          files.map((path) => (
            <button
              key={path}
              className={`file-tree-item ${selected === path ? "active" : ""}`}
              onClick={() => setSelected(path)}
            >
              {path}
            </button>
          ))
        )}
      </div>

      <div className="glass code-viewer">
        {!selected ? (
          <div className="code-viewer-empty">Select a file to view its contents.</div>
        ) : (
          <>
            <div className="code-viewer-header">{selected}</div>
            <pre className="code-viewer-body">
              {loadingContent ? "Loading…" : content}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
