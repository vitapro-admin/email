/**
 * Checks before a file is uploaded, so the user hears about a problem at once. The server enforces
 * the same rules and is the one that decides.
 */
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 20;

const BLOCKED = new Set([
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

export function checkLocalFile(
  file: { name: string; size: number },
  current: { size: number }[],
): string | null {
  const extension = file.name.includes(".") ? (file.name.split(".").pop() ?? "").toLowerCase() : "";
  if (BLOCKED.has(extension))
    return `Súbory typu .${extension} sa z bezpečnostných dôvodov neposielajú.`;
  if (file.size === 0) return `Súbor „${file.name}“ je prázdny.`;
  if (current.length >= MAX_FILES) return "Príliš veľa príloh.";
  const total = current.reduce((sum, f) => sum + f.size, 0) + file.size;
  if (total > MAX_TOTAL_BYTES)
    return `Prílohy spolu nesmú presiahnuť ${MAX_TOTAL_BYTES / 1024 / 1024} MB.`;
  return null;
}
