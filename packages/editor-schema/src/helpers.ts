import type { Block, Doc, Inline, Mark } from "./types.js";

/** Builds a text node. */
export function text(value: string, options: { marks?: Mark[]; href?: string } = {}): Inline {
  const node: Inline = { type: "text", text: value };
  if (options.marks?.length) node.marks = options.marks;
  if (options.href) node.href = options.href;
  return node;
}

export function paragraph(...content: (Inline | string)[]): Block {
  return { type: "paragraph", content: content.map((c) => (typeof c === "string" ? text(c) : c)) };
}

/** Turns plain text into paragraphs (blank line = new paragraph, single newline = line break). */
export function textToDoc(value: string): Doc {
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const content: Inline[] = [];
      chunk.split("\n").forEach((line, index) => {
        if (index > 0) content.push({ type: "hardBreak" });
        content.push(text(line));
      });
      return { type: "paragraph", content } satisfies Block;
    });
}

/** Only these link types may appear in an email. Everything else is treated as plain text. */
export function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(trimmed) ? trimmed : undefined;
}

function inlineToText(content: Inline[]): string {
  return content
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      const href = safeHref(node.href);
      return href && href !== node.text ? `${node.text} (${href})` : node.text;
    })
    .join("");
}

/** Plain-text version of a document, used as the text/plain part of every email. */
export function docToPlainText(doc: Doc): string {
  return doc
    .map((block) => {
      switch (block.type) {
        case "paragraph":
          return inlineToText(block.content);
        case "heading":
          return inlineToText(block.content).toUpperCase();
        case "bulletList":
          return block.items.map((item) => `- ${inlineToText(item)}`).join("\n");
        case "orderedList":
          return block.items.map((item, i) => `${i + 1}. ${inlineToText(item)}`).join("\n");
        case "quote":
          return inlineToText(block.content)
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
      }
    })
    .join("\n\n");
}
