// Lightweight intent matching for spoken commands.
// Used to decide when a transcript should trigger a camera capture for product
// discovery instead of being sent to the chat agent as plain text.

const CAPTURE_PHRASES = [
  "take a picture",
  "take a photo",
  "what is this",
  "what am i looking at",
  "what's this",
  "scan this",
  "find this product",
  "look at this",
  "how is this product",
  "tell me about this",
];

/** True when the user is asking Autnio to capture and identify the product in front of the camera. */
export function isCaptureCommand(transcript: string): boolean {
  const t = transcript.toLowerCase();
  return CAPTURE_PHRASES.some((phrase) => t.includes(phrase));
}
