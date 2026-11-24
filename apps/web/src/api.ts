import type { Doc } from "@aquapro/editor-schema";
import type { ComposeMode, Folder, MessageSummary, MessageView, Profile } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
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
}

export const api = {
  me: () => request<{ user: Profile }>("GET", "/api/me"),
  login: (username: string, password: string) =>
    request<{ user: Profile }>("POST", "/api/login", { username, password }),
  logout: () => request<{ ok: true }>("POST", "/api/logout", {}),
  folders: () => request<Folder[]>("GET", "/api/folders"),
  messages: (folder: string) =>
    request<MessageSummary[]>("GET", `/api/messages?${query({ folder, limit: 100 })}`),
  message: (folder: string, uid: number, images: boolean) =>
    request<MessageView>("GET", `/api/message?${query({ folder, uid, images: images ? 1 : 0 })}`),
  prepare: (mode: Exclude<ComposeMode, "new">, folder: string, uid: number) =>
    request<{ to: string; cc: string; subject: string }>(
      "GET",
      `/api/compose/prepare?${query({ mode, folder, uid })}`,
    ),
  preview: (payload: ComposePayload) =>
    request<{ subject: string; html: string }>("POST", "/api/compose/preview", payload),
  send: (payload: ComposePayload) =>
    request<{ messageId: string; savedToSent: boolean }>("POST", "/api/compose/send", payload),
  attachmentUrl: (folder: string, uid: number, index: number) =>
    `/api/attachment?${query({ folder, uid, index })}`,
};
