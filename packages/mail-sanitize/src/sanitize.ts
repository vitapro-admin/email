import sanitizeHtml from "sanitize-html";

export interface SanitizeOptions {
  /** Show remote images. Default false: remote images are removed (tracking, privacy). */
  allowRemoteImages?: boolean;
  /** Input larger than this is cut off first. Default 2 000 000 characters. */
  maxInputLength?: number;
}

export interface SanitizedMessage {
  /** Safe HTML fragment. Show it only inside the sandboxed document (see buildSandboxDocument). */
  html: string;
  /** Remote images that were removed. Lets the UI offer "show images". */
  blockedRemoteImages: number;
  /** Images of 2x2 pixels or smaller, almost always tracking pixels. */
  trackingPixels: number;
  /** Links whose visible text names another website than the real target (phishing sign). */
  suspiciousLinks: number;
}

const TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

/** A CSS value is safe when it has no url()/expression()/var() and only plain characters. */
const SAFE_VALUE = /^(?!.*(url|expression|image-set|var|attr|calc)\s*\()[#a-z0-9\s.,%()+-]*$/i;
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,30})$/i;
const LENGTH = /^-?\d+(\.\d+)?(px|pt|em|rem|%)?$/i;

const STYLES: Record<string, RegExp[]> = {
  color: [COLOR],
  "background-color": [COLOR],
  "font-weight": [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
  "font-style": [/^(normal|italic|oblique)$/i],
  "font-size": [LENGTH],
  "font-family": [/^[a-z0-9\s,'"-]{1,120}$/i],
  "text-align": [/^(left|right|center|justify)$/i],
  "text-decoration": [/^(none|underline|line-through)(\s+(none|underline|line-through))*$/i],
  "vertical-align": [/^(top|middle|bottom|baseline)$/i],
  "line-height": [/^(normal|\d+(\.\d+)?(px|pt|em|rem|%)?)$/i],
  width: [LENGTH],
  height: [LENGTH],
  "max-width": [LENGTH],
  padding: [SAFE_VALUE],
  "padding-top": [LENGTH],
  "padding-right": [LENGTH],
  "padding-bottom": [LENGTH],
  "padding-left": [LENGTH],
  margin: [SAFE_VALUE],
  "margin-top": [LENGTH],
  "margin-right": [LENGTH],
  "margin-bottom": [LENGTH],
  "margin-left": [LENGTH],
  border: [SAFE_VALUE],
  "border-top": [SAFE_VALUE],
  "border-right": [SAFE_VALUE],
  "border-bottom": [SAFE_VALUE],
  "border-left": [SAFE_VALUE],
  "border-collapse": [/^(collapse|separate)$/i],
  "border-radius": [SAFE_VALUE],
};

function hostOf(value: string): string | undefined {
  const trimmed = value.trim();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return undefined;
  }
}

const URL_LIKE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

function cutInput(html: string, limit: number): string {
  if (html.length <= limit) return html;
  const cut = html.slice(0, limit);
  const lastTagEnd = cut.lastIndexOf(">");
  return lastTagEnd > limit * 0.9 ? cut.slice(0, lastTagEnd + 1) : cut;
}

/**
 * Makes HTML from a received message safe to DISPLAY. This is an allowlist: only known tags,
 * attributes and CSS properties survive. Scripts, event handlers, forms, frames, objects, SVG,
 * unsafe links, CSS that loads or positions things, and remote images are removed.
 * This is the first of two layers: the result must still be shown only in a sandboxed document.
 */
export function sanitizeIncomingHtml(
  html: string,
  options: SanitizeOptions = {},
): SanitizedMessage {
  const allowRemote = options.allowRemoteImages ?? false;
  const stats = { blocked: 0, pixels: 0, suspicious: 0 };

  const clean = sanitizeHtml(cutInput(html, options.maxInputLength ?? 2_000_000), {
    allowedTags: TAGS,
    allowedAttributes: {
      "*": ["style", "dir", "lang", "title"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "referrerpolicy"],
      table: ["border", "cellpadding", "cellspacing", "width", "align", "bgcolor"],
      td: ["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"],
      th: ["colspan", "rowspan", "align", "valign", "width", "height", "bgcolor"],
      col: ["span", "width"],
      ol: ["start", "type"],
    },
    allowedStyles: { "*": STYLES },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["data", "cid", "http", "https"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    nonTextTags: [
      "script",
      "style",
      "textarea",
      "option",
      "noscript",
      "iframe",
      "object",
      "embed",
      "title",
      "head",
      "template",
      "svg",
      "math",
      "select",
      "button",
      "xml",
    ],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (tagName, attribs) => {
        const src = (attribs["src"] ?? "").trim();
        const tiny = Number(attribs["width"]) <= 2 || Number(attribs["height"]) <= 2;
        if (tiny) stats.pixels += 1;
        const out: Record<string, string> = { referrerpolicy: "no-referrer" };
        for (const key of ["alt", "width", "height"] as const) {
          const value = attribs[key];
          if (value !== undefined) out[key] = value;
        }
        if (
          /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(src) &&
          src.length < 3_000_000
        ) {
          out["src"] = src;
        } else if (/^cid:/i.test(src)) {
          out["src"] = src;
        } else if (/^https?:\/\//i.test(src)) {
          if (allowRemote && !tiny) out["src"] = src;
          else stats.blocked += 1;
        }
        return { tagName, attribs: out };
      },
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === "a" && frame.attribs["href"]) {
        const text = frame.text.trim();
        if (URL_LIKE.test(text)) {
          const shown = hostOf(text);
          const real = hostOf(frame.attribs["href"]);
          if (shown && real && shown !== real) stats.suspicious += 1;
        }
      }
      return false;
    },
  });

  return {
    html: clean,
    blockedRemoteImages: stats.blocked,
    trackingPixels: stats.pixels,
    suspiciousLinks: stats.suspicious,
  };
}
