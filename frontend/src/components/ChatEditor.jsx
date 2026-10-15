import { useState, useRef, useEffect } from "react";

export default function ChatEditor({ project, onProjectUpdated, disabled }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: `👋 Chatting in "${project}".\n\nAsk me to tweak styling, fix bugs, add new buttons, or adjust animations. I'll modify the existing code in-place without rebuilding from scratch!`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text: `👋 Active project: "${project}".\n\nWhat would you like to modify or fix in the existing code?`,
      },
    ]);
  }, [project]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || loading || disabled) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const token = localStorage.getItem("app_builder_token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ project, message: text }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.reply || "Project updated successfully!",
            versionSaved: data.version_saved,
          },
        ]);
        if (onProjectUpdated) onProjectUpdated();
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "❌ Error: " + (data.error || "Failed to update project"),
            isError: true,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "❌ Connection error: " + err.message, isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-elevated)",
        minHeight: 0,
      }}
    >
      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          minHeight: 0,
        }}
      >
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              background: m.role === "user" ? "var(--accent)" : "var(--surface)",
              color: m.isError ? "var(--error)" : "var(--text-primary)",
              border: `1px solid ${m.role === "user" ? "transparent" : "var(--surface-border)"}`,
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "13px",
              lineHeight: "1.6",
              whiteSpace: "pre-wrap",
              boxShadow: m.role === "user" ? "0 2px 8px rgba(99, 102, 241, 0.25)" : "none",
            }}
          >
            {m.text}
            {m.versionSaved && (
              <div
                style={{
                  fontSize: "11px",
                  marginTop: "8px",
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                  borderTop: "1px solid var(--surface-border)",
                  paddingTop: "4px",
                }}
              >
                Snapshot saved: {m.versionSaved}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              background: "var(--surface)",
              border: "1px solid var(--surface-border)",
              borderRadius: "10px",
              padding: "12px 16px",
              fontSize: "13px",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span className="pulse-dot" style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)" }} />
            Modifying existing project files in-place...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        style={{
          display: "flex",
          gap: "10px",
          padding: "14px 20px",
          borderTop: "1px solid var(--surface-border)",
          background: "var(--bg)",
          alignItems: "flex-end",
        }}
      >
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={`Tell me what to modify in "${project}" (e.g. "Add a backspace button and align keys in a 4-column grid")...`}
          disabled={loading || disabled}
          style={{
            flex: 1,
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            padding: "10px 14px",
            fontSize: "13px",
            lineHeight: "1.4",
            outline: "none",
            resize: "none",
            fontFamily: "var(--font-ui)",
          }}
        />
        <button
          type="submit"
          disabled={loading || disabled || !input.trim()}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "10px 20px",
            fontWeight: "600",
            fontSize: "13px",
            cursor: "pointer",
            height: "44px",
            boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
          }}
        >
          {loading ? "Modifying…" : "Send Fix"}
        </button>
      </form>
    </div>
  );
}
