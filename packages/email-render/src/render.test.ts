import { paragraph, text, textToDoc } from "@aquapro/editor-schema";
import { describe, expect, it } from "vitest";
import { renderEmail } from "./render.js";
import type { RenderInput } from "./types.js";

const LOGO = "https://example.test/logo.png";

function input(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    subject: "Test",
    body: textToDoc("Dobrý deň,\n\nďakujeme za správu."),
    sender: {
      name: "Ivana K.",
      role: "Podpora obchodu",
      phone: "+421 900 000 201",
      email: "ivana@aquapro.test",
    },
    company: { name: "AQUA PRO EUROPE", legalLine: "Modelový text päty." },
    logoUrl: LOGO,
    ...overrides,
  };
}

describe("renderEmail", () => {
  it("produces HTML with the logo once and a plain-text alternative", async () => {
    const out = await renderEmail(input());
    expect(out.html.split(LOGO)).toHaveLength(2); // exactly one occurrence
    expect(out.html).toContain("ďakujeme za správu");
    expect(out.text).toContain("ďakujeme za správu");
    expect(out.text).toContain("Ivana K.");
  });

  it("shows the landline in the signature when the profile has one", async () => {
    const withLine = await renderEmail(
      input({
        sender: {
          name: "Ivana K.",
          role: "Podpora obchodu",
          phone: "+421 900 000 201",
          landline: "055 123 456",
          email: "ivana@aquapro.test",
        },
      }),
    );
    expect(withLine.html).toContain("055 123 456");
    expect(withLine.text).toContain("+421 900 000 201 | 055 123 456 | ivana@aquapro.test");
    const without = await renderEmail(input());
    expect(without.text).not.toContain("055");
  });

  it("escapes user content", async () => {
    const out = await renderEmail(
      input({ body: [paragraph('<script>alert("x")</script> & <img src=x onerror=1>')] }),
    );
    expect(out.html).not.toContain("<script>alert");
    expect(out.html).not.toContain("<img src=x");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("drops unsafe links but keeps the text", async () => {
    const out = await renderEmail(
      input({
        body: [
          paragraph(
            text("klikni", { href: "javascript:alert(1)" }),
            " a ",
            text("web", { href: "https://aquapro.example" }),
          ),
        ],
      }),
    );
    expect(out.html).not.toContain("javascript:");
    expect(out.html).toContain("klikni");
    expect(out.html).toContain('href="https://aquapro.example"');
  });

  it("renders facts and a title for templates", async () => {
    const out = await renderEmail(
      input({
        title: "Potvrdenie dodávky",
        facts: [{ label: "Termín", value: "štvrtok 19. 11." }],
      }),
    );
    expect(out.html).toContain("Potvrdenie dodávky");
    expect(out.html).toContain("štvrtok 19. 11.");
    expect(out.text).toContain("Termín: štvrtok 19. 11.");
  });

  it("keeps the logo single when a quote is present and quotes it in plain text", async () => {
    const out = await renderEmail(
      input({
        quote: {
          kind: "reply",
          headerLines: ["Dňa 20. 11. 2026 napísal(a) Jana:"],
          body: textToDoc("Pôvodná správa."),
        },
      }),
    );
    expect(out.html.split(LOGO)).toHaveLength(2);
    expect(out.html).toContain("Pôvodná správa.");
    expect(out.text).toContain("> Dňa 20. 11. 2026 napísal(a) Jana:");
    expect(out.text).toContain("> Pôvodná správa.");
  });

  it("marks forwarded messages", async () => {
    const out = await renderEmail(
      input({
        quote: {
          kind: "forward",
          headerLines: ["Od: Jana", "Predmet: Test"],
          body: textToDoc("Obsah."),
        },
      }),
    );
    expect(out.html).toContain("Preposlaná správa");
    expect(out.text).toContain("> Preposlaná správa");
  });
});

describe("header layout", () => {
  it("puts the title in the header next to the logo, right aligned, before the body", async () => {
    const out = await renderEmail(input({ title: "Potvrdenie dodávky" }));
    const logoAt = out.html.indexOf(LOGO);
    const titleAt = out.html.indexOf("Potvrdenie dodávky", logoAt);
    const bodyAt = out.html.indexOf("ďakujeme za správu", logoAt);
    expect(logoAt).toBeGreaterThan(-1);
    expect(titleAt).toBeGreaterThan(logoAt);
    expect(titleAt).toBeLessThan(bodyAt);
    expect(out.html.slice(logoAt, titleAt)).toContain("text-align:right");
  });

  it("shows only the logo when there is no title", async () => {
    const out = await renderEmail(input());
    expect(out.html).not.toContain("text-align:right;");
  });
});

describe("mobile behaviour", () => {
  it("keeps a short title beside the logo on phones", async () => {
    const out = await renderEmail(input({ title: "Krátky nadpis" }));
    expect(out.html).not.toMatch(/mj-outlook-group-fix hdr-long/);
  });

  it("lets a long title drop under the logo on phones", async () => {
    const out = await renderEmail(
      input({ title: "Potvrdenie dodávky vody pre Hotel Panoráma v Poprade" }),
    );
    expect(out.html).toMatch(/mj-outlook-group-fix hdr-long/);
  });

  it("ships the phone media query and wraps long words", async () => {
    const out = await renderEmail(input({ body: [paragraph("x".repeat(200))] }));
    expect(out.html).toContain("max-width:479px");
    expect(out.html).toContain("overflow-wrap:anywhere");
  });
});
