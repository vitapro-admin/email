import type { Address, Folder } from "./types";

const TIME_ZONE = "Europe/Bratislava";
const dateTime = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
const dayOnly = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric",
  month: "numeric",
  timeZone: TIME_ZONE,
});
const timeOnly = new Intl.DateTimeFormat("sk-SK", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const dayKey = (d: Date) => dayOnly.format(d) + d.getFullYear();

export const formatFull = (iso: string): string => dateTime.format(new Date(iso));

/** Today shows the time, other days the date. */
export function formatShort(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return dayKey(d) === dayKey(now) ? timeOnly.format(d) : dayOnly.format(d);
}

export const personName = (a: Address): string => a.name || a.email;
export const personFull = (a: Address): string => (a.name ? `${a.name} <${a.email}>` : a.email);

const FOLDER_LABELS: Record<NonNullable<Folder["specialUse"]>, string> = {
  inbox: "Doručená pošta",
  sent: "Odoslané",
  drafts: "Koncepty",
  trash: "Kôš",
  junk: "Spam",
  archive: "Archív",
};

export const folderLabel = (f: Folder): string =>
  (f.specialUse && FOLDER_LABELS[f.specialUse]) || f.name;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
