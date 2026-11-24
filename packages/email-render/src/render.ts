import { docToPlainText } from "@aquapro/editor-schema";
import mjml2html from "mjml";
import { COLORS, docToHtml, escapeHtml } from "./doc-html.js";
import type { Fact, RenderInput, RenderedEmail, Sender } from "./types.js";

/** Titles up to this many characters stay beside the logo on phones. */
const SHORT_TITLE_MAX = 24;

const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function text(content: string, extra = ""): string {
  return `<mj-text padding="0" ${extra}>${content}</mj-text>`;
}

function factsRows(facts: Fact[]): string {
  const rows = facts
    .map(
      (f) =>
        `<tr><td style="padding:7px 0;width:38%;font-size:13px;color:${COLORS.muted};vertical-align:top;">${escapeHtml(f.label)}</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:${COLORS.text};vertical-align:top;overflow-wrap:anywhere;">${escapeHtml(f.value)}</td></tr>`,
    )
    .join("");
  return `<mj-table padding="0" font-family="${FONT}" cellpadding="0" cellspacing="0">${rows}</mj-table>`;
}

function signatureHtml(sender: Sender): string {
  const contact = [sender.phone, sender.landline, sender.email].filter(Boolean) as string[];
  const contactHtml = contact
    .map((c) =>
      c === sender.email
        ? `<a href="mailto:${escapeHtml(c)}" style="color:${COLORS.muted};text-decoration:none;">${escapeHtml(c)}</a>`
        : escapeHtml(c),
    )
    .join(" &nbsp;·&nbsp; ");
  return `<p style="margin:0;font-size:15px;line-height:1.55;color:${COLORS.text};">S pozdravom</p><p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:${COLORS.text};"><strong>${escapeHtml(sender.name)}</strong><br><span style="font-size:13px;color:${COLORS.muted};">${escapeHtml(sender.role)} · AQUA PRO EUROPE<br>${contactHtml}</span></p>`;
}

function quoteHtml(input: RenderInput): string {
  const q = input.quote;
  if (!q) return "";
  const head =
    (q.kind === "forward"
      ? `<p style="margin:0 0 6px;font-size:13px;font-weight:600;color:${COLORS.muted};">Preposlaná správa</p>`
      : "") +
    `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${COLORS.muted};">${q.headerLines.map(escapeHtml).join("<br>")}</p>`;
  return `<div style="padding-left:14px;border-left:3px solid ${COLORS.quoteLine};">${head}${docToHtml(q.body, { size: "small" })}</div>`;
}

function preview(input: RenderInput): string {
  return docToPlainText(input.body).replace(/\s+/g, " ").trim().slice(0, 110);
}

