import { describe, expect, it } from "vitest";
import { docToPlainText } from "./helpers.js";
import { htmlToDoc } from "./html-to-doc.js";

const plain = (html: string, options = {}) => docToPlainText(htmlToDoc(html, options));

describe("htmlToDoc: formatting", () => {
  it("keeps bold, italic and safe links, drops everything else", () => {
    const doc = htmlToDoc(
      '<p>Ahoj <b>tučné</b> a <i>kurzíva</i> <a href="https://aquapro.example">web</a></p>',
    );
    expect(doc).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Ahoj " },
          { type: "text", text: "tučné", marks: ["bold"] },
          { type: "text", text: " a " },
          { type: "text", text: "kurzíva", marks: ["italic"] },
          { type: "text", text: " " },
          { type: "text", text: "web", href: "https://aquapro.example" },
        ],
      },
    ]);
  });

  it("understands bold and italic given by CSS (Word and Outlook style)", () => {
    const doc = htmlToDoc(
      '<p><span style="font-weight:bold;font-family:Calibri;font-size:11pt;color:red">A</span><span style="font-style:italic">B</span></p>',
    );
    expect(doc).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A", marks: ["bold"] },
          { type: "text", text: "B", marks: ["italic"] },
        ],
      },
    ]);
  });

  it("never carries fonts, sizes or colors into the model", () => {
    const json = JSON.stringify(
      htmlToDoc(
        '<p style="font-family:Comic Sans;color:#f00;font-size:40px;text-align:center">Text</p>',
      ),
    );
    expect(json).not.toMatch(/font|color|size|align|style/i);
  });

  it("converts headings of any level to the single heading type", () => {
    expect(htmlToDoc("<h1>Jedna</h1><h4>Štyri</h4>")).toEqual([
      { type: "heading", content: [{ type: "text", text: "Jedna" }] },
      { type: "heading", content: [{ type: "text", text: "Štyri" }] },
    ]);
  });

  it("converts lists and flattens nested lists", () => {
    const doc = htmlToDoc(
      "<ul><li>jedna<ul><li>pod-jedna</li></ul></li><li>dva</li></ul><ol><li>x</li></ol>",
    );
    expect(docToPlainText(doc)).toBe("- jedna\n- pod-jedna\n- dva\n\n1. x");
  });

  it("turns blockquote into a quote block", () => {
    const doc = htmlToDoc("<p>Odpoveď</p><blockquote><p>Pôvodné</p><p>riadky</p></blockquote>");
    expect(doc[1]).toEqual({
      type: "quote",
      content: [
        { type: "text", text: "Pôvodné" },
        { type: "hardBreak" },
        { type: "text", text: "riadky" },
      ],
    });
  });
});

describe("htmlToDoc: cleaning", () => {
  it("drops scripts, styles, head, images, forms and event handlers", () => {
    const out = plain(
      '<html><head><title>T</title><style>p{color:red}</style></head><body onload="x()"><script>alert(1)</script><p onclick="x()">Text</p><img src="http://tracker.example/p.gif"><form><input value="x"></form></body></html>',
    );
    expect(out).toBe("Text");
  });

  it("removes unsafe links but keeps the visible text", () => {
    const doc = htmlToDoc(
      '<a href="javascript:alert(1)">klikni</a> <a href="data:text/html,x">data</a>',
    );
    expect(JSON.stringify(doc)).not.toMatch(/javascript|data:|href/);
    expect(docToPlainText(doc)).toBe("klikni data");
  });

  it("drops hidden text (preheaders, display:none, mso-hide)", () => {
    const out = plain(
      '<div style="display:none">skryté</div><div style="mso-hide:all">skryté2</div><p>viditeľné</p>',
    );
    expect(out).toBe("viditeľné");
  });

  it("cleans Word/Outlook markup (conditional comments, o:p, nbsp, MsoNormal)", () => {
    const out = plain(
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--[if gte mso 9]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]--><p class=MsoNormal><span style="mso-bidi-font-size:11pt">Dobrý&nbsp;deň,<o:p></o:p></span></p><p class=MsoNormal><o:p>&nbsp;</o:p></p><p class=MsoNormal>Ďakujem<o:p></o:p></p></body></html>',
    );
    expect(out).toBe("Dobrý deň,\n\nĎakujem");
  });

  it("treats two line breaks as a paragraph break and trims edges", () => {
    const doc = htmlToDoc("<div> <br>  prvý<br><br><br>druhý  <br> </div>");
    expect(docToPlainText(doc)).toBe("prvý\n\ndruhý");
  });

  it("flattens tables into paragraphs", () => {
    const out = plain(
      "<table><tr><td>Bunka A</td><td>Bunka B</td></tr><tr><td>Druhý riadok</td></tr></table>",
    );
    expect(out).toBe("Bunka A\n\nBunka B\n\nDruhý riadok");
  });

  it("survives broken and extremely deep markup without throwing", () => {
    expect(() => htmlToDoc("<p><b>neuzavreté <i>tagy <a href=")).not.toThrow();
    const deep = "<div>".repeat(5000) + "hlboko" + "</div>".repeat(5000);
    expect(plain(deep)).toBe("hlboko");
  });

  it("handles 100 000 nested elements quickly and without stray characters", () => {
    const html = "<div>".repeat(100_000) + "x" + "</div>".repeat(100_000);
    const started = Date.now();
    expect(plain(html)).toBe("x");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("returns an empty document for empty input", () => {
    expect(htmlToDoc("")).toEqual([]);
    expect(htmlToDoc("<div> </div>")).toEqual([]);
  });

  it("cuts oversized input", () => {
    const doc = htmlToDoc("<p>" + "a".repeat(5000) + "</p>", { maxInputLength: 100 });
    expect(docToPlainText(doc).length).toBeLessThan(120);
  });
});

describe("htmlToDoc: dropQuotedHistory", () => {
  it("drops Gmail quotes", () => {
    const html =
      '<div>Nová odpoveď</div><div class="gmail_quote"><div class="gmail_attr">Dňa ... napísal(a):</div><blockquote class="gmail_quote"><div>Staršia správa</div></blockquote></div>';
    expect(plain(html, { dropQuotedHistory: true })).toBe("Nová odpoveď");
    expect(plain(html)).toContain("Staršia správa");
  });

  it("stops at the Outlook reply separator", () => {
    const html =
      '<div>Moja odpoveď</div><div id="appendonsend"></div><hr><div id="divRplyFwdMsg"><b>Od:</b> Jana</div><div>Staršia správa</div>';
    expect(plain(html, { dropQuotedHistory: true })).toBe("Moja odpoveď");
  });
});
