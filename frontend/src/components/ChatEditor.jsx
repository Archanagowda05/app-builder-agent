import { useState, useRef, useEffect } from "react";

export default function ChatEditor({ project, onProjectUpdated, disabled }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // Load chat history from localStorage per project so previous things done/changed are preserved
  useEffect(() => {
    const storageKey = `lovable_chat_history_${project}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setMessages(JSON.parse(saved));
        return;
      }
    } catch (e) {
      console.warn("Failed to read chat history", e);
    }
    // Default initial greeting if no history
    setMessages([
      {
        role: "assistant",
        text: `✨ What would you like to edit or add in "${project}"?`,
      },
    ]);
  }, [project]);

  // Persist messages whenever updated
  useEffect(() => {
    if (messages.length > 0 && project) {
      try {
        localStorage.setItem(`lovable_chat_history_${project}`, JSON.stringify(messages));
      } catch (e) {
        console.warn("Failed to save chat history", e);
      }
    }
  }, [messages, project]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || loading || disabled) return;

    setInput("");
    const userMsg = { role: "user", text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages((prev) => [...prev, userMsg]);
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
            modifiedFiles: data.modified_files || [],
            versionSaved: data.version_saved,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        if (onProjectUpdated) onProjectUpdated();
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.error || "Failed to update project",
            isError: true,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Connection error: " + err.message,
          isError: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    localStorage.removeItem(`lovable_chat_history_${project}`);
    setMessages([
      {
        role: "assistant",
        text: `✨ What would you like to edit or add in "${project}"?`,
      },
    ]);
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
      {/* Sub-header with quick actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 16px",
          borderBottom: "1px solid var(--surface-border)",
          background: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-tertiary)" }}>
          <span>💬</span>
          <span>In-place refinement</span>
        </div>
        <button
          onClick={handleClearHistory}
          title="Clear conversation history for this project"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            fontSize: "11px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 6px",
            borderRadius: "4px",
          }}
        >
          🗑️ Clear
        </button>
      </div>

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
              borderRadius: "12px",
              padding: "12px 14px",
              fontSize: "13px",
              lineHeight: "1.5",
              boxShadow: m.role === "user" ? "0 2px 10px rgba(99, 102, 241, 0.25)" : "none",
            }}
          >
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>

            {/* Changed files pills */}
            {m.modifiedFiles && m.modifiedFiles.length > 0 && (
              <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", alignSelf: "center", marginRight: "2px" }}>
                  Modified:
                </span>
                {m.modifiedFiles.map((file) => (
                  <span
                    key={file}
                    style={{
                      background: "rgba(74, 222, 128, 0.12)",
                      border: "1px solid rgba(74, 222, 128, 0.3)",
                      color: "var(--success)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "10.5px",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    📄 {file}
                  </span>
                ))}
              </div>
            )}

            {/* Version Snapshot footer */}
            {m.versionSaved && (
              <div
                style={{
                  fontSize: "10px",
                  marginTop: "6px",
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>🕒</span>
                <span>Saved snapshot: {m.versionSaved}</span>
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
              borderRadius: "12px",
              padding: "10px 14px",
              fontSize: "12.5px",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--accent)",
                boxShadow: "0 0 8px var(--accent)",
                display: "inline-block",
              }}
            />
            Updating files in-place...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        style={{
          display: "flex",
          gap: "8px",
          padding: "12px 16px",
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
          placeholder={`Describe your edit for "${project}"...`}
          disabled={loading || disabled}
          style={{
            flex: 1,
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            padding: "10px 12px",
            fontSize: "13px",
            lineHeight: "1.4",
            outline: "none",
            resize: "none",
            fontFamily: "var(--font-ui)",
          }}
        />
        <button
          type="submit"
          title="Send edit request (Enter)"
          disabled={loading || disabled || !input.trim()}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-sm)",
            width: "42px",
            height: "42px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
            opacity: loading || disabled || !input.trim() ? 0.4 : 1,
          }}
        >
          {loading ? "⏳" : "➤"}
        </button>
      </form>
    </div>
  );
}
