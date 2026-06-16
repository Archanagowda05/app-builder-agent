import { useCallback, useRef, useState } from "react";

/**
 * Manages a single WebSocket run of the agent graph.
 *
 * Tracks:
 * - status: "idle" | "running" | "done" | "error"
 * - activeNode: name of the node currently executing ("planner" | "architect" | "coder" | null)
 * - completedNodes: set of node names that have produced at least one step
 * - plan, taskPlan: latest structured outputs from planner / architect
 * - coderState: latest coder progress (task_plan + current_step_idx)
 * - logs: chronological list of step events for the log stream
 * - error: { code, message, retryable } | null
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

  const socketRef = useRef(null);
  const lastPromptRef = useRef("");

  const reset = useCallback(() => {
    setActiveNode(null);
    setCompletedNodes(new Set());
    setPlan(null);
    setTaskPlan(null);
    setCoderState(null);
    setLogs([]);
    setError(null);
  }, []);

  const run = useCallback(
    (userPrompt) => {
      if (socketRef.current) {
        socketRef.current.close();
      }

      lastPromptRef.current = userPrompt;
      reset();
      setStatus("running");

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/run`);
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ user_prompt: userPrompt }));
        setLogs((prev) => [...prev, { type: "system", text: "Run started" }]);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "error") {
          const friendly = {
            code: msg.code ?? "unknown",
            message: msg.message ?? "Something went wrong. Please try again.",
            retryable: msg.retryable ?? true,
          };
          setError(friendly);
          setStatus("error");
          setLogs((prev) => [...prev, { type: "error", text: friendly.message }]);
          return;
        }

        if (msg.type === "done") {
          setStatus("done");
          setActiveNode(null);
          setLogs((prev) => [...prev, { type: "system", text: "Run complete" }]);
          return;
        }

        if (msg.type === "step") {
          const { node, data } = msg;
          setActiveNode(node);
          setCompletedNodes((prev) => new Set(prev).add(node));

          if (node === "planner" && data.plan) {
            setPlan(data.plan);
            setLogs((prev) => [
              ...prev,
              { type: "step", node, text: `Created plan: ${data.plan.name}` },
            ]);
          } else if (node === "architect" && data.task_plan) {
            setTaskPlan(data.task_plan);
            setLogs((prev) => [
              ...prev,
              {
                type: "step",
                node,
                text: `Broke plan into ${data.task_plan.implementation_steps.length} task(s)`,
              },
            ]);
          } else if (node === "coder" && data.coder_state) {
            setCoderState(data.coder_state);
            const cs = data.coder_state;
            const steps = cs.task_plan.implementation_steps;
            const idx = cs.current_step_idx;
            const label =
              data.status === "DONE"
                ? "All files generated"
                : `Wrote ${steps[idx - 1]?.filepath ?? "file"} (${idx}/${steps.length})`;
            setLogs((prev) => [...prev, { type: "step", node, text: label }]);
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
      run(lastPromptRef.current);
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
    run,
    retry,
  };
}
