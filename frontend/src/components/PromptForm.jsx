import { useState } from "react";

export default function PromptForm({ onSubmit, disabled }) {
  const [value, setValue] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit(value.trim());
  };

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <textarea
        placeholder="Describe the app to build, e.g. 'A habit tracker with daily streaks and a calendar view'"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        {disabled ? "Running…" : "Generate project"}
      </button>
    </form>
  );
}
