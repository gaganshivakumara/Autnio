# Dev 5 — Voice Commands

**Owner:** Dev 5
**Tech:** Amazon Transcribe Streaming (STT), Amazon Polly (TTS), AWS Lambda

---

## Overview

Dev 5 owns the full voice pipeline — speech goes in, speech comes out. Voice is just another input/output channel for the Bedrock Agent: Dev 5 converts microphone audio into text (which hits the same `POST /chat` endpoint every other input uses), and converts the agent's text response back into audio.

The web app (Dev 4) captures audio from the phone mic and plays back audio. Dev 5 owns the AWS infrastructure that does the heavy lifting in between.

```
User speaks into phone mic
        │
        ▼
Web App (Dev 4) captures audio chunks (MediaRecorder)
        │
        ▼
transcribe Lambda  →  Amazon Transcribe Streaming
        │  real-time transcript
        ▼
Transcribed text  →  POST /chat  →  Bedrock Agent (same as text input)
        │
        ▼
Agent text response
        │
        ▼
tts Lambda  →  Amazon Polly  →  MP3 audio stream
        │
        ▼
Web App plays audio to user
```

**You can build and test both Lambdas locally before Dev 3's infra is ready.**
**You need from Dev 3:** IAM roles with Transcribe and Polly permissions, and the API Gateway endpoint URL for Dev 4 to route audio to your Lambda.

---

## Responsibilities

1. Write the `transcribe` Lambda — starts a Transcribe Streaming session, receives audio chunks, returns real-time transcript
2. Write the `tts` Lambda — calls Amazon Polly with text, returns MP3 audio stream
3. Define the audio routing interface with Dev 4 (how the web app sends audio chunks and receives audio back)
4. Coordinate with Dev 3 to add Transcribe + Polly IAM permissions and new Lambda deployments to CDK
5. Coordinate with Dev 4 to replace browser-native `SpeechSynthesis` with Polly audio

---

## Lambda Functions

### `functions/voice/transcribe.py`

Starts an Amazon Transcribe Streaming session and feeds it audio chunks. Returns the transcript as it becomes available.

```python
import boto3, json, os
import asyncio
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent

REGION = os.environ.get('AWS_REGION', 'us-east-1')

class TranscriptHandler(TranscriptResultStreamHandler):
    def __init__(self, stream, results: list):
        super().__init__(stream)
        self.results = results

    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        results = transcript_event.transcript.results
        for result in results:
            if not result.is_partial:
                transcript = result.alternatives[0].transcript
                self.results.append(transcript)

async def transcribe_audio(audio_bytes: bytes, language_code: str = 'en-US') -> str:
    client = TranscribeStreamingClient(region=REGION)
    stream = await client.start_stream_transcription(
        language_code=language_code,
        media_sample_rate_hz=16000,
        media_encoding='pcm',
    )

    results = []
    handler = TranscriptHandler(stream.output_stream, results)

    async def write_chunks():
        chunk_size = 1024 * 8
        for i in range(0, len(audio_bytes), chunk_size):
            await stream.input_stream.send_audio_event(audio_chunk=audio_bytes[i:i+chunk_size])
        await stream.input_stream.end_stream()

    await asyncio.gather(write_chunks(), handler.handle_events())
    return ' '.join(results)

def handler(event, context):
    body = json.loads(event['body'])
    import base64
    audio_bytes = base64.b64decode(body['audioBase64'])
    language_code = body.get('languageCode', 'en-US')

    transcript = asyncio.run(transcribe_audio(audio_bytes, language_code))

    if not transcript.strip():
        return {'statusCode': 400, 'body': json.dumps({'message': 'No speech detected'})}

    return {
        'statusCode': 200,
        'body': json.dumps({'result': transcript, 'data': {'transcript': transcript}})
    }
```

Install dependency: `pip install amazon-transcribe`

### `functions/voice/tts.py`

Calls Amazon Polly to convert text to speech. Returns base64-encoded MP3.

```python
import boto3, json, os, base64

polly = boto3.client('polly', region_name=os.environ.get('AWS_REGION', 'us-east-1'))

# Voice options — swap to preference
VOICE_ID = 'Joanna'      # US English, natural
ENGINE = 'neural'         # neural engine for best quality

def handler(event, context):
    body = json.loads(event['body'])
    text = body.get('text', '')

    if not text.strip():
        return {'statusCode': 400, 'body': json.dumps({'message': 'No text provided'})}

    response = polly.synthesize_speech(
        Text=text,
        OutputFormat='mp3',
        VoiceId=VOICE_ID,
        Engine=ENGINE,
    )

    audio_bytes = response['AudioStream'].read()
    audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')

    return {
        'statusCode': 200,
        'body': json.dumps({
            'result': 'Audio synthesized',
            'data': {
                'audioBase64': audio_b64,
                'contentType': 'audio/mpeg',
            }
        })
    }
```

