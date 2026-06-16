import { useEffect, useRef } from "react";

export default function LogStream({ logs }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  if (logs.length === 0) {
    return <div className="log-empty">No activity yet. Describe a project to begin.</div>;
  }

  return (
    <div className="log-stream">
      {logs.map((log, i) => (
        <div key={i} className={`glass log-entry ${log.type}`}>
          {log.node && <span className="log-node">{log.node} </span>}
          {log.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
