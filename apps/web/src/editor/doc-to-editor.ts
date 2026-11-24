import type { Doc, Inline } from "@aquapro/editor-schema";
import type { EditorNode } from "./tiptap-to-doc";

function inline(content: Inline[]): EditorNode[] {
  return content.map((node): EditorNode => {
    if (node.type === "hardBreak") return { type: "hardBreak" };
    const marks: NonNullable<EditorNode["marks"]> = [];
    if (node.marks?.includes("bold")) marks.push({ type: "bold" });
    if (node.marks?.includes("italic")) marks.push({ type: "italic" });
    if (node.href) marks.push({ type: "link", attrs: { href: node.href } });
    return { type: "text", text: node.text, ...(marks.length ? { marks } : {}) };
  });
}

/** The reverse of editorToDoc: fills the editor with a saved document (for example a draft). */
export function docToEditor(doc: Doc): EditorNode {
  if (doc.length === 0) return { type: "doc", content: [{ type: "paragraph" }] };
  return {
    type: "doc",
    content: doc.map((block): EditorNode => {
      switch (block.type) {
        case "paragraph":
          return { type: "paragraph", content: inline(block.content) };
        case "heading":
          return { type: "heading", attrs: { level: 2 }, content: inline(block.content) };
        case "bulletList":
        case "orderedList":
          return {
            type: block.type,
            content: block.items.map((item) => ({
              type: "listItem",
              content: [{ type: "paragraph", content: inline(item) }],
            })),
          };
        case "quote":
          return {
            type: "blockquote",
            content: [{ type: "paragraph", content: inline(block.content) }],
          };
      }
    }),
  };
}
