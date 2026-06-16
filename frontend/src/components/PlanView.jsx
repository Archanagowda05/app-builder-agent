export default function PlanView({ plan, taskPlan, coderState }) {
  if (!plan) {
    return (
      <div className="code-viewer-empty">
        The plan will appear here once the planner agent runs.
      </div>
    );
  }

  const steps = taskPlan?.implementation_steps ?? [];
  const currentIdx = coderState?.current_step_idx ?? 0;

  return (
    <div>
      <div className="glass plan-card">
        <h2>{plan.name}</h2>
        <p className="plan-desc">{plan.description}</p>
        <div className="plan-meta">
          <span className="pill">{plan.techstack}</span>
          {plan.files?.map((f) => (
            <span className="pill" key={f.path}>
              {f.path}
            </span>
          ))}
        </div>
        {plan.features?.length > 0 && (
          <ul className="plan-features">
            {plan.features.map((feature, i) => (
              <li key={i}>{feature}</li>
            ))}
          </ul>
        )}
      </div>

      {steps.length > 0 && (
        <div className="task-list">
          {steps.map((step, i) => {
            let statusClass = "";
            let icon = "";
            if (i < currentIdx) {
              statusClass = "done";
              icon = "✓";
            } else if (i === currentIdx) {
              statusClass = "active";
            }

            return (
              <div className="glass task-item" key={i}>
                <div className={`task-status ${statusClass}`}>{icon}</div>
                <div className="task-body">
                  <div className="task-file">{step.filepath}</div>
                  <div className="task-desc">{step.task_description}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
