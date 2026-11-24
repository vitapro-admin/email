import { describe, expect, it } from "vitest";
import { docToPlainText, paragraph, safeHref, text, textToDoc } from "./helpers.js";

describe("textToDoc", () => {
  it("splits paragraphs on blank lines and keeps single newlines as line breaks", () => {
    const doc = textToDoc("Dobrý deň,\n\nprvý riadok\ndruhý riadok\n\n\nPozdrav");
    expect(doc).toHaveLength(3);
    expect(doc[1]).toEqual({
      type: "paragraph",
      content: [text("prvý riadok"), { type: "hardBreak" }, text("druhý riadok")],
    });
  });

  it("ignores empty input", () => {
    expect(textToDoc("  \n\n ")).toEqual([]);
  });
});

describe("docToPlainText", () => {
  it("renders lists, headings, links and quotes", () => {
    const out = docToPlainText([
      { type: "heading", content: [text("Nadpis")] },
      paragraph("Pozri ", text("web", { href: "https://aquapro.example" })),
      { type: "bulletList", items: [[text("jedna")], [text("dva")]] },
      { type: "orderedList", items: [[text("a")], [text("b")]] },
      { type: "quote", content: [text("citát")] },
    ]);
    expect(out).toBe(
      "NADPIS\n\nPozri web (https://aquapro.example)\n\n- jedna\n- dva\n\n1. a\n2. b\n\n> citát",
    );
  });
});

describe("safeHref", () => {
  it("allows http, https, mailto and tel only", () => {
    expect(safeHref("https://aquapro.example")).toBe("https://aquapro.example");
    expect(safeHref("mailto:a@b.sk")).toBe("mailto:a@b.sk");
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref(" JavaScript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });

  it("never prints an unsafe link into the plain text", () => {
    const out = docToPlainText([paragraph(text("klikni", { href: "javascript:alert(1)" }))]);
    expect(out).toBe("klikni");
  });
});
