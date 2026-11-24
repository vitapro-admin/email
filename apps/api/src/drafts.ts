import { sanitizeDoc } from "@aquapro/editor-schema";
import type { Doc } from "@aquapro/editor-schema";
import { DRAFT_STATE_FILENAME } from "@aquapro/mail-gateway";
import type { MailGateway } from "@aquapro/mail-gateway";
import { z } from "zod";

/** What is stored inside a draft so it reopens exactly as it was left. */
export const draftState = z.object({
  v: z.literal(1),
  mode: z.enum(["new", "reply", "replyAll", "forward"]),
  folder: z.string().max(500).optional(),
  uid: z.number().int().positive().optional(),
  to: z.string().max(5000),
  cc: z.string().max(5000),
  bcc: z.string().max(5000),
  subject: z.string().max(998),
  doc: z.unknown(),
});
export type DraftState = Omit<z.infer<typeof draftState>, "doc"> & { doc: Doc };

export function parseDraftState(raw: unknown): DraftState | undefined {
  const parsed = draftState.safeParse(raw);
  if (!parsed.success) return undefined;
  return { ...parsed.data, doc: sanitizeDoc(parsed.data.doc) };
}

/** The Drafts folder of this mailbox: the one the server marks as drafts, else "Drafts". */
export async function draftsFolder(gateway: MailGateway): Promise<string> {
  const folders = await gateway.listFolders();
  return folders.find((f) => f.specialUse === "drafts")?.path ?? "Drafts";
}

export { DRAFT_STATE_FILENAME };