function buildMjml(input: RenderInput): string {
  const padX = "40px";

  // Header row: logo on the left, optional title on the same level, right aligned.
  // A short title stays beside the logo on phones too. A long title would be squeezed, so on
  // phones it drops under the logo and aligns left (see the media query in <mj-style>).
  const logoImage = `<mj-image src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.company.name)}" width="112px" align="left" padding="0" />`;
  const titleStyle = `font-family="${FONT}" css-class="hdr-title" align="right" font-size="22px" line-height="1.25" font-weight="600" letter-spacing="-0.01em" color="${COLORS.text}"`;
  let header: string;
  if (!input.title) {
    header = `<mj-section css-class="px" padding="36px ${padX} 0"><mj-column>${logoImage}</mj-column></mj-section>`;
  } else if (input.title.length <= SHORT_TITLE_MAX) {
    header = `<mj-section css-class="px" padding="36px ${padX} 0"><mj-group><mj-column width="38%" vertical-align="middle">${logoImage}</mj-column><mj-column width="62%" vertical-align="middle">${text(escapeHtml(input.title), titleStyle)}</mj-column></mj-group></mj-section>`;
  } else {
    header = `<mj-section css-class="px" padding="36px ${padX} 0"><mj-column width="38%" vertical-align="middle">${logoImage}</mj-column><mj-column width="62%" vertical-align="middle" css-class="hdr-long">${text(escapeHtml(input.title), titleStyle)}</mj-column></mj-section>`;
  }

  const body = `<mj-section css-class="px" padding="30px ${padX} 0"><mj-column css-class="body-text">${text(docToHtml(input.body), `font-family="${FONT}"`)}</mj-column></mj-section>`;

  const facts = input.facts?.length
    ? `<mj-section css-class="px" padding="8px ${padX} 0"><mj-column border-top="1px solid ${COLORS.line}" border-bottom="1px solid ${COLORS.line}" padding="8px 0">${factsRows(input.facts)}</mj-column></mj-section>`
    : "";

  const signature = `<mj-section css-class="px" padding="26px ${padX} 0"><mj-column>${text(signatureHtml(input.sender), `font-family="${FONT}"`)}</mj-column></mj-section>`;
  const quote = input.quote
    ? `<mj-section css-class="px" padding="30px ${padX} 0"><mj-column>${text(quoteHtml(input), `font-family="${FONT}"`)}</mj-column></mj-section>`
    : "";
  const footer = `<mj-section css-class="px" padding="34px ${padX} 36px"><mj-column border-top="1px solid ${COLORS.line}" padding="16px 0 0"><mj-text padding="0" font-family="${FONT}" font-size="12px" line-height="1.5" color="${COLORS.muted}">${escapeHtml(input.company.name)}<br>${escapeHtml(input.company.legalLine)}</mj-text></mj-column></mj-section>`;

  return `<mjml><mj-head>
    <mj-title>${escapeHtml(input.subject)}</mj-title>
    <mj-preview>${escapeHtml(preview(input))}</mj-preview>
    <mj-attributes><mj-all font-family="${FONT}" /></mj-attributes>
    <mj-style>
      @media only screen and (max-width:479px) {
        .px > table > tbody > tr > td { padding-left:22px !important; padding-right:22px !important; }
        .body-text p, .body-text li { font-size:16px !important; }
        .hdr-long .hdr-title div { text-align:left !important; }
        .hdr-long { padding-top:18px !important; }
      }
    </mj-style>
    <mj-raw><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></mj-raw>
  </mj-head><mj-body background-color="#FFFFFF" width="640px">${header}${body}${facts}${signature}${quote}${footer}</mj-body></mjml>`;
}

function buildText(input: RenderInput): string {
  const parts: string[] = [];
  if (input.title) parts.push(input.title.toUpperCase());
  parts.push(docToPlainText(input.body));
  if (input.facts?.length) parts.push(input.facts.map((f) => `${f.label}: ${f.value}`).join("\n"));
  const contact = [input.sender.phone, input.sender.landline, input.sender.email]
    .filter(Boolean)
    .join(" | ");
  parts.push(
    `S pozdravom\n${input.sender.name}\n${input.sender.role}, ${input.company.name}\n${contact}`,
  );
  if (input.quote) {
    const head =
      input.quote.kind === "forward"
        ? ["Preposlaná správa", ...input.quote.headerLines]
        : input.quote.headerLines;
    const quoted = [...head, "", docToPlainText(input.quote.body)]
      .join("\n")
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
    parts.push(quoted);
  }
  parts.push(`--\n${input.company.name}\n${input.company.legalLine}`);
  return parts.join("\n\n");
}

/** Renders ANY outgoing email (template or free text) through the one shared layout. */
export async function renderEmail(input: RenderInput): Promise<RenderedEmail> {
  const result = await mjml2html(buildMjml(input), { validationLevel: "strict" });
  if (result.errors.length > 0) {
    throw new Error(`MJML error: ${result.errors.map((e) => e.formattedMessage).join("; ")}`);
  }
  return { html: result.html, text: buildText(input) };
}
