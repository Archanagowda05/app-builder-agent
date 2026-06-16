import { useEffect, useRef, useState } from "react";

export default function PreviewPane({ refreshSignal, hasFiles }) {
  const [entry, setEntry] = useState(null);
  const [checked, setChecked] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/preview/entry")
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
  }, [refreshSignal]);

  if (!hasFiles || (!entry && checked)) {
    return (
      <div className="code-viewer-empty">
        {hasFiles
          ? "No index.html found yet — preview will appear once an HTML entry file is generated."
          : "The live preview will appear here once the project has been generated."}
      </div>
    );
  }

  return (
    <div className="preview-pane">
      <div className="preview-toolbar">
        <span className="preview-url">{entry ?? "loading…"}</span>
        <button
          className="preview-refresh"
          onClick={() => iframeRef.current?.contentWindow?.location.reload()}
        >
          Refresh
        </button>
      </div>
      <div className="preview-frame-wrap">
        {entry && (
          <iframe
            ref={iframeRef}
            key={entry}
            src={entry}
            title="Generated project preview"
            sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups"
          />
        )}
      </div>
    </div>
  );
}
