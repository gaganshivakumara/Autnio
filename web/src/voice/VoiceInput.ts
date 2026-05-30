const voiceApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

/** Convert Float32 PCM samples → base64-encoded 16-bit signed LE PCM */
function float32ToPcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  // Convert to base64
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Record ~5 seconds of audio via Web Audio API, downsample to 16 kHz mono PCM,
 * and send to the Amazon Transcribe Lambda.
 *
 * Using raw PCM avoids the WebM/Ogg container mismatch that breaks Transcribe
 * Streaming when the browser produces audio/webm (not ogg-opus).
 */
export async function recordAndTranscribe(idToken: string): Promise<string> {
  const RECORD_MS   = 5000;
  const TARGET_RATE = 16000;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  // Use AudioContext at the target rate so no manual resampling is needed
  const ctx     = new AudioContext({ sampleRate: TARGET_RATE });
  const source  = ctx.createMediaStreamSource(stream);

  // ScriptProcessor is deprecated but still universally supported;
  // bufferSize 4096 gives ~256 ms chunks at 16 kHz.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  await new Promise<void>((resolve) => setTimeout(resolve, RECORD_MS));

  source.disconnect();
  processor.disconnect();
  await ctx.close();
  stream.getTracks().forEach((t) => t.stop());

  // Flatten all chunks into a single Float32Array
  const totalLen = chunks.reduce((n, c) => n + c.length, 0);
  const flat     = new Float32Array(totalLen);
  let offset     = 0;
  for (const chunk of chunks) {
    flat.set(chunk, offset);
    offset += chunk.length;
  }

  const audioBase64 = float32ToPcm16Base64(flat);

  const response = await fetch(`${voiceApiUrl}/voice/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({
      audioBase64,
      languageCode:      "en-US",
      mediaEncoding:     "pcm",
      mediaSampleRateHz: TARGET_RATE,
    }),
  });

  if (!response.ok) throw new Error(`Transcribe failed: ${response.status}`);
  const body = (await response.json()) as { result: string };
  return body.result;
}
