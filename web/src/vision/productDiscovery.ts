// Product/place discovery orchestrator for the camera path.
//
// Flow: a captured camera frame → Qwen3-VL identifies the item → the
// identification is sent to the chat agent, which calls the `productDiscovery`
// action (Apify via MCP) → the agent's spoken narration is read back aloud.
//
// Designed for blind / low-vision use: every stage emits audio, and the only
// physical action required is pointing the camera (the trigger is a voice command).
import { analyzeFrame, uploadFrame } from "./visionApi";
import { speakText } from "../voice/VoiceOutput";

const restApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

// Ask vision for a SHORT Amazon-searchable description, not an exact match.
const IDENTIFY_PROMPT =
  "Describe the single main product in this image as a short Amazon search phrase of " +
  "AT MOST 5 words, including colour and brand if visible (e.g. \"blue american tourister laptop bag\"). " +
  "Reply with only that phrase — no extra words.";

export type DiscoveryProgress = (stage: "capturing" | "identifying" | "scraping" | "done" | "error", detail?: string) => void;

export interface DiscoveryResult {
  identification: string;
  answer: string;
}

/** Short audible shutter so a non-sighted user knows the photo was taken. */
function playShutter(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // audio not available — non-fatal
  }
}

/**
 * Run the full camera → discovery → speech pipeline for one captured frame.
 * @param blob   JPEG frame from CameraFeed
 * @param opts   userId, auth token, sessionId for this product, progress callback
 *
 * Pass a fresh `sessionId` per capture (e.g. `product-${uuid}`) so each new
 * product starts a clean Bedrock session — its description and reviews never
 * mix with a previously scanned product. Follow-up questions should reuse the
 * same id; the next capture should rotate it.
 */
export async function discoverFromFrame(
  blob: Blob,
  opts: { userId?: string; idToken?: string; sessionId?: string; onProgress?: DiscoveryProgress } = {},
): Promise<DiscoveryResult> {
  const { userId = "anonymous", idToken, sessionId, onProgress } = opts;
  try {
    playShutter();
    onProgress?.("capturing");
    await speakText("Got it. Looking at that now, one second.", idToken);

    onProgress?.("identifying");
    const upload = await uploadFrame(blob, userId);
    const vision = await analyzeFrame({ imageS3Key: upload.imageS3Key, mode: "detect", prompt: IDENTIFY_PROMPT });
    // Keep only the first 5 words — this is what gets searched on Amazon.
    const identification = vision.result.trim().split(/\s+/).slice(0, 5).join(" ");

    onProgress?.("scraping", identification);
    const answer = await askAgentAboutItem(identification, idToken, sessionId);

    onProgress?.("done", identification);
    await speakText(answer, idToken);
    return { identification, answer };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    onProgress?.("error", message);
    await speakText("Sorry, I couldn't get the details for that. Want to try again?", idToken);
    throw error;
  }
}

/** Send the identified item to the agent, which runs productDiscovery and returns the spoken narration. */
async function askAgentAboutItem(identification: string, idToken?: string, sessionId?: string): Promise<string> {
  const message =
    `I'm pointing my camera at a product identified as: "${identification}". ` +
    `Use product discovery to search Amazon and tell me how it is.`;

  const res = await fetch(`${restApiUrl}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ message, ...(sessionId ? { sessionId } : {}) }),
  });

  if (!res.ok) throw new Error(`Discovery request failed: ${res.status}`);
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { response?: string };
    return parsed.response ?? text;
  } catch {
    return text;
  }
}
