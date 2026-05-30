const voiceApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function recordAndTranscribe(idToken: string): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (event) => chunks.push(event.data);
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.start();
    setTimeout(() => recorder.stop(), 5000);
  });
  stream.getTracks().forEach((track) => track.stop());

  const blob = new Blob(chunks, { type: "audio/webm" });
  const audioBase64 = await blobToBase64(blob);

  const response = await fetch(`${voiceApiUrl}/voice/transcribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audioBase64,
      languageCode: "en-US",
      mediaEncoding: "ogg-opus",
      mediaSampleRateHz: 48000,
    }),
  });

  if (!response.ok) throw new Error(`Transcribe failed: ${response.status}`);
  const body = (await response.json()) as { result: string };
  return body.result;
}
