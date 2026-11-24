import { describe, expect, it } from "vitest";
import { sanitizeIncomingHtml } from "./sanitize.js";
import { buildSandboxDocument, plainTextToSafeHtml } from "./sandbox.js";

/** Things that must never be present in sanitized output, whatever the input was. */
const FORBIDDEN = [
  /<script/i,
  /<\/script/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
  /vbscript:/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<form/i,
  /<input/i,
  /<svg/i,
  /<math/i,
  /<link/i,
  /<meta/i,
  /<base/i,
  /<style/i,
  /@import/i,
  /expression\s*\(/i,
  /url\s*\(/i,
  /position\s*:/i,
  /data:text\/html/i,
];

const ATTACKS: Record<string, string> = {
  script: "<p>ahoj</p><script>alert(1)</script>",
  "img onerror": "<img src=x onerror=alert(1)>",
  "svg onload": "<svg onload=alert(1)><circle/></svg>",
  "body onload": "<body onload=alert(1)>text",
  "javascript link": '<a href="javascript:alert(1)">klik</a>',
  "mixed-case javascript": '<a href="JaVaScRiPt:alert(1)">klik</a>',
  "encoded javascript": '<a href="&#106;avascript:alert(1)">klik</a>',
  "tab inside scheme": '<a href="java\tscript:alert(1)">klik</a>',
  "data html link": '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  vbscript: '<a href="vbscript:msgbox(1)">x</a>',
  iframe: '<iframe src="https://evil.example"></iframe>',
  "iframe srcdoc": '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  object: '<object data="evil.swf"></object>',
  embed: '<embed src="evil.swf">',
  form: '<form action="https://evil.example"><input name=pw type=password></form>',
  "meta refresh": '<meta http-equiv="refresh" content="0;url=https://evil.example">',
  "base hijack": '<base href="https://evil.example/">',
  link: '<link rel="stylesheet" href="https://evil.example/x.css">',
  "style block": "<style>body{background:url(https://evil.example/x.gif)}</style>",
  "style import": "<style>@import url(https://evil.example/x.css);</style>",
  "css url": '<p style="background:url(https://tracker.example/x.gif)">x</p>',
  "css expression": '<p style="width:expression(alert(1))">x</p>',
  "css position overlay":
    '<div style="position:fixed;top:0;left:0;width:100%;height:100%">klikni</div>',
  "css behavior": '<p style="behavior:url(x.htc)">x</p>',
  "mutation noscript": '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  "mutation textarea": "<textarea><img src=x onerror=alert(1)></textarea>",
  "nested script": "<scr<script>ipt>alert(1)</scr</script>ipt>",
  "unclosed tags": '<a href="https://ok.example" onclick="x()"><b><i>text',
  "svg in img": '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
  button: '<button onclick="alert(1)">x</button>',
  template: "<template><script>alert(1)</script></template>",
  "comment trick": "<!--><script>alert(1)</script>-->",
  "protocol relative": '<a href="//evil.example/x">x</a><img src="//evil.example/x.gif">',
};

describe("sanitizeIncomingHtml: attack corpus", () => {
  it.each(Object.entries(ATTACKS))("neutralizes: %s", (_name, payload) => {
    const { html } = sanitizeIncomingHtml(payload);
    for (const pattern of FORBIDDEN) {
      expect(html, `matched ${pattern}`).not.toMatch(pattern);
    }
    // The page-level wrapper must also be safe with the same output.
    const doc = buildSandboxDocument(html);
    expect(doc).not.toMatch(/<script/i);
  });
});

describe("sanitizeIncomingHtml: behaviour", () => {
  it("keeps normal formatting, tables and safe CSS", () => {
    const { html } = sanitizeIncomingHtml(
      '<table width="600" cellpadding="0"><tr><td style="color:#192c3b;font-size:14px;padding:8px;text-align:center" colspan="2"><b>Ahoj</b> <i>svet</i></td></tr></table><ul><li>a</li></ul>',
    );
    expect(html).toContain("<table");
    expect(html).toContain("<b>Ahoj</b>");
    expect(html).toContain("color:#192c3b");
    expect(html).toContain("font-size:14px");
    expect(html).toContain("colspan");
    expect(html).toContain("<li>a</li>");
  });

  it("opens links in a new window without leaking the opener", () => {
    const { html } = sanitizeIncomingHtml('<a href="https://aquapro.example">web</a>');
    expect(html).toContain('href="https://aquapro.example"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("noreferrer");
  });

  it("keeps mailto and tel links", () => {
    const { html } = sanitizeIncomingHtml(
      '<a href="mailto:a@b.sk">m</a><a href="tel:+421900000000">t</a>',
    );
    expect(html).toContain("mailto:a@b.sk");
    expect(html).toContain("tel:+421900000000");
  });

  it("blocks remote images by default and counts them", () => {
    const r = sanitizeIncomingHtml(
      '<img src="https://tracker.example/a.png" width="300"><img src="http://x.example/b.png">',
    );
    expect(r.html).not.toContain("tracker.example");
    expect(r.html).not.toContain("x.example");
    expect(r.blockedRemoteImages).toBe(2);
  });

  it("recognizes tracking pixels and never lets them through, even when remote images are on", () => {
    const r = sanitizeIncomingHtml(
      '<img src="https://tracker.example/p.gif" width="1" height="1"><img src="https://ok.example/a.png" width="300">',
      {
        allowRemoteImages: true,
      },
    );
    expect(r.trackingPixels).toBe(1);
    expect(r.html).not.toContain("tracker.example");
    expect(r.html).toContain("https://ok.example/a.png");
  });

  it("allows inline data images (png) and cid images but not svg", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const r = sanitizeIncomingHtml(
      `<img src="${png}"><img src="cid:logo123"><img src="data:image/svg+xml;base64,PHN2Zz4=">`,
    );
    expect(r.html).toContain(png);
    expect(r.html).toContain("cid:logo123");
    expect(r.html).not.toContain("svg");
  });

  it("flags links whose visible text names a different website", () => {
    const r = sanitizeIncomingHtml(
      '<a href="https://evil.example/login">https://www.mojabanka.sk/prihlasenie</a> <a href="https://aquapro.example/x">aquapro.example/x</a> <a href="https://aquapro.example">Klikni sem</a>',
    );
    expect(r.suspiciousLinks).toBe(1);
  });

  it("drops hidden-text tricks that rely on style position, but keeps plain text", () => {
    const { html } = sanitizeIncomingHtml(
      '<div style="position:absolute;left:-9999px">skryté</div><p>viditeľné</p>',
    );
    expect(html).not.toContain("position");
    expect(html).toContain("viditeľné");
  });

  it("survives broken input, empty input and very deep nesting", () => {
    expect(() => sanitizeIncomingHtml("<<<>>><a href=")).not.toThrow();
    expect(sanitizeIncomingHtml("").html).toBe("");
    const deep = "<div>".repeat(50_000) + "x" + "</div>".repeat(50_000);
    const started = Date.now();
    expect(() => sanitizeIncomingHtml(deep)).not.toThrow();
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("cuts oversized input", () => {
    const r = sanitizeIncomingHtml("<p>" + "a".repeat(10_000) + "</p>", { maxInputLength: 500 });
    expect(r.html.length).toBeLessThan(700);
  });
});

describe("sandbox document", () => {
  it("has a strict CSP with no scripts, forms or remote loads by default", () => {
    const doc = buildSandboxDocument("<p>x</p>");
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("img-src data:;");
    expect(doc).not.toContain("script-src");
    expect(doc).toContain("form-action 'none'");
    expect(doc).toContain("base-uri 'none'");
  });

  it("allows https images only when remote images are enabled", () => {
    expect(buildSandboxDocument("", { allowRemoteImages: true })).toContain(
      "img-src data: https:;",
    );
  });

  it("turns plain text into safe html with clickable http(s) addresses", () => {
    const html = plainTextToSafeHtml(
      "Pozri https://aquapro.example/x?a=1&b=2 <script>alert(1)</script>\nriadok 2",
    );
    expect(html).not.toContain("<script");
    expect(html).toContain('href="https://aquapro.example/x?a=1&amp;b=2"');
    expect(html).toContain("white-space:pre-wrap");
  });
});
