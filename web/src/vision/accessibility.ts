export const blindNavigationPrompt =
  "Guide a blind person in real time. One short sentence, max 12 words. Say only immediate obstacles, distance, direction, people, doors, stairs, hazards, and clear path.";

export function conciseVisionText(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 140) return singleLine;

  const trimmed = singleLine.slice(0, 140);
  return `${trimmed.slice(0, Math.max(trimmed.lastIndexOf(" "), 72)).trim()}.`;
}
