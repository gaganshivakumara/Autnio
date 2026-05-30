import { useState } from "react";

const restApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

export function ChatInterface({ idToken }: { idToken?: string }): JSX.Element {
  const [message, setMessage] = useState("");
  const [responseText, setResponseText] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (): Promise<void> => {
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
    } catch (error) {
      setResponseText(error instanceof Error ? error.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>Chat</h2>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Ask Autnio..."
        rows={3}
      />
      <button type="button" onClick={sendMessage} disabled={!message || loading}>
        {loading ? "Sending..." : "Send to /chat"}
      </button>
      <pre>{responseText || "Waiting for Dev3 /chat endpoint."}</pre>
    </section>
  );
}
