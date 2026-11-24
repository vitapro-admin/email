import { randomBytes } from "node:crypto";
import { basename } from "node:path";

export const UPLOAD_LIMITS = {
  /** All attachments of one message together. */
  totalBytes: 20 * 1024 * 1024,
  files: 20,
  /** Uploads that were never used are dropped after this long. */
  maxAgeMs: 12 * 3_600_000,
} as const;

/** Programs and scripts. Other mail servers refuse them anyway and they are the usual way malware travels. */
export const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "com",
  "bat",
  "cmd",
  "scr",
  "pif",
  "msi",
  "msp",
  "dll",
  "cpl",
  "jar",
  "js",
  "jse",
  "vbs",
  "vbe",
  "wsf",
  "wsh",
  "ps1",
  "psm1",
  "lnk",
  "reg",
  "hta",
  "gadget",
  "apk",
  "app",
  "dmg",
  "sh",
]);

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export type NameCheck =
  { ok: true; name: string; contentType: string } | { ok: false; message: string };

/** Cleans a file name and refuses blocked file types. */
export function checkFilename(raw: string): NameCheck {
  const withoutControls = [...basename(raw.replace(/\\/g, "/"))]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  const cleaned = withoutControls
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 150);
  const name = cleaned === "" || cleaned === "." || cleaned === ".." ? "priloha" : cleaned;
  const extension = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      message: `Súbory typu .${extension} sa z bezpečnostných dôvodov neposielajú.`,
    };
  }
  return { ok: true, name, contentType: TYPES[extension] ?? "application/octet-stream" };
}

export interface Upload {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  createdAt: number;
}

export type UploadView = Pick<Upload, "id" | "filename" | "contentType" | "size">;

export class UploadError extends Error {
  constructor(
    readonly code: "attachments-too-large" | "too-many-attachments" | "blocked-file" | "empty-file",
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export const toView = (u: Upload): UploadView => ({
  id: u.id,
  filename: u.filename,
  contentType: u.contentType,
  size: u.size,
});

/**
 * Files a user attached but has not sent yet. Held in memory per login session and never shared
 * between sessions. Fine for one server; large deployments will move this to disk.
 */
export class UploadStore {
  private readonly bySession = new Map<string, Map<string, Upload>>();

  constructor(private readonly now: () => number = Date.now) {}

  add(sessionId: string, filename: string, content: Buffer): Upload {
    const checked = checkFilename(filename);
    if (!checked.ok) throw new UploadError("blocked-file", checked.message);
    if (content.length === 0) throw new UploadError("empty-file", "Súbor je prázdny.");
    const files = this.bySession.get(sessionId) ?? new Map<string, Upload>();
    if (files.size >= UPLOAD_LIMITS.files)
      throw new UploadError("too-many-attachments", "Príliš veľa príloh.");
    const total = [...files.values()].reduce((sum, f) => sum + f.size, 0);
    if (total + content.length > UPLOAD_LIMITS.totalBytes) {
      throw new UploadError(
        "attachments-too-large",
        `Prílohy spolu nesmú presiahnuť ${UPLOAD_LIMITS.totalBytes / 1024 / 1024} MB.`,
      );
    }
    const upload: Upload = {
      id: randomBytes(12).toString("base64url"),
      filename: checked.name,
      contentType: checked.contentType,
      size: content.length,
      content,
      createdAt: this.now(),
    };
    files.set(upload.id, upload);
    this.bySession.set(sessionId, files);
    return upload;
  }

  get(sessionId: string, id: string): Upload | undefined {
    return this.bySession.get(sessionId)?.get(id);
  }

  remove(sessionId: string, id: string): boolean {
    return this.bySession.get(sessionId)?.delete(id) ?? false;
  }

  /** Drops what is no longer needed: files of ended sessions and files that were never used. */
  sweep(activeSessionIds: (id: string) => boolean): void {
    const limit = this.now() - UPLOAD_LIMITS.maxAgeMs;
    for (const [sessionId, files] of this.bySession) {
      if (!activeSessionIds(sessionId)) {
        this.bySession.delete(sessionId);
        continue;
      }
      for (const [id, file] of files) if (file.createdAt < limit) files.delete(id);
    }
  }
}
