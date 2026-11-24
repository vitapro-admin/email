import { htmlToDoc, stripQuotedText, textToDoc } from "@aquapro/editor-schema";
import type { Block, Doc, Inline } from "@aquapro/editor-schema";
import type { Quote } from "./types.js";

/** The parts of a received message needed for quoting. mail-gateway's MessageDetail fits. */
export interface QuotableMessage {
  from: { name?: string; email: string };
  to?: { name?: string; email: string }[];
  date: Date;
  subject: string;
  text?: string | undefined;
  /** Untrusted HTML from the sender. Always converted through the content model. */
  html?: string | undefined;
}

/** A quoted message longer than this is shortened so one huge mail cannot bloat a reply. */
export const MAX_QUOTE_CHARACTERS = 20_000;

const TIME_ZONE = "Europe/Bratislava";

/** "19. 11. 2026 o 7:48", always in Slovak local time regardless of the server's time zone. */
export function formatDateSk(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const plainNumber = (type: string): string => String(Number(get(type)));
  return `${plainNumber("day")}. ${plainNumber("month")}. ${get("year")} o ${plainNumber("hour")}:${get("minute")}`;
}

function personLabel(person: { name?: string; email: string }): string {
  return person.name ? `${person.name} <${person.email}>` : person.email;
}

const CUT_NOTICE: Block = {
  type: "paragraph",
  content: [{ type: "text", text: "… (správa skrátená)" }],
};

/** Takes inline content up to a character budget, cutting the last text at a word boundary. */
function takeInline(
  content: Inline[],
  budget: number,
): { out: Inline[]; used: number; cut: boolean } {
  const out: Inline[] = [];
  let used = 0;
  for (const node of content) {
    if (node.type === "hardBreak") {
      if (used + 1 > budget) return { out, used, cut: true };
      out.push(node);
      used += 1;
      continue;
    }
    if (used + node.text.length <= budget) {
      out.push(node);
      used += node.text.length;
      continue;
    }
    const room = budget - used;
    if (room > 0) {
      const slice = node.text.slice(0, room);
      const space = slice.lastIndexOf(" ");
      const text = (space > room * 0.5 ? slice.slice(0, space) : slice).trimEnd();
      if (text) {
        out.push({ ...node, text });
        used += text.length;
      }
    }
    return { out, used, cut: true };
  }
  return { out, used, cut: false };
}

/** Keeps the document up to a character budget (also inside one huge paragraph), then adds a notice. */
function truncateDoc(doc: Doc, maxCharacters: number): Doc {
  const out: Doc = [];
  let used = 0;
  for (const block of doc) {
    const remaining = maxCharacters - used;
    if (block.type === "bulletList" || block.type === "orderedList") {
      const items: Inline[][] = [];
      let cut = false;
      for (const item of block.items) {
        const taken = takeInline(item, maxCharacters - used);
        if (taken.out.length) items.push(taken.out);
        used += taken.used;
        if (taken.cut) {
          cut = true;
          break;
        }
      }
      if (items.length) out.push({ type: block.type, items });
      if (cut) return [...out, CUT_NOTICE];
    } else {
      const taken = takeInline(block.content, remaining);
      if (taken.out.length) out.push({ ...block, content: taken.out });
      used += taken.used;
      if (taken.cut) return [...out, CUT_NOTICE];
    }
  }
  return out;
}

function bodyOf(message: QuotableMessage, dropHistory: boolean): Doc {
  const doc = message.html
    ? htmlToDoc(message.html, { dropQuotedHistory: dropHistory })
    : textToDoc(dropHistory ? stripQuotedText(message.text ?? "") : (message.text ?? ""));
  return truncateDoc(doc, MAX_QUOTE_CHARACTERS);
}

/** Quote for a reply: only the newest text of the original, older history is dropped. */
export function quoteForReply(message: QuotableMessage): Quote {
  return {
    kind: "reply",
    headerLines: [`Dňa ${formatDateSk(message.date)} ${personLabel(message.from)} napísal(a):`],
    body: bodyOf(message, true),
  };
}

/** Quote for a forward: the whole original including its own earlier history (as quote blocks). */
export function quoteForForward(message: QuotableMessage): Quote {
  const headerLines = [
    `Od: ${personLabel(message.from)}`,
    `Dátum: ${formatDateSk(message.date)}`,
    `Predmet: ${message.subject}`,
  ];
  if (message.to?.length) headerLines.push(`Komu: ${message.to.map(personLabel).join(", ")}`);
  return { kind: "forward", headerLines, body: bodyOf(message, false) };
}

/**
 * Subject for a reply or forward. Removes any existing reply/forward prefix (Re, RE, Odp, Fw, FW,
 * Fwd, Pred) so prefixes never pile up, then adds exactly one.
 */
export function prefixSubject(subject: string, kind: "reply" | "forward"): string {
  const base = subject.replace(/^\s*((re|odp|fw|fwd|pred|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
  return `${kind === "reply" ? "Re" : "Fwd"}: ${base}`;
}
