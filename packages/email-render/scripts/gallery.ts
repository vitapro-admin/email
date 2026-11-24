/**
 * Generates a single self-contained HTML gallery of sample emails (both layout variants),
 * so the design can be reviewed in a browser. Output: gallery/galeria.html
 * Run: pnpm --filter @aquapro/email-render gallery
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { paragraph, text, textToDoc } from "@aquapro/editor-schema";
import type { Doc } from "@aquapro/editor-schema";
import { escapeHtml, renderEmail } from "../src/index.js";
import type { RenderInput } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const logo = `data:image/png;base64,${readFileSync(join(here, "../assets/logo.png")).toString("base64")}`;

const sender = {
  name: "Ivana K.",
  role: "Podpora obchodu",
  phone: "+421 900 000 201",
  email: "ivana.k@aquapro.test",
};
const company = {
  name: "AQUA PRO EUROPE",
  legalLine: "Modelový text päty. Právne údaje a odhlásenie doplní firma.",
};

interface Scenario {
  id: string;
  title: string;
  note: string;
  input: Omit<RenderInput, "logoUrl" | "sender" | "company">;
}

const originalMessage: Doc = textToDoc(
  "Dobrý deň,\n\ndve fľaše z poslednej dodávky majú zakalenú vodu. Prosíme o výmenu a stanovisko.\n\nĎakujem,\nJana Horváthová\nHotel Panoráma",
);

const scenarios: Scenario[] = [
  {
    id: "sablona",
    title: "1. Šablóna: potvrdenie dodávky",
    note: "Typ správy z CRM, nadpis a tabuľka údajov (polia z CRM).",
    input: {
      subject: "Potvrdenie dodávky vody",
      title: "Potvrdenie dodávky vody",
      body: [
        paragraph("Dobrý deň, pani Horváthová,"),
        paragraph(
          "potvrdzujeme Vašu dodávku vody v nasledujúcom termíne. Prosíme o zabezpečenie prístupu k odbernému miestu.",
        ),
      ],
      facts: [
        { label: "Termín dodávky", value: "štvrtok 26. 11. 2026, 10:00 – 14:00" },
        { label: "Množstvo", value: "24 × 19 l fľaša" },
        { label: "Adresa", value: "Hlavná 14, Poprad" },
        { label: "Číslo dokumentu", value: "DOK-48213" },
      ],
    },
  },
  {
    id: "volna",
    title: "2. Voľná správa",
    note: "Bežný e-mail bez šablóny: rovnaký vzhľad, len bez nadpisu a tabuľky. Povolené formátovanie: odseky, nadpis, tučné, kurzíva, zoznam, odkaz.",
    input: {
      subject: "Dohodnutý postup",
      body: [
        paragraph("Dobrý deň, pani Horváthová,"),
        paragraph(
          "ďakujeme za telefonát. Zhrnutie toho, čo sme dohodli: ",
          text("výmenu dvoch fľaší", { marks: ["bold"] }),
          " zabezpečíme pri najbližšej dodávke a ",
          text("o termíne Vás budeme informovať", { marks: ["italic"] }),
          ".",
        ),
        {
          type: "bulletList",
          items: [
            [text("výmena fľaší pri dodávke 26. 11.")],
            [text("kontrola dávkovača technikom do 5 pracovných dní")],
          ],
        },
        paragraph(
          "Viac informácií nájdete na ",
          text("aquapro.example", { href: "https://aquapro.example" }),
          ".",
        ),
      ],
    },
  },
  {
    id: "odpoved",
    title: "3. Odpoveď s citovanou správou",
    note: "Pôvodná správa je zjednodušená do jednotného citovaného bloku. Logo je len raz, hore.",
    input: {
      subject: "Re: Reklamácia dodávky: zakalená voda",
      body: [
        paragraph("Dobrý deň, pani Horváthová,"),
        paragraph(
          "ďakujeme za Vašu správu a ospravedlňujeme sa za komplikácie. Reklamáciu sme prijali pod číslom DOK-48213 a do 2 pracovných dní sa Vám ozveme s konkrétnym riešením.",
        ),
      ],
      quote: {
        kind: "reply",
        headerLines: [
          "Dňa 19. 11. 2026 o 7:48 Jana Horváthová <j.horvathova@hotelpanorama.example> napísal(a):",
        ],
        body: originalMessage,
      },
    },
  },
  {
    id: "forward",
    title: "4. Preposlaná správa",
    note: "Pôvodná správa s hlavičkou (od, dátum, predmet, komu) v rovnakom jednotnom bloku.",
    input: {
      subject: "Fwd: Reklamácia dodávky: zakalená voda",
      body: [
        paragraph("Dobrý deň, Marek,"),
        paragraph(
          "posielam Ti reklamáciu na doriešenie so servisom. Prosím, ozvi sa klientke do zajtra.",
        ),
      ],
      quote: {
        kind: "forward",
        headerLines: [
          "Od: Jana Horváthová <j.horvathova@hotelpanorama.example>",
          "Dátum: 19. 11. 2026 7:48",
          "Predmet: Reklamácia dodávky: zakalená voda",
          "Komu: podpora@aquapro.example",
        ],
        body: originalMessage,
      },
    },
  },
  {
    id: "dlhy",
    title: "5. Dlhý nadpis a dlhé slová",
    note: "Skúška odolnosti: dlhý nadpis, dlhá webová adresa a dlhý e-mail v texte. Na telefóne sa dlhý nadpis presunie pod logo.",
    input: {
      subject: "Potvrdenie dodávky vody pre Hotel Panoráma v Poprade",
      title: "Potvrdenie dodávky vody pre Hotel Panoráma v Poprade",
      body: [
        paragraph("Dobrý deň, pani Horváthová,"),
        paragraph(
          "podrobnosti o dodávke nájdete na ",
          text("https://aquapro.example/zakaznicka-zona/dodavky/2026/11/potvrdenie-dodavky-48213", {
            href: "https://aquapro.example/zakaznicka-zona/dodavky/2026/11/potvrdenie-dodavky-48213",
          }),
          ". V prípade otázok píšte na prevadzkova.podpora.dodavky@hotelpanorama-poprad.example.",
        ),
      ],
      facts: [
        { label: "Termín dodávky", value: "štvrtok 26. 11. 2026, 10:00 – 14:00" },
        { label: "Adresa", value: "Hlavná 14, 058 01 Poprad, areál hotela, zadný vchod" },
      ],
    },
  },
];

const rows: string[] = [];
for (const scenario of scenarios) {
  const { html } = await renderEmail({ ...scenario.input, logoUrl: logo, sender, company });
  const escaped = escapeHtml(html);
  rows.push(`
  <section>
    <h2>${escapeHtml(scenario.title)}</h2>
    <p class="note">${escapeHtml(scenario.note)}</p>
    <div class="pair">
      <figure class="desktop"><figcaption>Počítač</figcaption><iframe title="Počítač: ${escapeHtml(scenario.title)}" srcdoc="${escaped}"></iframe></figure>
      <figure class="phone"><figcaption>Telefón (375 px)</figcaption><div class="device"><iframe title="Telefón: ${escapeHtml(scenario.title)}" srcdoc="${escaped}"></iframe></div></figure>
    </div>
  </section>`);
}

const page = `<!doctype html>
<html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AQUA PRO · Galéria dizajnu e-mailov</title>
<style>
  body{margin:0;background:#e9eef3;color:#192c3b;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif}
  header,section{max-width:1240px;margin:0 auto;padding:24px 28px}
  h1{font-size:26px;margin:0 0 6px} h2{font-size:19px;margin:8px 0 4px} .note{margin:0 0 14px;color:#4c657b}
  .pair{display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap} figure{margin:0}
  figcaption{font-weight:600;margin-bottom:8px}
  .desktop{flex:1 1 640px;min-width:0}
  .desktop iframe{width:100%;height:600px;border:1px solid #b9c9d8;border-radius:8px;background:#fff;display:block}
  .phone{flex:0 0 auto}
  .device{width:375px;padding:12px;background:#1c2530;border-radius:34px;box-shadow:0 8px 24px #0003}
  .device iframe{width:375px;height:640px;border:0;border-radius:22px;background:#fff;display:block}
</style></head><body>
<header><h1>Galéria dizajnu e-mailov AQUA PRO</h1>
<p class="note">Schválený smer (variant A) na počítači a na telefóne. Všetky údaje sú vymyslené. Vzhľad je rovnaký pre šablóny aj voľné správy, aj pri odpovedi a preposlaní. Používateľ vzhľad meniť nemôže.</p></header>
${rows.join("\n")}
<script>
  // Fit each iframe to its email so nothing needs inner scrolling.
  addEventListener("load", () => {
    document.querySelectorAll("iframe").forEach((frame) => {
      const fit = () => {
        const doc = frame.contentDocument;
        if (doc && doc.body) frame.style.height = doc.documentElement.scrollHeight + "px";
      };
      fit();
      setTimeout(fit, 300);
    });
  });
</script>
</body></html>`;

mkdirSync(join(here, "../gallery"), { recursive: true });
const out = join(here, "../gallery/galeria.html");
writeFileSync(out, page);
console.log(`Hotovo: ${out}`);
