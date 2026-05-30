const voiceApiUrl = import.meta.env.VITE_VOICE_API_URL as string;

export type VoiceSession = {
  /** Stop recording and return the server-side transcript. */
  stop(): Promise<string>;
  /** Abort recording without transcribing. */
  cancel(): void;
};

// Silence detection tuning
const SILENCE_THRESHOLD  = 0.012; // RMS level below which audio counts as silent
const SILENCE_DURATION   = 1600;  // ms of continuous silence before auto-stop fires
const MIN_RECORD_MS      = 400;   // don't detect silence until this many ms have passed

/**
 * Start recording from the microphone. Returns a VoiceSession whose
 * stop() method ends recording, ships the audio to the /voice/transcribe
 * Lambda, and resolves with the transcript.
 *
 * Pass onSilence to get an automatic callback when the user stops speaking
 * (after MIN_RECORD_MS has elapsed). The caller should call stop() or cancel()
 * in response.
 */
export async function startVoiceSession(
  idToken: string,
  { onSilence }: { onSilence?: () => void } = {}
): Promise<VoiceSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  const ctx         = new AudioContext();
  const ACTUAL_RATE = ctx.sampleRate;
  const source      = ctx.createMediaStreamSource(stream);
  const processor   = ctx.createScriptProcessor(4096, 1, 1);
  const analyser    = ctx.createAnalyser();
  analyser.fftSize  = 1024;
  const chunks: Float32Array[] = [];

  const startTime   = Date.now();
  let silenceStart  = 0;
  let silenceFired  = false;
  const analyserBuf = new Float32Array(analyser.fftSize);

  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));

    if (onSilence && !silenceFired && Date.now() - startTime > MIN_RECORD_MS) {
      analyser.getFloatTimeDomainData(analyserBuf);
      const rms = Math.sqrt(analyserBuf.reduce((s, v) => s + v * v, 0) / analyserBuf.length);
      if (rms < SILENCE_THRESHOLD) {
        if (silenceStart === 0) silenceStart = Date.now();
        else if (Date.now() - silenceStart > SILENCE_DURATION) {
          silenceFired = true;
          onSilence();
        }
      } else {
        silenceStart = 0;
      }
    }
  };

  const silencer = ctx.createGain();
  silencer.gain.value = 0;
  source.connect(analyser);
  source.connect(processor);
  processor.connect(silencer);
  silencer.connect(ctx.destination);

  const cleanup = () => {
    silenceFired = true; // prevent late-firing onSilence after cancel
    try { source.disconnect(); } catch { /* ok */ }
    try { processor.disconnect(); } catch { /* ok */ }
    try { silencer.disconnect(); } catch { /* ok */ }
    try { analyser.disconnect(); } catch { /* ok */ }
    void ctx.close();
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    cancel() {
      cleanup();
    },
    async stop(): Promise<string> {
      cleanup();

      if (chunks.length === 0) throw new Error("No audio captured");

      const totalLen = chunks.reduce((n, c) => n + c.length, 0);
      const flat     = new Float32Array(totalLen);
      let offset     = 0;
      for (const chunk of chunks) { flat.set(chunk, offset); offset += chunk.length; }

      const audioBase64 = float32ToPcm16Base64(flat);

      const response = await fetch(`${voiceApiUrl}/voice/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ audioBase64, languageCode: "en-US", mediaEncoding: "pcm", mediaSampleRateHz: ACTUAL_RATE }),
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => "");
        throw new Error(`Transcribe ${response.status}: ${msg || response.statusText}`);
      }
      const body = (await response.json()) as { result?: string; message?: string };
      if (!body.result) throw new Error(body.message ?? "No speech detected");
      return body.result;
    },
  };
}

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
  const RECORD_MS = 5000;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  // Do NOT request a specific sample rate — browsers often ignore it and create
  // the context at their native rate (44100 or 48000 Hz). We read the actual
  // rate after creation and pass it to Transcribe.
  const ctx    = new AudioContext();
  const ACTUAL_RATE = ctx.sampleRate; // e.g. 44100 or 48000
  const source = ctx.createMediaStreamSource(stream);

  // ScriptProcessor is deprecated but still universally supported;
  // bufferSize 4096 gives ~256 ms chunks at 16 kHz.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (e) => {
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
  };

  // Mute the output — processor must be connected to destination to fire
  // onaudioprocess in Chrome, but we don't want playback.
  const silencer = ctx.createGain();
  silencer.gain.value = 0;
  source.connect(processor);
  processor.connect(silencer);
  silencer.connect(ctx.destination);

  await new Promise<void>((resolve) => setTimeout(resolve, RECORD_MS));

  source.disconnect();
  processor.disconnect();
  silencer.disconnect();
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
      mediaSampleRateHz: ACTUAL_RATE, // read from AudioContext, not assumed
    }),
  });

  if (!response.ok) throw new Error(`Transcribe failed: ${response.status}`);
  const body = (await response.json()) as { result: string };
  return body.result;
}
