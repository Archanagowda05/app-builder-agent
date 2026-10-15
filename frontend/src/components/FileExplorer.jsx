import { useEffect, useState } from "react";

export default function FileExplorer({ project, refreshSignal }) {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const projParam = project ? `?project=${encodeURIComponent(project)}` : "";

    const token = localStorage.getItem("app_builder_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/files${projParam}`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const fileList = data.files ?? [];
        setFiles(fileList);
        if (fileList.length > 0 && (!selected || !fileList.includes(selected))) {
          setSelected(fileList[0]);
        }
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [project, refreshSignal]);

  useEffect(() => {
    if (!selected) {
      setContent("");
      return;
    }

    let cancelled = false;
    setLoadingContent(true);
    const projParam = project ? `&project=${encodeURIComponent(project)}` : "";
    const token = localStorage.getItem("app_builder_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`/api/files/content?path=${encodeURIComponent(selected)}${projParam}`, { headers })
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
  }, [selected, project, refreshSignal]);

  return (
    <div className="file-explorer">
      <div className="glass file-tree">
        {files.length === 0 ? (
          <div className="file-tree-empty">No files generated in this project yet.</div>
        ) : (
          files.map((path) => (
            <button
              key={path}
              className={`file-tree-item ${selected === path ? "active" : ""}`}
              onClick={() => setSelected(path)}
            >
              📄 {path}
            </button>
          ))
        )}
      </div>

      <div className="glass code-viewer">
        {!selected ? (
          <div className="code-viewer-empty">Select a file to view its contents.</div>
        ) : (
          <>
            <div className="code-viewer-header" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{selected}</span>
              <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                {project}
              </span>
            </div>
            <pre className="code-viewer-body">
              {loadingContent ? "Loading…" : content}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