Available neural voices: `Joanna`, `Matthew`, `Aria`, `Amy`, `Brian`. Pick one and make it consistent across the app.

---

## Interface with Dev 4 (Web App)

Dev 4's web app handles mic capture and audio playback. Dev 5 provides the Lambda endpoints. Agree on this interface before building:

### Audio input (mic → transcript)

```typescript
// web/src/voice/VoiceInput.ts  (Dev 4 implements this)

async function recordAndTranscribe(): Promise<string> {
  // 1. Capture audio via MediaRecorder
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => chunks.push(e.data);

  await new Promise<void>(resolve => {
    recorder.onstop = () => resolve();
    recorder.start();
    setTimeout(() => recorder.stop(), 5000);  // record for up to 5s
  });

  // 2. Convert to base64 and send to Dev 5's transcribe Lambda
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const arrayBuffer = await blob.arrayBuffer();
  const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  const res = await fetch(`${REST_API_URL}/voice/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64, languageCode: 'en-US' }),
  });

  const { result } = await res.json();
  return result;   // plain text transcript → send to POST /chat
}
```

### Audio output (text → speech)

```typescript
// web/src/voice/VoiceOutput.ts  (Dev 4 implements this)

async function speakText(text: string): Promise<void> {
  const res = await fetch(`${REST_API_URL}/voice/tts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const { data } = await res.json();
  const audioBytes = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
  const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
  const audioUrl = URL.createObjectURL(audioBlob);

  const audio = new Audio(audioUrl);
  await audio.play();
}
```

This replaces Dev 4's current `SpeechSynthesis` usage with Polly audio — higher quality, consistent voice across browsers.

---

## CDK Updates (coordinate with Dev 3)

Dev 5 needs Dev 3 to add the following to `LambdaStack`:

**New Lambda functions:**

```typescript
const transcribeLambda = new lambda.Function(this, 'TranscribeLambda', {
  code: lambda.Code.fromAsset('../functions/voice'),
  handler: 'transcribe.handler',
  runtime: lambda.Runtime.PYTHON_3_12,
  role: voiceLambdaRole,
  timeout: cdk.Duration.seconds(30),
});

const ttsLambda = new lambda.Function(this, 'TtsLambda', {
  code: lambda.Code.fromAsset('../functions/voice'),
  handler: 'tts.handler',
  runtime: lambda.Runtime.PYTHON_3_12,
  role: voiceLambdaRole,
  timeout: cdk.Duration.seconds(15),
});
```

**New IAM role** (`VoiceLambdaRole`):

```typescript
const voiceLambdaRole = new iam.Role(this, 'VoiceLambdaRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
  ],
  inlinePolicies: {
    TranscribePolicy: new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: ['transcribe:StartStreamTranscription'],
        resources: ['*'],
      })],
    }),
    PollyPolicy: new iam.PolicyDocument({
      statements: [new iam.PolicyStatement({
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
      })],
    }),
  },
});
```

**New REST API routes** (add to Dev 3's `ApiStack`):

```
POST /voice/transcribe  →  transcribeLambda
POST /voice/tts         →  ttsLambda
```

Both routes should use the same Cognito JWT authorizer as `POST /chat`.

---

## File Structure

```
functions/voice/
├── transcribe.py    # Amazon Transcribe Streaming → transcript
└── tts.py           # Amazon Polly → MP3 audio
```

---

## Environment Variables

```
AWS_REGION                      # set by Lambda runtime
POLLY_VOICE_ID=Joanna           # optional override
```

No additional secrets needed — Transcribe and Polly are accessed via IAM role permissions.

---

## Needs From Others

| From | What |
|---|---|
| Dev 3 | `VoiceLambdaRole` ARN, REST API routes for `/voice/transcribe` and `/voice/tts`, deployed Lambda ARNs |
| Dev 4 | Agreement on audio interface (format, base64 encoding, endpoint shape) before either side builds |

## Provides To Others

| To | What |
|---|---|
| Dev 4 | `/voice/transcribe` and `/voice/tts` Lambda endpoint URLs; audio interface spec (see above) |
| Dev 3 | `transcribe.py` and `tts.py` Lambda code + IAM requirements for CDK |

---

## Definition of Done

- [ ] `tts.py` converts a test sentence to MP3 via Polly and returns valid base64 audio
- [ ] `transcribe.py` transcribes a 5-second test WAV recording with accurate output
- [ ] Web app (Dev 4) records mic audio, sends to `/voice/transcribe`, receives transcript, sends transcript to `POST /chat`, plays Polly audio response back — full round trip works end-to-end
- [ ] Polly audio quality confirmed on both mobile Safari and Chrome
- [ ] Both Lambdas return correct error responses (400 for empty input, 500 with `message` field for AWS errors)
