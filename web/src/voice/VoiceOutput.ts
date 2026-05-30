const voiceApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

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
    await new Audio(audioUrl).play();
  } finally {
    URL.revokeObjectURL(audioUrl);
  }
}
