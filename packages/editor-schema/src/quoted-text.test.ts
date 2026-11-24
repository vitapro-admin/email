import { describe, expect, it } from "vitest";
import { stripQuotedText } from "./quoted-text.js";

describe("stripQuotedText", () => {
  it("cuts at a Slovak reply header", () => {
    const text =
      "Súhlasím.\n\nDňa 19. 11. 2026 o 7:48 Jana <j@x.sk> napísal(a):\n> pôvodná\n> správa";
    expect(stripQuotedText(text)).toBe("Súhlasím.");
  });

  it("cuts at an English reply header and at Original Message", () => {
    expect(stripQuotedText("OK\n\nOn Mon, 19 Nov 2026, Jana wrote:\n> x")).toBe("OK");
    expect(stripQuotedText("OK\n\n-----Original Message-----\nFrom: x")).toBe("OK");
  });

  it("cuts at lines starting with >", () => {
    expect(stripQuotedText("Odpoveď\n> citát\n> ďalší")).toBe("Odpoveď");
  });

  it("cuts at an Outlook header block but keeps a normal line starting with Od:", () => {
    expect(
      stripQuotedText("Hotovo\n\nOd: Jana\nOdoslané: 19. 11.\nKomu: ja\nPredmet: x\n\ntext"),
    ).toBe("Hotovo");
    expect(stripQuotedText("Od: tohto týždňa platí nový cenník.\nĎakujem")).toBe(
      "Od: tohto týždňa platí nový cenník.\nĎakujem",
    );
  });

  it("returns text unchanged when nothing is quoted", () => {
    expect(stripQuotedText("Dobrý deň,\n\nvšetko v poriadku.")).toBe(
      "Dobrý deň,\n\nvšetko v poriadku.",
    );
  });
});
