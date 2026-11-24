/** Shapes returned by the API (apps/api). Kept small and in sync by the end-to-end test. */
export interface Address {
  name?: string;
  email: string;
}

export interface Profile {
  id?: number;
  name: string;
  role: string;
  email: string;
  phone?: string;
  landline?: string;
  hasPhoto?: boolean;
}

/** The signed-in person with what they may do (from /api/me). */
export interface Me {
  user: Profile;
  roles: { key: string; name: string }[];
  permissions: string[];
  isSuperadmin: boolean;
}

export interface RoleRef {
  id: number;
  key: string;
  name: string;
}

export interface AdminUser {
  id: number;
  login: string;
  email: string;
  titleBefore: string | null;
  firstName: string;
  lastName: string;
  titleAfter: string | null;
  position: string | null;
  phone: string | null;
  landline: string | null;
  departmentId: number | null;
  branchId: number | null;
  status: "active" | "disabled";
  roles: RoleRef[];
  hasPhoto: boolean;
}

export interface AdminRole extends RoleRef {
  description: string;
  builtin: boolean;
  permissions: string[];
  userCount: number;
}

export interface ListItem {
  id: number;
  name: string;
  active: boolean;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: string; label: string }[];
}

export interface AuditEntry {
  id: number;
  at: string;
  actorLogin: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
}

export type UserInputBody = {
  login?: string;
  email: string;
  titleBefore: string | null;
  firstName: string;
  lastName: string;
  titleAfter: string | null;
  position: string | null;
  phone: string | null;
  landline: string | null;
  departmentId: number | null;
  branchId: number | null;
  roleIds: number[];
};

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
