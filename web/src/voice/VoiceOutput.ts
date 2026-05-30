const voiceApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

let activeAudio: HTMLAudioElement | null = null;

function stopCurrentSpeech(): void {
  activeAudio?.pause();
  activeAudio = null;
  window.speechSynthesis?.cancel();
}

function playAudio(audioUrl: string): Promise<void> {
  stopCurrentSpeech();
  const audio = new Audio(audioUrl);
  activeAudio = audio;

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (activeAudio === audio) activeAudio = null;
      reject(new Error("Audio playback failed"));
    };
    void audio.play().catch(reject);
  });
}

function speakWithBrowser(text: string): Promise<void> {
  stopCurrentSpeech();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.12;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis?.speak(utterance);
  });
}

export async function speakText(text: string, idToken?: string): Promise<void> {
  const response = await fetch(`${voiceApiUrl}/voice/tts`, {
    method: "POST",
    headers: {
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
  const { data } = (await response.json()) as {
    data: { audioBase64: string; contentType: string };
  };
  const audioBytes = Uint8Array.from(atob(data.audioBase64), (char) => char.charCodeAt(0));
  const audioBlob = new Blob([audioBytes], { type: data.contentType });
  const audioUrl = URL.createObjectURL(audioBlob);

  try {
    await playAudio(audioUrl);
  } finally {
    URL.revokeObjectURL(audioUrl);
  }
}

export async function speakGuidance(text: string, idToken?: string): Promise<void> {
  const shortText = text.trim();
  if (!shortText) return;

  try {
    await speakText(shortText, idToken);
  } catch {
    await speakWithBrowser(shortText);
  }
}
