import type { Doc } from "@aquapro/editor-schema";

export interface Sender {
  name: string;
  role: string;
  phone?: string;
  email: string;
}

export interface Fact {
  label: string;
  value: string;
}

/**
 * Previous conversation, ALREADY simplified to the allowed content model.
 * Only one level is allowed: nested older quotes must be dropped by whoever builds it.
 */
export interface Quote {
  kind: "reply" | "forward";
  headerLines: string[];
  body: Doc;
}

export interface CompanyInfo {
  name: string;
  /** Short legal line shown in the footer. */
  legalLine: string;
}

export interface RenderInput {
  subject: string;
  /** Optional heading shown at logo level, right aligned. Used by templates; free messages have none. */
  title?: string;
  body: Doc;
  /** Key facts from the CRM (label/value rows), used by templates. */
  facts?: Fact[];
  sender: Sender;
  quote?: Quote;
  company: CompanyInfo;
  /** Absolute URL, data URI or "cid:..." of the PNG logo. */
  logoUrl: string;
}

export interface RenderedEmail {
  html: string;
  /** text/plain alternative, always produced together with the HTML. */
  text: string;
}
