/**
 * Plain-text messages: cuts off earlier quoted conversation so a reply quotes only the newest text.
 * Recognizes common Slovak/Czech/English reply headers, "Original Message" separators and
 * lines starting with ">".
 */
const REPLY_HEADERS = [
  /^(dňa|dna|on)\s.+(napísal|napísala|napísal\(a\)|wrote|napsal|napsala)\b.*:?\s*$/i,
  /^-{2,}\s*(original message|pôvodná správa|původní zpráva|forwarded message|preposlaná správa)\s*-{2,}\s*$/i,
  /^(od|from):\s.+$/i,
];

export function stripQuotedText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    if (/^>/.test(line.trim())) break;
    if (REPLY_HEADERS[0]?.test(line.trim()) || REPLY_HEADERS[1]?.test(line.trim())) break;
    // "From: ..." only counts as a header when followed by another header-like line.
    if (
      REPLY_HEADERS[2]?.test(line.trim()) &&
      /^(odoslané|sent|dátum|date|komu|to|predmet|subject):/i.test(next.trim())
    ) {
      break;
    }
    kept.push(line);
  }
  return kept.join("\n").trim();
}
