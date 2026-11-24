import { parse } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { safeHref } from "./helpers.js";
import type { Block, Doc, Inline, Mark } from "./types.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

export interface HtmlToDocOptions {
  /**
   * Drop earlier quoted conversation (blockquotes, Gmail/Outlook/Yahoo quote containers).
   * Used for replies, where only the newest text of the original is quoted.
   */
  dropQuotedHistory?: boolean;
  /** Input larger than this is cut off before parsing. Default 1 000 000 characters. */
  maxInputLength?: number;
}

/** Elements that are never content. Their whole subtree is ignored. */
const SKIP = new Set([
  "head",
  "script",
  "style",
  "title",
  "meta",
  "link",
  "noscript",
  "template",
  "svg",
  "math",
  "object",
  "embed",
  "iframe",
  "frame",
  "frameset",
  "form",
  "img",
  "picture",
  "video",
  "audio",
  "canvas",
  "input",
  "button",
  "select",
  "textarea",
  "xml",
]);

/** Elements that start and end a paragraph. */
const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "address",
  "figure",
  "figcaption",
  "pre",
  "hr",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "dl",
  "dt",
  "dd",
  "center",
]);

const MAX_DEPTH = 100;
const QUOTE_CLASS =
  /gmail_quote|yahoo_quoted|moz-cite-prefix|OutlookMessageHeader|protonmail_quote/i;
const STOP_IDS = new Set([
  "appendonsend",
  "divRplyFwdMsg",
  "mail-editor-reference-message-container",
]);

interface Ctx {
  bold: boolean;
  italic: boolean;
  href: string | undefined;
  depth: number;
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function isHidden(style: string): boolean {
  return /display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all/i.test(style);
}

/** Removes zero-width characters (used by marketing mails to hide tracking text or pad previews). */
function removeInvisible(value: string): string {
  return value
    .replaceAll("\u200b", "")
    .replaceAll("\u200c", "")
    .replaceAll("\u200d", "")
    .replaceAll("\ufeff", "");
}

class Builder {
  readonly blocks: Block[] = [];
  private inline: Inline[] = [];
  stopped = false;

  constructor(private readonly options: HtmlToDocOptions) {}

  text(value: string, ctx: Ctx): void {
    const cleaned = removeInvisible(value).replace(/\s+/g, " ");
    if (!cleaned) return;
    const marks: Mark[] = [];
    if (ctx.bold) marks.push("bold");
    if (ctx.italic) marks.push("italic");
    const node: Inline = { type: "text", text: cleaned };
    if (marks.length) node.marks = marks;
    if (ctx.href) node.href = ctx.href;
    this.inline.push(node);
  }

  lineBreak(): void {
    this.inline.push({ type: "hardBreak" });
  }

  /** Ends the current paragraph. Two or more line breaks in a row also separate paragraphs. */
  flush(kind: "paragraph" | "heading" | "quote" = "paragraph"): void {
    const normalized = normalizeInline(this.inline);
    this.inline = [];
    for (const content of splitOnDoubleBreaks(normalized)) {
      if (content.length === 0) continue;
      this.blocks.push(
        kind === "heading"
          ? { type: "heading", content }
          : kind === "quote"
            ? { type: "quote", content }
            : { type: "paragraph", content },
      );
    }
  }

  push(block: Block): void {
    this.blocks.push(block);
  }

  walkChildren(parent: { childNodes: Node[] }, ctx: Ctx): void {
    for (const child of parent.childNodes) {
      if (this.stopped) return;
      this.walk(child, ctx);
    }
  }

  walk(node: Node, ctx: Ctx): void {
    if (node.nodeName === "#text") {
      this.text((node as { value: string }).value, ctx);
      return;
    }
    if (!isElement(node)) {
      // #document, comments, doctype: only the document has children worth visiting.
      if ("childNodes" in node) this.walkChildren(node as { childNodes: Node[] }, ctx);
      return;
    }

    const tag = node.tagName;
    if (SKIP.has(tag)) return;

    const style = attr(node, "style") ?? "";
    if (isHidden(style) || attr(node, "hidden") !== undefined) return;

    const id = attr(node, "id");
    if (this.options.dropQuotedHistory) {
      if (id && STOP_IDS.has(id)) {
        this.stopped = true;
        return;
      }
      if (tag === "blockquote" || QUOTE_CLASS.test(attr(node, "class") ?? "")) return;
    }

    if (ctx.depth >= MAX_DEPTH) {
      // Pathologically deep markup: keep only its text, flat.
      this.text(collectText(node), ctx);
      return;
    }

    const next: Ctx = {
      bold:
        ctx.bold ||
        tag === "b" ||
        tag === "strong" ||
        /font-weight\s*:\s*(bold|[6-9]00)/i.test(style),
      italic: ctx.italic || tag === "i" || tag === "em" || /font-style\s*:\s*italic/i.test(style),
      href: tag === "a" ? (safeHref(attr(node, "href")) ?? ctx.href) : ctx.href,
      depth: ctx.depth + 1,
    };

    if (tag === "br") {
      this.lineBreak();
    } else if (/^h[1-6]$/.test(tag)) {
      this.flush();
      this.walkChildren(node, { ...next, bold: false });
      this.flush("heading");
    } else if (tag === "ul" || tag === "ol") {
      this.flush();
      const items = this.collectItems(node, next);
      if (items.length) {
        this.push(tag === "ul" ? { type: "bulletList", items } : { type: "orderedList", items });
      }
    } else if (tag === "blockquote") {
      this.flush();
      const inner = new Builder({ ...this.options, dropQuotedHistory: false });
      inner.walkChildren(node, next);
      inner.flush();
      const content = joinBlocksAsInline(inner.blocks);
      if (content.length) this.push({ type: "quote", content });
    } else if (BLOCK.has(tag)) {
      this.flush();
      this.walkChildren(node, next);
      this.flush();
    } else {
      this.walkChildren(node, next);
    }
  }

