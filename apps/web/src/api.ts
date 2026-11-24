import type { Doc } from "@aquapro/editor-schema";
import type {
  ComposeMode,
  Folder,
  MessageSummary,
  MessageView,
  Me,
  AdminRole,
  AdminUser,
  AuditEntry,
  ListItem,
  PermissionGroup,
  UploadedFile,
  UserInputBody,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      "X-AQ-Client": "web",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let code = "error";
    let message = "Niečo sa pokazilo. Skúste to znova.";
    try {
      const data = (await response.json()) as { error?: { code?: string; message?: string } };
      code = data.error?.code ?? code;
      message = data.error?.message ?? message;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
};

export interface ComposePayload {
  mode: ComposeMode;
  folder?: string;
  uid?: number;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  doc: Doc;
  attachmentIds: string[];
  draftUid?: number;
}

export interface OpenedDraft {
  mode: ComposeMode;
  folder?: string;
  uid?: number;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  doc: Doc;
  draftUid: number;
  attachments: UploadedFile[];
}

export const api = {
  me: () => request<Me>("GET", "/api/me"),
  login: (username: string, password: string) =>
    request<Me>("POST", "/api/login", { username, password }),
  logout: () => request<{ ok: true }>("POST", "/api/logout", {}),
  folders: () => request<Folder[]>("GET", "/api/folders"),
  messages: (folder: string) =>
    request<MessageSummary[]>("GET", `/api/messages?${query({ folder, limit: 100 })}`),
  message: (folder: string, uid: number, images: boolean) =>
    request<MessageView>("GET", `/api/message?${query({ folder, uid, images: images ? 1 : 0 })}`),
  prepare: (mode: Exclude<ComposeMode, "new">, folder: string, uid: number) =>
    request<{ to: string; cc: string; subject: string; attachments: UploadedFile[] }>(
      "GET",
      `/api/compose/prepare?${query({ mode, folder, uid })}`,
    ),
  preview: (payload: ComposePayload) =>
    request<{ subject: string; html: string }>("POST", "/api/compose/preview", payload),
  send: (payload: ComposePayload) =>
    request<{ messageId: string; savedToSent: boolean }>("POST", "/api/compose/send", payload),
  upload: async (file: File): Promise<UploadedFile> => {
    const response = await fetch(`/api/uploads?${query({ name: file.name })}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-AQ-Client": "web", "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      let message = "Prílohu sa nepodarilo nahrať.";
      try {
        message =
          ((await response.json()) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        /* keep the generic message */
      }
      throw new ApiError(response.status, "upload", message);
    }
    return (await response.json()) as UploadedFile;
  },
  removeUpload: (id: string) =>
    request<{ removed: boolean }>("DELETE", `/api/uploads/${encodeURIComponent(id)}`),
  saveDraft: (payload: ComposePayload) =>
    request<{ uid: number | null }>("POST", "/api/drafts", payload),
  openDraft: (uid: number) => request<OpenedDraft>("GET", `/api/drafts/open?${query({ uid })}`),
  deleteDraft: (uid: number) =>
    request<{ removed: boolean }>("DELETE", `/api/drafts?${query({ uid })}`),
  attachmentUrl: (folder: string, uid: number, index: number) =>
    `/api/attachment?${query({ folder, uid, index })}`,
};

export const photoUrl = (userId: number, version = 0): string =>
  `/api/users/${userId}/photo?v=${version}`;

export const adminApi = {
  permissions: () => request<{ groups: PermissionGroup[] }>("GET", "/api/admin/permissions"),
  users: (filter: { search?: string; status?: string }) =>
    request<{ users: AdminUser[] }>("GET", `/api/admin/users?${query(filter)}`),
  createUser: (body: UserInputBody) =>
    request<{ user: AdminUser }>("POST", "/api/admin/users", body),
  updateUser: (id: number, body: Partial<UserInputBody>) =>
    request<{ user: AdminUser }>("PATCH", `/api/admin/users/${id}`, body),
  setStatus: (id: number, status: "active" | "disabled") =>
    request<{ user: AdminUser }>("POST", `/api/admin/users/${id}/status`, { status }),
  setPhoto: async (id: number, file: File): Promise<void> => {
    const response = await fetch(`/api/admin/users/${id}/photo`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "X-AQ-Client": "web", "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      let message = "Fotografiu sa nepodarilo nahrať.";
      try {
        message =
          ((await response.json()) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        /* keep the generic message */
      }
      throw new ApiError(response.status, "photo", message);
    }
  },
  removePhoto: (id: number) => request<{ ok: true }>("DELETE", `/api/admin/users/${id}/photo`),
  roles: () => request<{ roles: AdminRole[] }>("GET", "/api/admin/roles"),
  createRole: (body: { name: string; description: string; permissions: string[] }) =>
    request<{ role: AdminRole }>("POST", "/api/admin/roles", body),
  updateRole: (id: number, body: { name?: string; description?: string; permissions?: string[] }) =>
    request<{ role: AdminRole }>("PATCH", `/api/admin/roles/${id}`, body),
  deleteRole: (id: number) => request<{ ok: true }>("DELETE", `/api/admin/roles/${id}`),
  items: (kind: "departments" | "branches") =>
    request<{ items: ListItem[] }>("GET", `/api/lists/${kind}`),
  createItem: (kind: "departments" | "branches", name: string) =>
    request<{ item: ListItem }>("POST", `/api/admin/lists/${kind}`, { name }),
  updateItem: (
    kind: "departments" | "branches",
    id: number,
    body: { name?: string; active?: boolean },
  ) => request<{ item: ListItem }>("PATCH", `/api/admin/lists/${kind}/${id}`, body),
  audit: (beforeId?: number) =>
    request<{ entries: AuditEntry[] }>("GET", `/api/admin/audit?${query({ limit: 50, beforeId })}`),
};
