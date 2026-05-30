// Dev 5 — implement this handler
// Converts agent text response to MP3 audio via Amazon Polly (neural engine).
// The browser decodes the base64 MP3 and plays it to the user.
//
// Switch to Python 3.12 runtime when implementing.
//
// Expected input:
//   { text: string }
//
// Returns:
//   { statusCode: 200, body: { result: "Audio synthesized", data: { audioBase64, contentType: "audio/mpeg" } } }
//   { statusCode: 400, body: { message: "No text provided" } }
//
// Env vars: AWS_REGION (set by Lambda runtime), POLLY_VOICE_ID (optional, default Joanna)
// IAM: polly:SynthesizeSpeech granted via VoiceLambdaRole in FunctionsStack

exports.handler = async (event) => {
  throw new Error('Not implemented — Dev 5 owns this function');
};
