import {
  SANDBOX_ATTRIBUTE,
  buildSandboxDocument,
  plainTextToSafeHtml,
  sanitizeIncomingHtml,
} from "@aquapro/mail-sanitize";
import type { Address, MessageDetail } from "@aquapro/mail-gateway";

export interface MessageView {
  folder: string;
  uid: number;
  messageId: string;
  subject: string;
  from: Address;
  to: Address[];
  cc: Address[];
  date: string;
  seen: boolean;
  attachments: { index: number; filename: string; contentType: string; size: number }[];
  /** Ready to show: set it as the srcdoc of an iframe whose sandbox attribute is `sandbox`. */
  frame: { document: string; sandbox: string };
  safety: {
    remoteImagesAllowed: boolean;
    blockedRemoteImages: number;
    trackingPixels: number;
    suspiciousLinks: number;
  };
}

export function toMessageView(detail: MessageDetail, allowRemoteImages: boolean): MessageView {
  const sanitized = detail.html
    ? sanitizeIncomingHtml(detail.html, { allowRemoteImages })
    : undefined;
  const fragment = sanitized ? sanitized.html : plainTextToSafeHtml(detail.text ?? "");
  return {
    folder: detail.folder,
    uid: detail.uid,
    messageId: detail.messageId,
    subject: detail.subject,
    from: detail.from,
    to: detail.to,
    cc: detail.cc,
    date: detail.date.toISOString(),
    seen: detail.seen,
    attachments: detail.attachments.map((a, index) => ({ index, ...a })),
    frame: {
      document: buildSandboxDocument(fragment, { allowRemoteImages }),
      sandbox: SANDBOX_ATTRIBUTE,
    },
    safety: {
      remoteImagesAllowed: allowRemoteImages,
      blockedRemoteImages: sanitized?.blockedRemoteImages ?? 0,
      trackingPixels: sanitized?.trackingPixels ?? 0,
      suspiciousLinks: sanitized?.suspiciousLinks ?? 0,
    },
  };
}
