import { readFileSync } from "node:fs";

/** Content-ID the logo is referenced by in outgoing emails: <img src="cid:aquapro-logo">. */
export const LOGO_CID = "aquapro-logo";

let cached: Buffer | undefined;

/**
 * The logo as an inline attachment (shown even where remote images are blocked).
 * Render with logoUrl: `cid:${LOGO_CID}` and pass this as an inline image when sending.
 */
export function logoAttachment(): {
  cid: string;
  filename: string;
  content: Buffer;
  contentType: string;
} {
  cached ??= readFileSync(new URL("../assets/logo.png", import.meta.url));
  return { cid: LOGO_CID, filename: "logo.png", content: cached, contentType: "image/png" };
}
