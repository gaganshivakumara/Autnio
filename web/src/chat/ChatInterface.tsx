import { useState } from "react";
import SearchComponent from "@/components/ui/animated-glowing-search-bar";

const restApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

export function ChatInterface({ idToken }: { idToken?: string }): JSX.Element {
  const [message, setMessage] = useState("");
  const [responseText, setResponseText] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (): Promise<void> => {
    if (!message.trim() || loading) return;
    setLoading(true);
    setResponseText("");
    try {
      const response = await fetch(`${restApiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ message }),
      });
      const body = await response.text();
      setResponseText(body || `HTTP ${response.status}`);
      setMessage("");
    } catch (error) {
      setResponseText(error instanceof Error ? error.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>Chat</h2>
      <div style={{ display: "flex", justifyContent: "center", padding: "0.5rem 0 0.25rem" }}>
        <SearchComponent
          value={message}
          onChange={setMessage}
          onSubmit={sendMessage}
          placeholder="Ask Autnio..."
          loading={loading}
        />
      </div>
      <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--ink-4)", margin: "0.5rem 0 0", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
        {loading ? "thinking..." : "press enter to send"}
      </p>
      <pre>{responseText || "Waiting for /chat endpoint."}</pre>
    </section>
  );
}
