import { useCallback, useRef, useState } from "react";

/**
 * Manages a single WebSocket run of the agent graph for a given project.
 */
export function useAgentSocket() {
  const [status, setStatus] = useState("idle");
  const [activeNode, setActiveNode] = useState(null);
  const [completedNodes, setCompletedNodes] = useState(new Set());
  const [plan, setPlan] = useState(null);
  const [taskPlan, setTaskPlan] = useState(null);
  const [coderState, setCoderState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [currentProject, setCurrentProject] = useState(null);
  const [currentActivity, setCurrentActivity] = useState(null);

  const socketRef = useRef(null);
  const lastPromptRef = useRef("");
  const lastProjectRef = useRef("");

  const reset = useCallback(() => {
    setActiveNode(null);
    setCompletedNodes(new Set());
    setPlan(null);
    setTaskPlan(null);
    setCoderState(null);
    setCurrentActivity(null);
    setLogs([]);
    setError(null);
  }, []);

  const run = useCallback(
    (userPrompt, projectName = "", token = "") => {
      if (socketRef.current) {
        socketRef.current.close();
      }

      lastPromptRef.current = userPrompt;
      lastProjectRef.current = projectName;
      reset();
      setStatus("running");

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/run`);
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            user_prompt: userPrompt,
            project_name: projectName,
            token: token,
          })
        );
        setLogs((prev) => [...prev, { type: "system", text: `Run started for "${projectName || "new project"}"` }]);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "project_info") {
          setCurrentProject(msg.project_id);
          return;
        }

        if (msg.type === "activity") {
          setCurrentActivity(msg);
          let icon = "⚡";
          if (msg.action === "planning") icon = "📐";
          else if (msg.action === "architecting") icon = "🏗️";
          else if (msg.action === "searching") icon = "🔍";
          else if (msg.action === "reading") icon = "📖";
          else if (msg.action === "coding") icon = "✍️";
          else if (msg.action === "completed_file") icon = "✅";

          setLogs((prev) => [
            ...prev,
            {
              type: `activity-${msg.action}`,
              node: msg.action,
              text: `${icon} ${msg.message}`,
              file: msg.file,
              phase: msg.phase,
            },
          ]);
          return;
        }

        if (msg.type === "error") {
          const friendly = {
            code: msg.code ?? "unknown",
            message: msg.message ?? "Something went wrong. Please try again.",
            retryable: msg.retryable ?? true,
          };
          setError(friendly);
          setStatus("error");
          setCurrentActivity(null);
          setLogs((prev) => [...prev, { type: "error", text: friendly.message }]);
          return;
        }

        if (msg.type === "done") {
          setStatus("done");
          setActiveNode(null);
          setCurrentActivity({ action: "done", message: "Build complete! All files generated." });
          if (msg.project_id) setCurrentProject(msg.project_id);
          setLogs((prev) => [...prev, { type: "system", text: "🎉 Run complete! Project ready." }]);
          return;
        }

        if (msg.type === "step") {
          const { node, data } = msg;
          setActiveNode(node);
          setCompletedNodes((prev) => new Set(prev).add(node));

          if (node === "planner" && data.plan) {
            setPlan(data.plan);
          } else if (node === "architect" && data.task_plan) {
            setTaskPlan(data.task_plan);
          } else if (node === "coder" && data.coder_state) {
            setCoderState(data.coder_state);
          }
        }
      };

      ws.onerror = () => {
        setError({
          code: "connection_error",
          message: "Lost connection to the server. Please try again.",
          retryable: true,
        });
        setStatus("error");
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === "running" ? "error" : prev));
      };
    },
    [reset]
  );

  const retry = useCallback(() => {
    if (lastPromptRef.current) {
      run(lastPromptRef.current, lastProjectRef.current);
    }
  }, [run]);

  return {
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
  };
}
