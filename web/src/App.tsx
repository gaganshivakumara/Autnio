import { useRef, useState } from "react";
import { signIn, signUp, type AuthSession } from "./auth/CognitoAuth";
import { ChatInterface } from "./chat/ChatInterface";
import { FileBrowser } from "./files/FileBrowser";
import { startRelay, type RelayStatus } from "./relay/OIRelay";
import { CameraFeed } from "./vision/CameraFeed";
import { analyzeFrame, uploadFrame, type VisionMode } from "./vision/visionApi";
import { speakText } from "./voice/VoiceOutput";

const wsEndpoint = import.meta.env.VITE_WS_API_URL as string;

export function App(): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [authMessage, setAuthMessage] = useState("Not signed in");
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [relayLog, setRelayLog] = useState<string[]>([]);
  const [visionMode, setVisionMode] = useState<VisionMode>("detect");
  const [visionPrompt, setVisionPrompt] = useState("Describe the scene and identify important objects.");
  const [visionResult, setVisionResult] = useState("");
  const [visionBusy, setVisionBusy] = useState(false);
  const relayRef = useRef<WebSocket | null>(null);

  const handleSignIn = async (): Promise<void> => {
    try {
      const session = await signIn(email, password);
      setAuth(session);
      setAuthMessage(`Signed in as ${session.email}`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Sign-in failed");
    }
  };

  const handleSignUp = async (): Promise<void> => {
    try {
      await signUp(email, password);
      setAuthMessage("Sign-up started. Check email for confirmation if required.");
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Sign-up failed");
    }
  };

  const connectRelay = (): void => {
    if (!auth?.idToken) {
      setRelayLog((prev) => [...prev, "Sign in before connecting relay."]);
      return;
    }
    relayRef.current?.close();
    relayRef.current = startRelay({
      wsEndpoint,
      idToken: auth.idToken,
      onEvent: (event) => {
        if (event.type === "status") setRelayStatus(event.status);
        if (event.type === "log") setRelayLog((prev) => [...prev, event.message]);
      },
    });
  };

  const handleFrame = async (blob: Blob): Promise<void> => {
    setVisionBusy(true);
    setVisionResult("");
    try {
      const userId = auth?.userId ?? "anonymous";
      const upload = await uploadFrame(blob, userId);
      const result = await analyzeFrame({
        imageS3Key: upload.imageS3Key,
        mode: visionMode,
        prompt: visionPrompt,
      });
      setVisionResult(result.result);
      await speakText(result.result, auth?.idToken);
    } catch (error) {
      setVisionResult(error instanceof Error ? error.message : "Vision request failed");
    } finally {
      setVisionBusy(false);
    }
  };

  return (
    <main className="container">
      <header>
        <h1>Autnio</h1>
        <p>Dev4 vision pipeline and web app.</p>
      </header>

      <section className="card">
        <h2>Auth</h2>
        <div className="grid">
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
          />
        </div>
        <div className="buttonRow">
          <button type="button" onClick={handleSignIn}>Sign In</button>
          <button type="button" onClick={handleSignUp}>Sign Up</button>
        </div>
        <p>{authMessage}</p>
      </section>

      <ChatInterface idToken={auth?.idToken} />

      <section className="card">
        <h2>Open Interpreter Relay</h2>
        <p>Status: <strong>{relayStatus}</strong></p>
        <button type="button" onClick={connectRelay}>Connect Relay</button>
        <pre>{relayLog.length ? relayLog.join("\n") : "Waiting for WebSocket endpoint from Dev3."}</pre>
      </section>

      <section className="card">
        <h2>Vision Feed</h2>
        <div className="grid">
          <select value={visionMode} onChange={(event) => setVisionMode(event.target.value as VisionMode)}>
            <option value="detect">detect - Qwen3-VL-235B</option>
            <option value="stream">stream - Nemotron Nano 2 VL</option>
          </select>
          <input value={visionPrompt} onChange={(event) => setVisionPrompt(event.target.value)} />
        </div>
        <CameraFeed onFrame={handleFrame} />
        <pre>{visionBusy ? "Analyzing..." : visionResult || "Capture a frame to analyze."}</pre>
      </section>

      <FileBrowser />
    </main>
  );
}
