import { describe, expect, it } from "vitest";
import { LIMITS, sanitizeDoc } from "./sanitize-doc.js";

describe("sanitizeDoc (untrusted input)", () => {
  it("passes a valid document through unchanged", () => {
    const doc = [
      { type: "paragraph", content: [{ type: "text", text: "Ahoj", marks: ["bold"] }] },
      { type: "bulletList", items: [[{ type: "text", text: "a" }]] },
    ];
    expect(sanitizeDoc(doc)).toEqual(doc);
  });

  it("drops unknown node types and unknown properties like style or color", () => {
    const out = sanitizeDoc([
      { type: "script", content: [{ type: "text", text: "x" }] },
      {
        type: "paragraph",
        style: "font-size:40px",
        content: [
          {
            type: "text",
            text: "text",
            marks: ["bold", "underline", "color"],
            style: "color:red",
            fontSize: 40,
          },
          { type: "image", src: "http://tracker.example/x.gif" },
        ],
      },
    ]);
    expect(out).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "text", marks: ["bold"] }] },
    ]);
  });

  it("drops unsafe links", () => {
    const out = sanitizeDoc([
      { type: "paragraph", content: [{ type: "text", text: "x", href: "javascript:alert(1)" }] },
    ]);
    expect(JSON.stringify(out)).not.toContain("href");
  });

  it("returns an empty document for garbage", () => {
    for (const bad of [
      null,
      undefined,
      42,
      "text",
      {},
      [null, 1, "a", []],
      [{ type: "paragraph" }],
    ]) {
      expect(sanitizeDoc(bad)).toEqual([]);
    }
  });

  it("enforces size limits", () => {
    const huge = Array.from({ length: LIMITS.blocks + 100 }, () => ({
      type: "paragraph",
      content: [{ type: "text", text: "x".repeat(1000) }],
    }));
    const out = sanitizeDoc(huge);
    const characters = out.reduce(
      (sum, b) =>
        sum +
        (b.type === "bulletList" || b.type === "orderedList"
          ? 0
          : b.content.reduce((s, n) => s + (n.type === "text" ? n.text.length : 0), 0)),
      0,
    );
    expect(out.length).toBeLessThanOrEqual(LIMITS.blocks);
    expect(characters).toBeLessThanOrEqual(LIMITS.totalCharacters);
  });
});
