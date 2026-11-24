import type { Permission } from "./permissions.js";

export interface RoleRef {
  id: number;
  key: string;
  name: string;
}

/** What a person is allowed to do right now. Loaded fresh from the database. */
export interface Access {
  userId: number;
  login: string;
  status: "active" | "disabled";
  roles: RoleRef[];
  permissions: Set<Permission>;
  isSuperadmin: boolean;
  /** Department of the person (tasks of the department are visible to them). */
  departmentId: number | null;
  /** Name, position and contact for the signature and the screen. */
  profile: Profile;
}

export interface Profile {
  /** Full name with titles, for example "Ing. Ivana Kováčová, PhD." */
  name: string;
  role: string;
  email: string;
  phone?: string;
  landline?: string;
  hasPhoto: boolean;
}

export interface User {
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
  createdAt: Date;
  disabledAt: Date | null;
}

export interface UserInput {
  login: string;
  email: string;
  titleBefore?: string | null;
  firstName: string;
  lastName: string;
  titleAfter?: string | null;
  position?: string | null;
  phone?: string | null;
  landline?: string | null;
  departmentId?: number | null;
  branchId?: number | null;
  roleIds: number[];
}

export type UserPatch = Partial<Omit<UserInput, "login">>;

export interface Role extends RoleRef {
  description: string;
  builtin: boolean;
  permissions: Permission[];
  userCount: number;
}

export interface ListItem {
  id: number;
  name: string;
  active: boolean;
}

export interface AuditEntry {
  id: number;
  at: Date;
  actorId: number | null;
  actorLogin: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
}

export type DirectoryErrorCode =
  "forbidden" | "not-found" | "conflict" | "invalid" | "last-superadmin" | "self-action";

export class DirectoryError extends Error {
  constructor(
    readonly code: DirectoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DirectoryError";
  }
}