  private collectItems(list: Element, ctx: Ctx): Inline[][] {
    const items: Inline[][] = [];
    for (const child of list.childNodes) {
      if (!isElement(child) || child.tagName !== "li") continue;
      const inner = new Builder({ ...this.options, dropQuotedHistory: false });
      inner.walkChildren(child, ctx);
      inner.flush();
      const own: Block[] = [];
      const nested: Inline[][] = [];
      for (const block of inner.blocks) {
        if (block.type === "bulletList" || block.type === "orderedList")
          nested.push(...block.items);
        else own.push(block);
      }
      const content = joinBlocksAsInline(own);
      if (content.length) items.push(content);
      items.push(...nested);
    }
    return items;
  }
}

/** Text of a subtree, collected without recursion so hostile deep markup cannot overflow the stack. */
function collectText(node: Element): string {
  let out = "";
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.nodeName === "#text") {
      out += (current as { value: string }).value;
    } else if ("childNodes" in current) {
      const children = (current as { childNodes: Node[] }).childNodes;
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child) stack.push(child);
      }
    }
  }
  return out;
}

function joinBlocksAsInline(blocks: Block[]): Inline[] {
  const out: Inline[] = [];
  for (const block of blocks) {
    const content =
      block.type === "paragraph" || block.type === "heading" || block.type === "quote"
        ? block.content
        : block.items.flat();
    if (out.length > 0 && content.length > 0) out.push({ type: "hardBreak" });
    out.push(...content);
  }
  return out;
}

function sameStyle(a: Inline, b: Inline): boolean {
  return (
    a.type === "text" &&
    b.type === "text" &&
    (a.href ?? "") === (b.href ?? "") &&
    (a.marks ?? []).join() === (b.marks ?? []).join()
  );
}

/** Merges equal neighbours, collapses spaces, trims line edges and drops empty nodes. */
export function normalizeInline(input: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const node of input) {
    const last = merged.at(-1);
    if (last && last.type === "text" && node.type === "text" && sameStyle(last, node)) {
      last.text += node.text;
    } else {
      merged.push(node.type === "text" ? { ...node } : node);
    }
  }
  const out: Inline[] = [];
  let atLineStart = true;
  for (const node of merged) {
    if (node.type === "hardBreak") {
      const previous = out.at(-1);
      if (previous?.type === "text") previous.text = previous.text.replace(/ +$/, "");
      if (previous && previous.type === "text" && previous.text === "") out.pop();
      out.push(node);
      atLineStart = true;
      continue;
    }
    let value = node.text.replace(/ {2,}/g, " ");
    if (atLineStart) value = value.replace(/^ +/, "");
    if (value === "") continue;
    const previous = out.at(-1);
    if (previous?.type === "text" && previous.text.endsWith(" ") && value.startsWith(" ")) {
      value = value.slice(1);
      if (value === "") continue;
    }
    out.push({ ...node, text: value });
    atLineStart = false;
  }
  const last = out.at(-1);
  if (last?.type === "text") last.text = last.text.replace(/ +$/, "");
  while (out.at(-1)?.type === "hardBreak") out.pop();
  while (out.at(0)?.type === "hardBreak") out.shift();
  return out.filter((n) => n.type === "hardBreak" || n.text !== "");
}

function splitOnDoubleBreaks(content: Inline[]): Inline[][] {
  const groups: Inline[][] = [[]];
  let i = 0;
  while (i < content.length) {
    const node = content[i];
    if (node?.type === "hardBreak" && content[i + 1]?.type === "hardBreak") {
      while (content[i]?.type === "hardBreak") i++;
      groups.push([]);
      continue;
    }
    if (node) groups.at(-1)?.push(node);
    i++;
  }
  return groups.map((g) => normalizeInline(g));
}

/** Cuts oversized input, backing up to the last complete tag so no half tag turns into text. */
function cutInput(html: string, limit: number): string {
  if (html.length <= limit) return html;
  const cut = html.slice(0, limit);
  const lastTagEnd = cut.lastIndexOf(">");
  return lastTagEnd > limit * 0.9 ? cut.slice(0, lastTagEnd + 1) : cut;
}

/**
 * Converts arbitrary HTML (pasted from Word or Outlook, or received in a message) into the
 * allowed content model. Everything the model cannot express (fonts, sizes, colors, images,
 * scripts, styles, hidden text, unsafe links) is dropped. Never throws on bad markup.
 */
export function htmlToDoc(html: string, options: HtmlToDocOptions = {}): Doc {
  const limit = options.maxInputLength ?? 1_000_000;
  const document = parse(cutInput(html, limit));
  const builder = new Builder(options);
  builder.walk(document as unknown as Node, {
    bold: false,
    italic: false,
    href: undefined,
    depth: 0,
  });
  builder.flush();
  return builder.blocks;
}
