// Dev 5 — implement this handler
// Receives base64-encoded audio from the browser (MediaRecorder WebM chunks),
// streams it through Amazon Transcribe Streaming, and returns the transcript.
//
// Switch to Python 3.12 runtime when implementing — use amazon-transcribe SDK:
//   pip install amazon-transcribe
//
// Expected input:
//   { audioBase64: string, languageCode?: string }  (default en-US)
//
// Returns:
//   { statusCode: 200, body: { result: <transcript text>, data: { transcript } } }
//   { statusCode: 400, body: { message: "No speech detected" } }
//
// Env vars: AWS_REGION (set by Lambda runtime)
// IAM: transcribe:StartStreamTranscription granted via VoiceLambdaRole in FunctionsStack

exports.handler = async (event) => {
  throw new Error('Not implemented — Dev 5 owns this function');
};
