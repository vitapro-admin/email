import { describe, expect, it } from "vitest";
import { normalizeLink } from "./link";

describe("normalizeLink", () => {
  it.each([
    ["https://aquapro.sk", "https://aquapro.sk"],
    ["aquapro.sk/cennik", "https://aquapro.sk/cennik"],
    ["www.aquapro.sk", "https://www.aquapro.sk"],
    ["jana@hotel.sk", "mailto:jana@hotel.sk"],
    ["tel:+421900000000", "tel:+421900000000"],
    ["  https://aquapro.sk  ", "https://aquapro.sk"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeLink(input)).toBe(expected);
  });

  it.each([
    "",
    "  ",
    "javascript:alert(1)",
    "data:text/html,x",
    "nie je adresa",
    "ftp://x.sk",
    "//evil.example",
  ])("rejects %j", (input) => {
    expect(normalizeLink(input)).toBeNull();
  });
});
