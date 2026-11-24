import { safeHref } from "@aquapro/editor-schema";
import type { Block, Doc, Inline } from "@aquapro/editor-schema";

export const COLORS = {
  text: "#192C3B",
  muted: "#4C657B",
  accent: "#246AAF",
  line: "#D3DFE8",
  tint: "#F2F5F8",
  quoteLine: "#B9C9D8",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineHtml(content: Inline[]): string {
  return content
    .map((node) => {
      if (node.type === "hardBreak") return "<br>";
      let html = escapeHtml(node.text);
      if (node.marks?.includes("bold")) html = `<strong>${html}</strong>`;
      if (node.marks?.includes("italic")) html = `<em>${html}</em>`;
      const href = safeHref(node.href);
      if (href) {
        html = `<a href="${escapeHtml(href)}" style="color:${COLORS.accent};text-decoration:underline;">${html}</a>`;
      }
      return html;
    })
    .join("");
}

export interface DocHtmlOptions {
  /** "small" is used for quoted history. */
  size?: "normal" | "small";
}

/** Converts the content model to email-safe HTML with inline styles (no classes, no scripts). */
export function docToHtml(doc: Doc, options: DocHtmlOptions = {}): string {
  const small = options.size === "small";
  const fontSize = small ? "13px" : "15px";
  const color = small ? COLORS.muted : COLORS.text;
  const base = `font-size:${fontSize};line-height:1.6;color:${color};overflow-wrap:anywhere;word-wrap:break-word;`;

  const block = (b: Block): string => {
    switch (b.type) {
      case "paragraph":
        return `<p style="margin:0 0 14px;${base}">${inlineHtml(b.content)}</p>`;
      case "heading":
        return `<h2 style="margin:22px 0 8px;font-size:${small ? "14px" : "18px"};line-height:1.3;font-weight:600;color:${color};">${inlineHtml(b.content)}</h2>`;
      case "bulletList":
      case "orderedList": {
        const tag = b.type === "bulletList" ? "ul" : "ol";
        const items = b.items
          .map((item) => `<li style="margin:0 0 4px;${base}">${inlineHtml(item)}</li>`)
          .join("");
        return `<${tag} style="margin:0 0 14px;padding-left:22px;${base}">${items}</${tag}>`;
      }
      case "quote":
        return `<div style="margin:0 0 14px;padding-left:14px;border-left:3px solid ${COLORS.quoteLine};${base}color:${COLORS.muted};">${inlineHtml(b.content)}</div>`;
    }
  };
  return doc.map(block).join("");
}
