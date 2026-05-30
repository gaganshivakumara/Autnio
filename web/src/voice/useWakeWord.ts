import { useEffect, useRef } from "react";

// Web Speech API — not in standard TS DOM lib
interface SR {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

type SRConstructor = new () => SR;

function getSR(): SRConstructor | undefined {
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as SRConstructor | undefined;
}

export function useWakeWord(onDetected: () => void, enabled: boolean) {
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    const SR = getSR();
    if (!SR || !enabled) return;

    let active = true;
    let cooldown = false;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      if (cooldown) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript.toLowerCase();
        if (t.includes("halo")) {
          cooldown = true;
          onDetectedRef.current();
          setTimeout(() => { cooldown = false; }, 3000);
          break;
        }
      }
    };

    recognition.onend = () => {
      if (active) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") { active = false; return; }
      if (event.error === "aborted") return;
      setTimeout(() => {
        if (active) { try { recognition.start(); } catch { /* ok */ } }
      }, 500);
    };

    try { recognition.start(); } catch { /* ok */ }

    return () => {
      active = false;
      try { recognition.stop(); } catch { /* ok */ }
    };
  }, [enabled]);
}
