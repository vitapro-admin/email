import { docToPlainText } from "@aquapro/editor-schema";
import mjml2html from "mjml";
import { COLORS, docToHtml, escapeHtml } from "./doc-html.js";
import type { Fact, RenderInput, RenderedEmail, Sender } from "./types.js";

const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function text(content: string, extra = ""): string {
  return `<mj-text padding="0" ${extra}>${content}</mj-text>`;
}

function factsRows(facts: Fact[]): string {
  const rows = facts
    .map(
      (f) =>
        `<tr><td style="padding:7px 0;width:38%;font-size:13px;color:${COLORS.muted};vertical-align:top;">${escapeHtml(f.label)}</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:${COLORS.text};vertical-align:top;">${escapeHtml(f.value)}</td></tr>`,
    )
    .join("");
  return `<mj-table padding="0" font-family="${FONT}" cellpadding="0" cellspacing="0">${rows}</mj-table>`;
}

function signatureHtml(sender: Sender): string {
  const contact = [sender.phone, sender.email].filter(Boolean) as string[];
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
  const card = input.variant === "card";
  const padX = card ? "0" : "40px";
  const logoAlign = card ? "center" : "left";

  const logo = `<mj-section padding="${card ? "0" : `36px ${padX} 0`}"><mj-column><mj-image src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.company.name)}" width="112px" align="${logoAlign}" padding="0" /></mj-column></mj-section>`;
  const divider = card
    ? `<mj-section padding="22px 0 0"><mj-column><mj-divider border-color="${COLORS.line}" border-width="1px" padding="0" /></mj-column></mj-section>`
    : "";
  const title = input.title
    ? `<mj-section padding="${card ? "26px 0 0" : `28px ${padX} 0`}"><mj-column>${text(escapeHtml(input.title), `font-family="${FONT}" font-size="28px" line-height="1.2" font-weight="600" letter-spacing="-0.02em" color="${COLORS.text}"`)}</mj-column></mj-section>`
    : "";
  const body = `<mj-section padding="${card ? "24px 0 0" : `${input.title ? "22px" : "28px"} ${padX} 0`}"><mj-column>${text(docToHtml(input.body), `font-family="${FONT}"`)}</mj-column></mj-section>`;

  const facts = input.facts?.length
    ? card
      ? `<mj-section padding="8px 0 0"><mj-column background-color="${COLORS.tint}" border-left="3px solid ${COLORS.accent}" border-radius="4px" padding="8px 16px">${factsRows(input.facts)}</mj-column></mj-section>`
      : `<mj-section padding="8px ${padX} 0"><mj-column border-top="1px solid ${COLORS.line}" border-bottom="1px solid ${COLORS.line}" padding="8px 0">${factsRows(input.facts)}</mj-column></mj-section>`
    : "";

  const signature = `<mj-section padding="${card ? "24px 0 0" : `26px ${padX} 0`}"><mj-column>${text(signatureHtml(input.sender), `font-family="${FONT}"`)}</mj-column></mj-section>`;
  const quote = input.quote
    ? `<mj-section padding="${card ? "28px 0 0" : `30px ${padX} 0`}"><mj-column>${text(quoteHtml(input), `font-family="${FONT}"`)}</mj-column></mj-section>`
    : "";
  const bottomPad = `<mj-section padding="${card ? "28px 0 0" : "34px 0 0"}"><mj-column><mj-spacer height="1px" /></mj-column></mj-section>`;

  const footerText = `<mj-text padding="0" font-family="${FONT}" font-size="12px" line-height="1.5" color="${COLORS.muted}" align="${card ? "center" : "left"}">${escapeHtml(input.company.name)}<br>${escapeHtml(input.company.legalLine)}</mj-text>`;

  const head = `<mj-head>
    <mj-title>${escapeHtml(input.subject)}</mj-title>
    <mj-preview>${escapeHtml(preview(input))}</mj-preview>
    <mj-attributes><mj-all font-family="${FONT}" /></mj-attributes>
    <mj-raw><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></mj-raw>
  </mj-head>`;

  if (card) {
    return `<mjml>${head}<mj-body background-color="${COLORS.tint}" width="600px">
      <mj-section padding="28px 0 0"><mj-column><mj-spacer height="1px" /></mj-column></mj-section>
      <mj-wrapper background-color="#FFFFFF" border-radius="12px" padding="36px 40px 40px">
        ${logo}${divider}${title}${body}${facts}${signature}${quote}
      </mj-wrapper>
      <mj-section padding="22px 40px 34px"><mj-column>${footerText}</mj-column></mj-section>
    </mj-body></mjml>`;
  }
  return `<mjml>${head}<mj-body background-color="#FFFFFF" width="640px">
    ${logo}${title}${body}${facts}${signature}${quote}${bottomPad}
    <mj-section padding="18px ${padX} 36px"><mj-column border-top="1px solid ${COLORS.line}" padding="16px 0 0">${footerText}</mj-column></mj-section>
  </mj-body></mjml>`;
}

function buildText(input: RenderInput): string {
  const parts: string[] = [];
  if (input.title) parts.push(input.title.toUpperCase());
  parts.push(docToPlainText(input.body));
  if (input.facts?.length) parts.push(input.facts.map((f) => `${f.label}: ${f.value}`).join("\n"));
  const contact = [input.sender.phone, input.sender.email].filter(Boolean).join(" | ");
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
