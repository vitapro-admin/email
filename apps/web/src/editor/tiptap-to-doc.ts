import type { Block, Doc, Inline, Mark } from "@aquapro/editor-schema";

/** Minimal shape of the editor's JSON (TipTap/ProseMirror). */
export interface EditorNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: EditorNode[];
}

function inlines(nodes: EditorNode[] | undefined): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (node.type === "text" && node.text) {
      const marks: Mark[] = [];
      let href: string | undefined;
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") marks.push("bold");
        else if (mark.type === "italic") marks.push("italic");
        else if (mark.type === "link" && typeof mark.attrs?.["href"] === "string") {
          href = mark.attrs["href"];
        }
      }
      const text: Inline = { type: "text", text: node.text };
      if (marks.length) text.marks = marks;
      if (href) text.href = href;
      out.push(text);
    }
  }
  return out;
}

/** Joins the paragraphs of a list item or quote into one line-broken run. */
function flatten(nodes: EditorNode[] | undefined): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes ?? []) {
    const content = inlines(node.content);
    if (content.length === 0) continue;
    if (out.length > 0) out.push({ type: "hardBreak" });
    out.push(...content);
  }
  return out;
}

/**
 * Converts the editor's content to the allowed email content model. Anything the model cannot
 * express is dropped here, and the server validates again, so a forged request gains nothing.
 */
export function editorToDoc(root: EditorNode): Doc {
  const doc: Doc = [];
  for (const node of root.content ?? []) {
    let block: Block | undefined;
    if (node.type === "paragraph") {
      const content = inlines(node.content);
      if (content.length) block = { type: "paragraph", content };
    } else if (node.type === "heading") {
      const content = inlines(node.content);
      if (content.length) block = { type: "heading", content };
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      const items = (node.content ?? []).map((li) => flatten(li.content)).filter((i) => i.length);
      if (items.length) block = { type: node.type, items };
    } else if (node.type === "blockquote") {
      const content = flatten(node.content);
      if (content.length) block = { type: "quote", content };
    }
    if (block) doc.push(block);
  }
  return doc;
}
