/**
 * The ONLY content model a user can produce. Anything not expressible here cannot be sent.
 * No fonts, sizes, colors or alignment exist in this model by design.
 */
export type Mark = "bold" | "italic";

export type Inline =
  { type: "text"; text: string; marks?: Mark[]; href?: string } | { type: "hardBreak" };

export type Block =
  | { type: "paragraph"; content: Inline[] }
  | { type: "heading"; content: Inline[] }
  | { type: "bulletList"; items: Inline[][] }
  | { type: "orderedList"; items: Inline[][] }
  | { type: "quote"; content: Inline[] };

export type Doc = Block[];
