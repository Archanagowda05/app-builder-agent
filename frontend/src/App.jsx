import { useState, useEffect } from "react";
import { useAgentSocket } from "./hooks/useAgentSocket";
import ProjectSidebar from "./components/ProjectSidebar";
import PipelineStatus from "./components/PipelineStatus";
import LogStream from "./components/LogStream";
import PromptForm from "./components/PromptForm";
import PlanView from "./components/PlanView";
import FileExplorer from "./components/FileExplorer";
import PreviewPane from "./components/PreviewPane";
import ErrorBanner from "./components/ErrorBanner";
import ChatEditor from "./components/ChatEditor";
import HistoryView from "./components/HistoryView";

const STATUS_LABEL = {
  idle: "idle",
  running: "running",
  done: "done",
  error: "error",
};

export default function App() {
  const [activeProject, setActiveProject] = useState("kid-calculator");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [leftTab, setLeftTab] = useState("chat"); // "chat" | "build"
  const [rightTab, setRightTab] = useState("preview"); // "preview" | "files" | "history" | "plan"
  const [refreshSignalCount, setRefreshSignalCount] = useState(0);

  const {
    status,
    activeNode,
    completedNodes,
    plan,
    taskPlan,
    coderState,
    logs,
    error,
    currentProject,
    currentActivity,
    run,
    retry,
  } = useAgentSocket();

  useEffect(() => {
    if (currentProject && currentProject !== activeProject) {
      setActiveProject(currentProject);
      setRefreshSignalCount((prev) => prev + 1);
    }
  }, [currentProject]);

  const handleProjectUpdated = () => {
    setRefreshSignalCount((prev) => prev + 1);
  };

  const handleSelectProject = (projectId) => {
    setActiveProject(projectId);
    setRefreshSignalCount((prev) => prev + 1);
  };

  const handleNewProject = (name) => {
    const cleanId = name.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-");
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanId }),
    })
      .then((res) => res.json())
      .then((data) => {
        setActiveProject(data.id);
        setLeftTab("build");
        setRefreshSignalCount((prev) => prev + 1);
      })
      .catch((e) => alert("Failed to create project: " + e.message));
  };

  const handleInitialGenerate = (promptText) => {
    run(promptText, activeProject);
  };

  const refreshSignal = `${activeProject}-${activeNode ?? ""}-${coderState?.current_step_idx ?? 0}-${status}-${refreshSignalCount}`;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: "var(--bg)" }}>
      {/* 1. Left Minimizable Project History Sidebar */}
      <ProjectSidebar
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        refreshSignal={refreshSignal}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* 2. Chat / Modification Panel (Lovable left-side interaction) */}
      <aside
        style={{
          width: "420px",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--surface-border)",
          background: "var(--bg-elevated)",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        {/* Panel Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--surface-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-primary)" }}>
              {activeProject}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
              Active Project Workspace
            </div>
          </div>
          <div style={{ display: "flex", gap: "4px", background: "var(--surface)", padding: "3px", borderRadius: "6px" }}>
            <button
              onClick={() => setLeftTab("chat")}
              style={{
                background: leftTab === "chat" ? "var(--accent)" : "transparent",
                color: leftTab === "chat" ? "#fff" : "var(--text-secondary)",
                border: "none",
                borderRadius: "4px",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              💬 Modify
            </button>
            <button
              onClick={() => setLeftTab("build")}
              style={{
                background: leftTab === "build" ? "var(--accent)" : "transparent",
                color: leftTab === "build" ? "#fff" : "var(--text-secondary)",
                border: "none",
                borderRadius: "4px",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              ⚡ Full Rebuild
            </button>
          </div>
        </div>

        {/* Tab 1: In-Place Chat Refinement (Lovable style) */}
        {leftTab === "chat" && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatEditor
              project={activeProject}
              onProjectUpdated={handleProjectUpdated}
              disabled={status === "running"}
            />
          </div>
        )}

        {/* Tab 2: Full Build / Scratch Generation Mode */}
        {leftTab === "build" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px", gap: "14px", overflowY: "auto" }}>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              Re-generate or plan the full application from a complete specification prompt:
            </div>
            <PipelineStatus
              activeNode={activeNode}
              completedNodes={completedNodes}
              status={status}
              currentActivity={currentActivity}
            />
            <LogStream logs={logs} />
            <ErrorBanner error={error} onRetry={retry} />
            <PromptForm
              onSubmit={handleInitialGenerate}
              disabled={status === "running"}
              placeholder={`Build entire ${activeProject} from scratch...`}
            />
          </div>
        )}
      </aside>

      {/* 3. Main Center/Right Panel: Live Preview & Inspection */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* Right Header Navigation Tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 16px 0 16px",
            borderBottom: "1px solid var(--surface-border)",
            background: "var(--bg)",
          }}
        >
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              className={`tab ${rightTab === "preview" ? "active" : ""}`}
              onClick={() => setRightTab("preview")}
            >
              👁️ Preview
            </button>
            <button
              className={`tab ${rightTab === "files" ? "active" : ""}`}
              onClick={() => setRightTab("files")}
            >
              📄 Code Files
            </button>
            <button
              className={`tab ${rightTab === "history" ? "active" : ""}`}
              onClick={() => setRightTab("history")}
            >
              🕒 Version History
            </button>
            <button
              className={`tab ${rightTab === "plan" ? "active" : ""}`}
              onClick={() => setRightTab("plan")}
            >
              📋 Architecture Plan
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "8px" }}>
            <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, padding: "16px", overflow: "hidden" }}>
          {rightTab === "preview" && (
            <PreviewPane
              project={activeProject}
              refreshSignal={refreshSignal}
              hasFiles={true}
            />
          )}
          {rightTab === "files" && (
            <FileExplorer
              project={activeProject}
              refreshSignal={refreshSignal}
            />
          )}
          {rightTab === "history" && (
            <HistoryView
              project={activeProject}
              refreshSignal={refreshSignal}
              onRestore={handleProjectUpdated}
            />
          )}
          {rightTab === "plan" && (
            <PlanView
              plan={plan}
              taskPlan={taskPlan}
              coderState={coderState}
            />
          )}
        </div>
      </main>
    </div>
  );
}
