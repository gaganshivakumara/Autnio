import { useState, useCallback } from "react";
import { MorphPanel } from "@/components/ui/ai-input";

const restApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

export function ChatInterface({
  idToken,
  sessionId,
  onSessionId,
}: {
  idToken?: string;
  // Session is owned by the parent so a camera discovery and its follow-up
  // questions share one Bedrock session, and a new capture can rotate it.
  sessionId?: string;
  onSessionId?: (id: string) => void;
}): JSX.Element {
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = useCallback(async (message: string): Promise<void> => {
    setLoading(true);
    setResponse("");
    try {
      const res = await fetch(`${restApiUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ message, ...(sessionId ? { sessionId } : {}) }),
      });
      const text = await res.text();
      try {
        const parsed = JSON.parse(text) as { response?: string; sessionId?: string };
        // Persist the session id so subsequent turns continue the same conversation.
        if (parsed.sessionId) onSessionId?.(parsed.sessionId);
        setResponse(parsed.response ?? (text || `HTTP ${res.status}`));
      } catch {
        setResponse(text || `HTTP ${res.status}`);
      }
    } catch (e) {
      setResponse(e instanceof Error ? e.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }, [idToken, sessionId, onSessionId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      <MorphPanel onSend={handleSend} isLoading={loading} />
      {response && (
        <pre style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--ink-1)",
          borderRadius: "var(--r-md)",
          color: "var(--green-fog)",
          overflow: "auto",
          padding: "1rem 1.25rem",
          whiteSpace: "pre-wrap",
          fontFamily: "var(--font-mono)",
          fontSize: "0.82rem",
          lineHeight: 1.6,
          border: "1px solid rgba(143,191,143,0.12)",
          margin: 0,
        }}>
          {response}
        </pre>
      )}
    </div>
  );
}
