import type { Doc } from "@aquapro/editor-schema";
import { describe, expect, it } from "vitest";
import { docToEditor } from "./doc-to-editor";
import { editorToDoc } from "./tiptap-to-doc";

describe("docToEditor", () => {
  it("round-trips every kind of content", () => {
    const doc: Doc = [
      { type: "heading", content: [{ type: "text", text: "Nadpis" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Ahoj " },
          { type: "text", text: "tučné", marks: ["bold"] },
          { type: "text", text: " a " },
          { type: "text", text: "kurzíva", marks: ["italic"] },
          { type: "hardBreak" },
          { type: "text", text: "web", href: "https://aquapro.sk" },
          { type: "text", text: "obe", marks: ["bold", "italic"] },
        ],
      },
      {
        type: "bulletList",
        items: [
          [{ type: "text", text: "a" }],
          [{ type: "text", text: "b" }, { type: "hardBreak" }, { type: "text", text: "c" }],
        ],
      },
      { type: "orderedList", items: [[{ type: "text", text: "jeden" }]] },
      { type: "quote", content: [{ type: "text", text: "citát" }] },
    ];
    expect(editorToDoc(docToEditor(doc))).toEqual(doc);
  });

  it("gives an empty editor for an empty document", () => {
    expect(docToEditor([])).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(editorToDoc(docToEditor([]))).toEqual([]);
  });
});
