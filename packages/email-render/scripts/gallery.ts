/**
 * Generates a single self-contained HTML gallery of sample emails (both layout variants),
 * so the design can be reviewed in a browser. Output: gallery/galeria.html
 * Run: pnpm --filter @aquapro/email-render gallery
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToDoc, paragraph, text } from "@aquapro/editor-schema";
import { escapeHtml, quoteForForward, quoteForReply, renderEmail } from "../src/index.js";
import type { QuotableMessage, RenderInput } from "../src/index.js";

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

/** A message as Outlook really sends it: fonts, colors, Word markup, and older history below. */
const received: QuotableMessage = {
  from: { name: "Jana Horváthová", email: "j.horvathova@hotelpanorama.example" },
  to: [{ email: "podpora@aquapro.example" }],
  date: new Date("2026-11-19T06:48:00Z"),
  subject: "Reklamácia dodávky: zakalená voda",
  html: `<html><head><style>p.MsoNormal{font-family:Calibri}</style></head><body>
    <p class="MsoNormal"><span style="font-family:Calibri;font-size:11pt;color:#1F497D">Dobrý deň,<o:p></o:p></span></p>
    <p class="MsoNormal"><span style="font-family:'Comic Sans MS';font-size:14pt;color:red">dve fľaše z poslednej dodávky majú <b>zakalenú vodu</b>.</span> Prosíme o výmenu a stanovisko.<o:p></o:p></p>
    <p class="MsoNormal">Ďakujem,<br>Jana Horváthová<br>Hotel Panoráma<o:p></o:p></p>
    <div id="appendonsend"></div><hr>
    <div id="divRplyFwdMsg"><b>Od:</b> Ivana K.<br><b>Odoslané:</b> 17. 11. 2026 14:20</div>
    <div>Dodávka 24 × 19 l fľaša bola vykonaná.</div></body></html>`,
};

const wordPaste = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0cm;font-size:11.0pt;font-family:"Calibri",sans-serif}</style></head><body>
  <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->
  <p class="MsoNormal"><b><span style="font-size:16.0pt;font-family:'Comic Sans MS';color:red">Dôležité upozornenie</span></b></p>
  <p class="MsoNormal"><span style="font-family:'Times New Roman';font-size:9pt;color:green">Dobrý deň, pani Horváthová,</span></p>
  <p class="MsoNormal"><span style="font-size:20pt">výmenu fľaší zabezpečíme </span><i><span style="color:blue">pri najbližšej dodávke</span></i>. Podrobnosti: <a href="https://aquapro.example"><span style="color:purple">aquapro.example</span></a>
  <img src="http://tracker.example/pixel.gif" width="1" height="1"></p>
  <ul><li style="font-family:Arial;font-size:18pt">výmena do 26. 11.</li><li>kontrola dávkovača</li></ul>
  <p class="MsoNormal"><o:p>&nbsp;</o:p></p></body></html>`;

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
    note: "Pôvodná správa prišla z Outlooku s fontmi, farbami a starou históriou. Citovaný je len jej najnovší text v jednotnom bloku, logo je len raz.",
    input: {
      subject: "Re: Reklamácia dodávky: zakalená voda",
      body: [
        paragraph("Dobrý deň, pani Horváthová,"),
        paragraph(
          "ďakujeme za Vašu správu a ospravedlňujeme sa za komplikácie. Reklamáciu sme prijali pod číslom DOK-48213 a do 2 pracovných dní sa Vám ozveme s konkrétnym riešením.",
        ),
      ],
      quote: quoteForReply(received),
    },
  },
  {
    id: "forward",
    title: "4. Preposlaná správa",
    note: "Rovnaká pôvodná správa, tentoraz celá (aj so starším textom) s hlavičkou od, dátum, predmet, komu v jednotnom bloku.",
    input: {
      subject: "Fwd: Reklamácia dodávky: zakalená voda",
      body: [
        paragraph("Dobrý deň, Marek,"),
        paragraph(
          "posielam Ti reklamáciu na doriešenie so servisom. Prosím, ozvi sa klientke do zajtra.",
        ),
      ],
      quote: quoteForForward(received),
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
  {
    id: "word",
    title: "6. Text vložený z Wordu",
    note: "Pracovník vloží text z Wordu s červeným písmom Comic Sans, rôznymi veľkosťami, obrázkom a skrytými značkami. V e-maile zostane len povolené formátovanie, vzhľad určuje systém.",
    input: {
      subject: "Dôležité upozornenie",
      body: htmlToDoc(wordPaste),
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
