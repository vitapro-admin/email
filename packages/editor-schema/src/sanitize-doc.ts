import { safeHref } from "./helpers.js";
import type { Block, Doc, Inline, Mark } from "./types.js";

export const LIMITS = {
  blocks: 500,
  inlinePerBlock: 2_000,
  listItems: 200,
  textLength: 20_000,
  totalCharacters: 200_000,
} as const;

const MARKS: readonly Mark[] = ["bold", "italic"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inlines(value: unknown, budget: { left: number }): Inline[] {
  if (!Array.isArray(value)) return [];
  const out: Inline[] = [];
  for (const raw of value.slice(0, LIMITS.inlinePerBlock)) {
    if (!isRecord(raw)) continue;
    if (raw["type"] === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (raw["type"] === "text" && typeof raw["text"] === "string") {
      const text = raw["text"].slice(0, Math.min(LIMITS.textLength, Math.max(0, budget.left)));
      if (text === "") continue;
      budget.left -= text.length;
      const node: Inline = { type: "text", text };
      const marks = Array.isArray(raw["marks"])
        ? MARKS.filter((m) => (raw["marks"] as unknown[]).includes(m))
        : [];
      if (marks.length) node.marks = marks;
      const href = typeof raw["href"] === "string" ? safeHref(raw["href"]) : undefined;
      if (href) node.href = href;
      out.push(node);
    }
  }
  return out;
}

/**
 * Coerces UNTRUSTED data (for example JSON sent by a browser) into a valid Doc.
 * Unknown node types, unknown marks and unsafe links are dropped and size limits are enforced,
 * so whatever arrives, only content the design allows can ever reach the renderer.
 */
export function sanitizeDoc(input: unknown): Doc {
  if (!Array.isArray(input)) return [];
  const budget = { left: LIMITS.totalCharacters };
  const doc: Doc = [];
  for (const raw of input.slice(0, LIMITS.blocks)) {
    if (!isRecord(raw)) continue;
    const type = raw["type"];
    let block: Block | undefined;
    if (type === "paragraph" || type === "heading" || type === "quote") {
      const content = inlines(raw["content"], budget);
      if (content.length) block = { type, content };
    } else if (type === "bulletList" || type === "orderedList") {
      const items = Array.isArray(raw["items"])
        ? raw["items"]
            .slice(0, LIMITS.listItems)
            .map((item) => inlines(item, budget))
            .filter((item) => item.length > 0)
        : [];
      if (items.length) block = { type, items };
    }
    if (block) doc.push(block);
    if (budget.left <= 0) break;
  }
  return doc;
}
