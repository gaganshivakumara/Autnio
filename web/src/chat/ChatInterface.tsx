import { useState, useCallback } from "react";
import { MorphPanel } from "@/components/ui/ai-input";

const restApiUrl = import.meta.env.VITE_REST_API_URL as string;

export function ChatInterface({ idToken }: { idToken?: string }): JSX.Element {
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
        body: JSON.stringify({ message }),
      });
      setResponse(await res.text() || `HTTP ${res.status}`);
    } catch (e) {
      setResponse(e instanceof Error ? e.message : "Chat request failed");
    } finally {
      setLoading(false);
    }
  }, [idToken]);

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
