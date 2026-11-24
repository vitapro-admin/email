/**
 * Second layer: the sanitized fragment is shown in an <iframe srcdoc> with these exact settings.
 * No scripts and no same-origin access exist inside it, even if sanitizing had a hole.
 */
export const SANDBOX_ATTRIBUTE = "allow-popups allow-popups-to-escape-sandbox";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text messages: escaped, line breaks kept, http(s) addresses made clickable. */
export function plainTextToSafeHtml(text: string): string {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(
    /\bhttps?:\/\/[^\s<>"')\]]+/gi,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`,
  );
  return `<div style="white-space:pre-wrap">${linked}</div>`;
}

export interface SandboxDocumentOptions {
  /** Must match the allowRemoteImages used when sanitizing. */
  allowRemoteImages?: boolean;
}

/** Wraps a sanitized fragment in a full document with a strict Content-Security-Policy. */
export function buildSandboxDocument(
  sanitizedHtml: string,
  options: SandboxDocumentOptions = {},
): string {
  const images = options.allowRemoteImages ? "data: https:" : "data:";
  const csp = `default-src 'none'; img-src ${images}; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light">
<base target="_blank">
<style>
  html{background:#fff}
  body{margin:0;padding:16px;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#192c3b;overflow-wrap:anywhere}
  img{max-width:100%;height:auto} table{max-width:100%} blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #b9c9d8;color:#4c657b}
  a{color:#246aaf} pre{white-space:pre-wrap}
</style></head><body>${sanitizedHtml}</body></html>`;
}
