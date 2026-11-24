import { docToPlainText } from "@aquapro/editor-schema";
import { describe, expect, it } from "vitest";
import {
  MAX_QUOTE_CHARACTERS,
  formatDateSk,
  prefixSubject,
  quoteForForward,
  quoteForReply,
} from "./quote.js";
import type { QuotableMessage } from "./quote.js";

const message: QuotableMessage = {
  from: { name: "Jana Horváthová", email: "j.horvathova@hotelpanorama.example" },
  to: [{ email: "podpora@aquapro.example" }],
  date: new Date("2026-11-19T06:48:00Z"),
  subject: "Reklamácia dodávky",
  text: "Dobrý deň,\n\nzakalená voda.\n\nDňa 17. 11. 2026 napísal(a) Ivana:\n> Dodávka vykonaná.",
};

describe("formatDateSk", () => {
  it("uses Slovak local time regardless of server zone", () => {
    expect(formatDateSk(new Date("2026-11-19T06:48:00Z"))).toBe("19. 11. 2026 o 7:48");
    expect(formatDateSk(new Date("2026-07-01T10:05:00Z"))).toBe("1. 7. 2026 o 12:05");
  });
});

describe("quoteForReply", () => {
  it("builds a header and quotes only the newest text of a plain message", () => {
    const quote = quoteForReply(message);
    expect(quote.kind).toBe("reply");
    expect(quote.headerLines).toEqual([
      "Dňa 19. 11. 2026 o 7:48 Jana Horváthová <j.horvathova@hotelpanorama.example> napísal(a):",
    ]);
    expect(docToPlainText(quote.body)).toBe("Dobrý deň,\n\nzakalená voda.");
  });

  it("converts HTML through the content model and drops earlier history", () => {
    const quote = quoteForReply({
      ...message,
      text: undefined,
      html: '<div style="font-family:Comic Sans;color:red">Nová správa <b>tučne</b></div><div class="gmail_quote"><blockquote>Staršia</blockquote></div><script>alert(1)</script>',
    });
    expect(docToPlainText(quote.body)).toBe("Nová správa tučne");
    expect(JSON.stringify(quote.body)).not.toMatch(/font|color|script|Staršia/);
  });

  it("shortens a huge message", () => {
    const quote = quoteForReply({ ...message, text: "slovo ".repeat(10_000).trim() });
    expect(docToPlainText(quote.body).length).toBeLessThan(MAX_QUOTE_CHARACTERS + 100);
  });
});

describe("quoteForForward", () => {
  it("builds From/Date/Subject/To lines and keeps older history as quote blocks", () => {
    const quote = quoteForForward({
      ...message,
      text: undefined,
      html: "<p>Aktuálna</p><blockquote>Staršia správa</blockquote>",
    });
    expect(quote.kind).toBe("forward");
    expect(quote.headerLines).toEqual([
      "Od: Jana Horváthová <j.horvathova@hotelpanorama.example>",
      "Dátum: 19. 11. 2026 o 7:48",
      "Predmet: Reklamácia dodávky",
      "Komu: podpora@aquapro.example",
    ]);
    expect(quote.body.map((b) => b.type)).toEqual(["paragraph", "quote"]);
  });
});

describe("prefixSubject", () => {
  it.each([
    ["Reklamácia", "reply", "Re: Reklamácia"],
    ["Re: Reklamácia", "reply", "Re: Reklamácia"],
    ["RE: Re: Odp: Reklamácia", "reply", "Re: Reklamácia"],
    ["Reklamácia", "forward", "Fwd: Reklamácia"],
    ["FW: Re: Reklamácia", "forward", "Fwd: Reklamácia"],
    ["Re[2]: Reklamácia", "reply", "Re: Reklamácia"],
    ["Reakcia na ponuku", "reply", "Re: Reakcia na ponuku"],
  ] as const)("%s (%s) -> %s", (subject, kind, expected) => {
    expect(prefixSubject(subject, kind)).toBe(expected);
  });
});
