import type { Address } from "@aquapro/mail-gateway";

/** Parses "a@b.sk, Jana <j@x.sk>; \"Novák, Ján\" <n@y.sk>" into addresses. Validation happens later. */
export function parseAddressList(input: string): Address[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angle = false;
  for (const char of input) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === "<") angle = true;
    else if (!quoted && char === ">") angle = false;
    if (!quoted && !angle && (char === "," || char === ";")) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);

  const result: Address[] = [];
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    const match = /^(.*?)<\s*([^<>]+?)\s*>$/.exec(raw);
    if (match) {
      const name = (match[1] ?? "").trim().replace(/^"|"$/g, "").trim();
      result.push({ ...(name ? { name } : {}), email: (match[2] ?? "").trim() });
    } else {
      result.push({ email: raw });
    }
  }
  return result;
}

export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
