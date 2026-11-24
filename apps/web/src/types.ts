/** Shapes returned by the API (apps/api). Kept small and in sync by the end-to-end test. */
export interface Address {
  name?: string;
  email: string;
}

export interface Profile {
  name: string;
  role: string;
  email: string;
}

export interface Folder {
  path: string;
  name: string;
  total: number;
  unseen: number;
  specialUse?: "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive";
}

export interface MessageSummary {
  uid: number;
  folder: string;
  subject: string;
  from: Address;
  date: string;
  seen: boolean;
  hasAttachments: boolean;
}

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
  frame: { document: string; sandbox: string };
  safety: {
    remoteImagesAllowed: boolean;
    blockedRemoteImages: number;
    trackingPixels: number;
    suspiciousLinks: number;
  };
}

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface UploadedFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}
