import { useState } from "react";
import { useAgentSocket } from "./hooks/useAgentSocket";
import PipelineStatus from "./components/PipelineStatus";
import LogStream from "./components/LogStream";
import PromptForm from "./components/PromptForm";
import PlanView from "./components/PlanView";
import FileExplorer from "./components/FileExplorer";
import PreviewPane from "./components/PreviewPane";
import ErrorBanner from "./components/ErrorBanner";

const STATUS_LABEL = {
  idle: "idle",
  running: "running",
  done: "done",
  error: "error",
};

export default function App() {
  const [tab, setTab] = useState("plan");
  const {
    status,
    activeNode,
    completedNodes,
    plan,
    taskPlan,
    coderState,
    logs,
    error,
    run,
    retry,
  } = useAgentSocket();

  // Bump this whenever the coder writes a file, or the run finishes, so
  // FileExplorer and PreviewPane re-fetch.
  const refreshSignal = `${activeNode ?? ""}-${coderState?.current_step_idx ?? 0}-${status}`;
  const hasFiles = Boolean(coderState) || status === "done";

  return (
    <div className="app">
      <aside className="chat-panel">
        <div className="brand">
          <div className="brand-mark">AC</div>
          <div className="brand-text">
            <h1>Agent Console</h1>
            <p>planner → architect → coder</p>
          </div>
        </div>

        <PipelineStatus
          activeNode={activeNode}
          completedNodes={completedNodes}
          status={status}
        />

        <LogStream logs={logs} />

        <ErrorBanner error={error} onRetry={retry} />

        <PromptForm onSubmit={run} disabled={status === "running"} />
      </aside>

      <main className="main-panel">
        <div className="tabs" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={`tab ${tab === "plan" ? "active" : ""}`}
              onClick={() => setTab("plan")}
            >
              Plan & Tasks
            </button>
            <button
              className={`tab ${tab === "files" ? "active" : ""}`}
              onClick={() => setTab("files")}
            >
              Files
            </button>
            <button
              className={`tab ${tab === "preview" ? "active" : ""}`}
              onClick={() => setTab("preview")}
            >
              Preview
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", paddingRight: 4 }}>
            <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>
          </div>
        </div>

        <div className="tab-content">
          {tab === "plan" && (
            <PlanView plan={plan} taskPlan={taskPlan} coderState={coderState} />
          )}
          {tab === "files" && <FileExplorer refreshSignal={refreshSignal} />}
          {tab === "preview" && (
            <PreviewPane refreshSignal={refreshSignal} hasFiles={hasFiles} />
          )}
        </div>
      </main>
    </div>
  );
}
