import type { Profile } from "./types.js";

interface NameParts {
  titleBefore: string | null;
  firstName: string;
  lastName: string;
  titleAfter: string | null;
}

/** "Ing. Ivana Kováčová, PhD." from the separate fields. */
export function fullName(p: NameParts): string {
  const name = [p.titleBefore, p.firstName, p.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  const after = p.titleAfter?.trim();
  return after ? `${name}, ${after}` : name;
}

export function toProfile(
  user: NameParts & {
    position: string | null;
    email: string;
    phone: string | null;
    landline: string | null;
  },
  hasPhoto: boolean,
): Profile {
  return {
    name: fullName(user),
    role: user.position?.trim() ?? "",
    email: user.email,
    ...(user.phone?.trim() ? { phone: user.phone.trim() } : {}),
    ...(user.landline?.trim() ? { landline: user.landline.trim() } : {}),
    hasPhoto,
  };
}
