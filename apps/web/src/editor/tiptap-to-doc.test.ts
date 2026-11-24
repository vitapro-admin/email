import { describe, expect, it } from "vitest";
import { editorToDoc } from "./tiptap-to-doc";

const t = (text: string, marks: { type: string; attrs?: Record<string, unknown> }[] = []) => ({
  type: "text",
  text,
  ...(marks.length ? { marks } : {}),
});

describe("editorToDoc", () => {
  it("maps paragraphs with bold, italic and links", () => {
    const doc = editorToDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            t("Ahoj "),
            t("tučné", [{ type: "bold" }]),
            t(" ", []),
            t("web", [{ type: "link", attrs: { href: "https://aquapro.example" } }]),
          ],
        },
      ],
    });
    expect(doc).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Ahoj " },
          { type: "text", text: "tučné", marks: ["bold"] },
          { type: "text", text: " " },
          { type: "text", text: "web", href: "https://aquapro.example" },
        ],
      },
    ]);
  });

  it("maps headings, lists and quotes and drops empty blocks", () => {
    const doc = editorToDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [t("Nadpis")] },
        { type: "paragraph" },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [t("a")] }] },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [t("b")] },
                { type: "paragraph", content: [t("c")] },
              ],
            },
          ],
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [t("citát")] }] },
      ],
    });
    expect(doc).toEqual([
      { type: "heading", content: [{ type: "text", text: "Nadpis" }] },
      {
        type: "bulletList",
        items: [
          [{ type: "text", text: "a" }],
          [{ type: "text", text: "b" }, { type: "hardBreak" }, { type: "text", text: "c" }],
        ],
      },
      { type: "quote", content: [{ type: "text", text: "citát" }] },
    ]);
  });

  it("drops anything outside the model (code blocks, images, unknown marks)", () => {
    const doc = editorToDoc({
      type: "doc",
      content: [
        { type: "codeBlock", content: [t("x")] },
        { type: "image", attrs: { src: "http://tracker.example/x.gif" } },
        {
          type: "paragraph",
          content: [
            t("text", [{ type: "textStyle", attrs: { color: "red" } }, { type: "underline" }]),
          ],
        },
      ],
    });
    expect(JSON.stringify(doc)).not.toMatch(/color|underline|code|image|tracker/);
    expect(doc).toEqual([{ type: "paragraph", content: [{ type: "text", text: "text" }] }]);
  });

  it("returns an empty document for an empty editor", () => {
    expect(editorToDoc({ type: "doc", content: [{ type: "paragraph" }] })).toEqual([]);
    expect(editorToDoc({})).toEqual([]);
  });
});
