import { withTransaction } from "@aquapro/db";
import type { Db, Queryable } from "@aquapro/db";
import {
  ALL_PERMISSIONS,
  PRIVILEGED_ROLE_KEYS,
  RESTRICTED_PERMISSIONS,
  SUPERADMIN_KEY,
  isPermission,
} from "./permissions.js";
import type { Permission } from "./permissions.js";
import { fullName, toProfile } from "./profile.js";
import { DirectoryError } from "./types.js";
import type {
  Access,
  AuditEntry,
  ListItem,
  Role,
  RoleRef,
  User,
  UserInput,
  UserPatch,
} from "./types.js";

export type ListKind = "departments" | "branches";
const LIST_TABLES: Record<ListKind, { table: string; audit: string }> = {
  departments: { table: "departments", audit: "department" },
  branches: { table: "branches", audit: "branch" },
};

const LOGIN = /^[a-z0-9._@+-]{1,100}$/;
const EMAIL = /^[^\s@<>"',;()[\]\\]+@[^\s@<>"',;()[\]\\]+\.[^\s@<>"',;()[\]\\]{2,}$/;

interface UserRow {
  id: string;
  login: string;
  email: string;
  title_before: string | null;
  first_name: string;
  last_name: string;
  title_after: string | null;
  position: string | null;
  phone: string | null;
  landline: string | null;
  department_id: number | null;
  branch_id: number | null;
  status: "active" | "disabled";
  created_at: Date;
  disabled_at: Date | null;
  has_photo: boolean;
  roles: RoleRef[];
}

const USER_SELECT = `
  select u.*, exists (select 1 from user_photos p where p.user_id = u.id) as has_photo,
    coalesce((select json_agg(json_build_object('id', r.id, 'key', r.key, 'name', r.name) order by r.name)
              from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = u.id), '[]'::json) as roles
  from users u`;

const toUser = (r: UserRow): User => ({
  id: Number(r.id),
  login: r.login,
  email: r.email,
  titleBefore: r.title_before,
  firstName: r.first_name,
  lastName: r.last_name,
  titleAfter: r.title_after,
  position: r.position,
  phone: r.phone,
  landline: r.landline,
  departmentId: r.department_id,
  branchId: r.branch_id,
  status: r.status,
  roles: r.roles,
  hasPhoto: r.has_photo,
  createdAt: r.created_at,
  disabledAt: r.disabled_at,
});

const isPrivileged = (roles: RoleRef[]): boolean =>
  roles.some((r) => PRIVILEGED_ROLE_KEYS.includes(r.key));
const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

function need(actor: Access, permission: Permission): void {
  if (!actor.permissions.has(permission))
    throw new DirectoryError("forbidden", "Na túto akciu nemáte oprávnenie.");
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "23505";
}

function imageType(data: Buffer): "image/jpeg" | "image/png" | "image/webp" | undefined {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return "image/jpeg";
  if (
    data.length > 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    data.length > 12 &&
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return undefined;
}

export interface AuditInput {
  actor: { id: number | null; login: string };
  action: string;
  targetType?: string;
  targetId?: string | number;
  details?: Record<string, unknown>;
}

export const MAX_PHOTO_BYTES = 1024 * 1024;

export class Directory {
  constructor(private readonly db: Db) {}

  // =========================================================== reading

  /** Fresh permissions for a person. Undefined when the user does not exist. */
  async getAccess(userId: number): Promise<Access | undefined> {
    const user = await this.loadUser(this.db, userId);
    if (!user) return undefined;
    const isSuperadmin = user.roles.some((r) => r.key === SUPERADMIN_KEY);
    let permissions: Set<Permission>;
    if (isSuperadmin) {
      permissions = new Set(ALL_PERMISSIONS);
    } else {
      const { rows } = await this.db.query<{ permission: string }>(
        `select distinct rp.permission from user_roles ur join role_permissions rp on rp.role_id = ur.role_id where ur.user_id = $1`,
        [userId],
      );
      permissions = new Set(rows.map((r) => r.permission).filter(isPermission));
    }
    return {
      userId,
      login: user.login,
      status: user.status,
      roles: user.roles,
      permissions,
      isSuperadmin,
      profile: toProfile(user, user.hasPhoto),
    };
  }

  /** Finds the user for a login name or e-mail address (case does not matter). */
  async resolveLogin(
    login: string,
  ): Promise<{ userId: number; status: "active" | "disabled" } | undefined> {
    const key = login.trim().toLowerCase();
    const { rows } = await this.db.query<{ id: string; status: "active" | "disabled" }>(
      "select id, status from users where login = $1 or lower(email) = $1",
      [key],
    );
    const row = rows[0];
    return row ? { userId: Number(row.id), status: row.status } : undefined;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.loadUser(this.db, id);
  }

  async listUsers(
    filter: { search?: string; status?: "active" | "disabled"; roleId?: number } = {},
  ): Promise<User[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.search?.trim()) {
      params.push(`%${filter.search.trim().toLowerCase()}%`);
      where.push(
        `(lower(u.login) like $${params.length} or lower(u.email) like $${params.length} or lower(u.first_name || ' ' || u.last_name) like $${params.length})`,
      );
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`u.status = $${params.length}`);
    }
    if (filter.roleId) {
      params.push(filter.roleId);
      where.push(
        `exists (select 1 from user_roles x where x.user_id = u.id and x.role_id = $${params.length})`,
      );
    }
    const { rows } = await this.db.query<UserRow>(
      `${USER_SELECT} ${where.length ? `where ${where.join(" and ")}` : ""} order by u.last_name, u.first_name, u.id`,
      params,
    );
    return rows.map(toUser);
  }

  async getPhoto(userId: number): Promise<{ contentType: string; data: Buffer } | undefined> {
    const { rows } = await this.db.query<{ content_type: string; data: Buffer }>(
      "select content_type, data from user_photos where user_id = $1",
      [userId],
    );
    return rows[0] ? { contentType: rows[0].content_type, data: rows[0].data } : undefined;
  }

  async listRoles(q: Queryable = this.db): Promise<Role[]> {
    const { rows } = await q.query<{
      id: number;
      key: string;
      name: string;
      description: string;
      builtin: boolean;
      permissions: string[];
      user_count: string;
    }>(
      `select r.id, r.key, r.name, r.description, r.builtin,
         coalesce((select array_agg(rp.permission order by rp.permission) from role_permissions rp where rp.role_id = r.id), '{}') as permissions,
         (select count(*) from user_roles ur where ur.role_id = r.id) as user_count
       from roles r order by r.builtin desc, r.id`,
    );
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      builtin: r.builtin,
      permissions:
        r.key === SUPERADMIN_KEY ? [...ALL_PERMISSIONS] : r.permissions.filter(isPermission),
      userCount: Number(r.user_count),
    }));
  }

  async listItems(kind: ListKind): Promise<ListItem[]> {
    const { rows } = await this.db.query<ListItem>(
      `select id, name, active from ${LIST_TABLES[kind].table} order by lower(name)`,
    );
    return rows;
  }

  async listAudit(
    actor: Access,
    options: { limit?: number; beforeId?: number; action?: string } = {},
  ): Promise<AuditEntry[]> {
    need(actor, "audit:view");
    const params: unknown[] = [];
    const where: string[] = [];
    if (options.beforeId) {
      params.push(options.beforeId);
      where.push(`id < $${params.length}`);
    }
    if (options.action) {
      params.push(`${options.action}%`);
      where.push(`action like $${params.length}`);
    }
    params.push(Math.min(Math.max(options.limit ?? 50, 1), 200));
    const { rows } = await this.db.query<{
      id: string;
      at: Date;
      actor_id: string | null;
      actor_login: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      details: Record<string, unknown>;
    }>(
      `select * from audit_log ${where.length ? `where ${where.join(" and ")}` : ""} order by id desc limit $${params.length}`,
      params,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      at: r.at,
      actorId: r.actor_id === null ? null : Number(r.actor_id),
      actorLogin: r.actor_login,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      details: r.details,
    }));
  }

  /** Adds a line to the audit log (also used for sign-ins). */
  async record(entry: AuditInput): Promise<void> {
    await this.writeAudit(this.db, entry);
  }

  // =========================================================== users

  async createUser(actor: Access, input: UserInput): Promise<User> {
    need(actor, "users:manage");
    return withTransaction(this.db, async (tx) => {
      const roles = await this.rolesByIds(tx, input.roleIds);
      if (isPrivileged(roles) && !actor.isSuperadmin) {
        throw new DirectoryError(
          "forbidden",
          "Rolu admin alebo superadmin môže prideliť len superadmin.",
        );
      }
      const user = await this.insertUser(tx, input, roles);
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: "user.create",
        targetType: "user",
        targetId: user.id,
        details: { login: user.login, roles: roles.map((r) => r.key) },
      });
      return user;
    });
  }

  /** Creates the very first superadmin. Refuses when one already exists. */
  async createFirstSuperadmin(input: Omit<UserInput, "roleIds">): Promise<User> {
    return withTransaction(this.db, async (tx) => {
      const existing = await tx.query(
        "select 1 from user_roles ur join roles r on r.id = ur.role_id where r.key = $1 limit 1",
        [SUPERADMIN_KEY],
      );
      if ((existing.rowCount ?? 0) > 0)
        throw new DirectoryError(
          "conflict",
          "Superadmin už existuje. Ďalších pridáva superadmin v aplikácii.",
        );
      const role = (await this.rolesByKeys(tx, [SUPERADMIN_KEY]))[0];
      if (!role)
        throw new DirectoryError("not-found", "Chýba rola superadmin. Spustite migrácie databázy.");
      const user = await this.insertUser(tx, { ...input, roleIds: [role.id] }, [role]);
      await this.writeAudit(tx, {
        actor: { id: null, login: "system" },
        action: "user.create-first-superadmin",
        targetType: "user",
        targetId: user.id,
        details: { login: user.login },
      });
      return user;
    });
  }

  async updateUser(actor: Access, id: number, patch: UserPatch): Promise<User> {
    need(actor, "users:manage");
    return withTransaction(this.db, async (tx) => {
      const target = await this.loadUser(tx, id, true);
      if (!target) throw new DirectoryError("not-found", "Používateľ neexistuje.");
      const self = actor.userId === id;
      if (
        isPrivileged(target.roles) &&
        !actor.isSuperadmin &&
        !(self && patch.roleIds === undefined)
      ) {
        throw new DirectoryError(
          "forbidden",
          "Admina a superadmina môže upravovať len superadmin.",
        );
      }

      const changed: string[] = [];
      const columns: string[] = [];
      const values: unknown[] = [];
      const set = (column: string, value: unknown, label: string) => {
        values.push(value);
        columns.push(`${column} = $${values.length}`);
        changed.push(label);
      };
      this.validateProfile(patch);
      if (patch.email !== undefined && patch.email.trim() !== target.email)
        set("email", patch.email.trim(), "email");
      if (patch.titleBefore !== undefined)
        set("title_before", clean(patch.titleBefore), "titleBefore");
      if (patch.firstName !== undefined) set("first_name", patch.firstName.trim(), "firstName");
      if (patch.lastName !== undefined) set("last_name", patch.lastName.trim(), "lastName");
      if (patch.titleAfter !== undefined) set("title_after", clean(patch.titleAfter), "titleAfter");
      if (patch.position !== undefined) set("position", clean(patch.position), "position");
      if (patch.phone !== undefined) set("phone", clean(patch.phone), "phone");
      if (patch.landline !== undefined) set("landline", clean(patch.landline), "landline");
      if (patch.departmentId !== undefined) {
        await this.requireListItem(tx, "departments", patch.departmentId);
        set("department_id", patch.departmentId, "department");
      }
      if (patch.branchId !== undefined) {
        await this.requireListItem(tx, "branches", patch.branchId);
        set("branch_id", patch.branchId, "branch");
      }

      let roleChange: { added: string[]; removed: string[] } | undefined;
      if (patch.roleIds !== undefined) {
        const next = await this.rolesByIds(tx, patch.roleIds);
        const before = new Set(target.roles.map((r) => r.id));
        const after = new Set(next.map((r) => r.id));
        const added = next.filter((r) => !before.has(r.id));
        const removed = target.roles.filter((r) => !after.has(r.id));
        if (added.length || removed.length) {
          if (
            [...added, ...removed].some((r) => PRIVILEGED_ROLE_KEYS.includes(r.key)) &&
            !actor.isSuperadmin
          ) {
            throw new DirectoryError(
              "forbidden",
              "Rolu admin alebo superadmin môže prideliť alebo odobrať len superadmin.",
            );
          }
          if (self && !actor.isSuperadmin)
            throw new DirectoryError("self-action", "Vlastné roly nemôžete meniť.");
          if (removed.some((r) => r.key === SUPERADMIN_KEY) && target.status === "active") {
            await this.requireAnotherSuperadmin(tx, id);
          }
          roleChange = { added: added.map((r) => r.key), removed: removed.map((r) => r.key) };
          changed.push("roles");
        }
      }

      if (columns.length === 0 && !roleChange) return target;
      try {
        if (columns.length) {
          values.push(id);
          await tx.query(
            `update users set ${columns.join(", ")}, updated_at = now() where id = $${values.length}`,
            values,
          );
        }
        if (roleChange) {
          await tx.query("delete from user_roles where user_id = $1", [id]);
          for (const roleId of patch.roleIds ?? [])
            await tx.query(
              "insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing",
              [id, roleId],
            );
        }
      } catch (error) {
        if (isUniqueViolation(error))
          throw new DirectoryError("conflict", "Používateľ s týmto e-mailom už existuje.");
        throw error;
      }
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: "user.update",
        targetType: "user",
        targetId: id,
        details: {
          login: target.login,
          fields: changed,
          ...(roleChange ? { roles: roleChange } : {}),
        },
      });
      const updated = await this.loadUser(tx, id);
      if (!updated) throw new DirectoryError("not-found", "Používateľ neexistuje.");
      return updated;
    });
  }

  async setStatus(actor: Access, id: number, status: "active" | "disabled"): Promise<User> {
    need(actor, "users:manage");
    return withTransaction(this.db, async (tx) => {
      const target = await this.loadUser(tx, id, true);
      if (!target) throw new DirectoryError("not-found", "Používateľ neexistuje.");
      if (status === "disabled" && actor.userId === id)
        throw new DirectoryError("self-action", "Sám seba nemôžete zablokovať.");
      if (isPrivileged(target.roles) && !actor.isSuperadmin)
        throw new DirectoryError("forbidden", "Admina a superadmina môže blokovať len superadmin.");
      if (status === "disabled") {
        if (target.roles.some((r) => r.key === SUPERADMIN_KEY) && target.status === "active")
          await this.requireAnotherSuperadmin(tx, id);
      }
      if (target.status === status) return target;
      await tx.query(
        "update users set status = $1, disabled_at = $2, updated_at = now() where id = $3",
        [status, status === "disabled" ? new Date() : null, id],
      );
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: status === "disabled" ? "user.disable" : "user.enable",
        targetType: "user",
        targetId: id,
        details: { login: target.login },
      });
      const updated = await this.loadUser(tx, id);
      if (!updated) throw new DirectoryError("not-found", "Používateľ neexistuje.");
      return updated;
    });
  }

  async setPhoto(actor: Access, id: number, data: Buffer): Promise<void> {
    need(actor, "users:manage");
    if (data.length === 0 || data.length > MAX_PHOTO_BYTES)
      throw new DirectoryError("invalid", "Fotografia môže mať najviac 1 MB.");
    const contentType = imageType(data);
    if (!contentType)
      throw new DirectoryError("invalid", "Fotografia musí byť vo formáte JPEG, PNG alebo WebP.");
    await withTransaction(this.db, async (tx) => {
      const target = await this.loadUser(tx, id);
      if (!target) throw new DirectoryError("not-found", "Používateľ neexistuje.");
      if (isPrivileged(target.roles) && !actor.isSuperadmin && actor.userId !== id)
        throw new DirectoryError(
          "forbidden",
          "Admina a superadmina môže upravovať len superadmin.",
        );
      await tx.query(
        `insert into user_photos (user_id, content_type, data) values ($1, $2, $3)
         on conflict (user_id) do update set content_type = excluded.content_type, data = excluded.data, updated_at = now()`,
        [id, contentType, data],
      );
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: "user.photo",
        targetType: "user",
        targetId: id,
        details: { login: target.login },
      });
    });
  }

  async removePhoto(actor: Access, id: number): Promise<void> {
    need(actor, "users:manage");
    await withTransaction(this.db, async (tx) => {
      const target = await this.loadUser(tx, id);
      if (!target) throw new DirectoryError("not-found", "Používateľ neexistuje.");
      if (isPrivileged(target.roles) && !actor.isSuperadmin && actor.userId !== id)
        throw new DirectoryError(
          "forbidden",
          "Admina a superadmina môže upravovať len superadmin.",
        );
      await tx.query("delete from user_photos where user_id = $1", [id]);
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: "user.photo-remove",
        targetType: "user",
        targetId: id,
        details: { login: target.login },
      });
    });
  }

  // =========================================================== roles

  async createRole(
    actor: Access,
    input: { name: string; description?: string; permissions: string[] },
  ): Promise<Role> {
    need(actor, "roles:manage");
    const name = input.name.trim();
    if (name === "" || name.length > 80)
      throw new DirectoryError("invalid", "Názov roly musí mať 1 až 80 znakov.");
    const permissions = this.checkPermissions(actor, input.permissions);
    return withTransaction(this.db, async (tx) => {
      const key = await this.freshRoleKey(tx, name);
      let id: number;
      try {
        id =
          (
            await tx.query<{ id: number }>(
              "insert into roles (key, name, description) values ($1, $2, $3) returning id",
              [key, name, input.description?.trim() ?? ""],
            )
          ).rows[0]?.id ?? 0;
      } catch (error) {
        if (isUniqueViolation(error))
          throw new DirectoryError("conflict", "Rola s týmto názvom už existuje.");
        throw error;
      }
      for (const permission of permissions)
        await tx.query("insert into role_permissions (role_id, permission) values ($1, $2)", [
          id,
          permission,
        ]);
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: "role.create",
        targetType: "role",
        targetId: id,
        details: { key, name, permissions },
      });
      const created = (await this.listRoles(tx)).find((r) => r.id === id);
      if (!created) throw new DirectoryError("not-found", "Rola neexistuje.");
      return created;
    });
  }

  async updateRole(
    actor: Access,
    id: number,
    patch: { name?: string; description?: string; permissions?: string[] },
  ): Promise<Role> {
    need(actor, "roles:manage");
    return withTransaction(this.db, async (tx) => {
      const role = (
        await tx.query<{ id: number; key: string; name: string; builtin: boolean }>(
          "select id, key, name, builtin from roles where id = $1 for update",
          [id],
        )
      ).rows[0];
      if (!role) throw new DirectoryError("not-found", "Rola neexistuje.");
      if (role.key === SUPERADMIN_KEY)
        throw new DirectoryError("forbidden", "Rolu superadmin nemožno upravovať.");
      if (role.builtin && (patch.name !== undefined || patch.description !== undefined)) {
        throw new DirectoryError(
          "forbidden",
          "Názov vstavanej roly sa nedá meniť, upraviť sa dajú len oprávnenia.",
        );
      }
      const details: Record<string, unknown> = { key: role.key };
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (name === "" || name.length > 80)
          throw new DirectoryError("invalid", "Názov roly musí mať 1 až 80 znakov.");
        try {
          await tx.query("update roles set name = $1 where id = $2", [name, id]);
        } catch (error) {
          if (isUniqueViolation(error))
            throw new DirectoryError("conflict", "Rola s týmto názvom už existuje.");
          throw error;
        }
        details["name"] = name;
      }
      if (patch.description !== undefined)
        await tx.query("update roles set description = $1 where id = $2", [
          patch.description.trim(),
          id,
        ]);
      if (patch.permissions !== undefined) {
        const next = this.checkPermissions(actor, patch.permissions);
        const before = new Set(
          (
            await tx.query<{ permission: string }>(
              "select permission from role_permissions where role_id = $1",
              [id],
            )
          ).rows.map((r) => r.permission),
        );
        const added = next.filter((p) => !before.has(p));
        const removed = [...before].filter((p) => !next.includes(p as Permission));
        if (
          [...added, ...removed].some((p) => RESTRICTED_PERMISSIONS.includes(p as Permission)) &&
          !actor.isSuperadmin
        ) {
          throw new DirectoryError("forbidden", "Obmedzené oprávnenia môže meniť len superadmin.");
        }
        await tx.query("delete from role_permissions where role_id = $1", [id]);
        for (const permission of next)
          await tx.query("insert into role_permissions (role_id, permission) values ($1, $2)", [
            id,
            permission,
          ]);
        details["permissions"] = { added, removed };
      }
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: "role.update",
        targetType: "role",
        targetId: id,
        details,
      });
      const updated = (await this.listRoles(tx)).find((r) => r.id === id);
      if (!updated) throw new DirectoryError("not-found", "Rola neexistuje.");
      return updated;
    });
  }

  async deleteRole(actor: Access, id: number): Promise<void> {
    need(actor, "roles:manage");
    await withTransaction(this.db, async (tx) => {
      const role = (
        await tx.query<{ key: string; name: string; builtin: boolean }>(
          "select key, name, builtin from roles where id = $1 for update",
          [id],
        )
      ).rows[0];
      if (!role) throw new DirectoryError("not-found", "Rola neexistuje.");
      if (role.builtin) throw new DirectoryError("forbidden", "Vstavanú rolu nemožno zmazať.");
      const used = await tx.query("select 1 from user_roles where role_id = $1 limit 1", [id]);
      if ((used.rowCount ?? 0) > 0)
        throw new DirectoryError(
          "conflict",
          "Rolu majú pridelenú používatelia. Najprv im ju odoberte.",
        );
      await tx.query("delete from roles where id = $1", [id]);
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: "role.delete",
        targetType: "role",
        targetId: id,
        details: { key: role.key, name: role.name },
      });
    });
  }

  // =========================================================== lists

  async createItem(actor: Access, kind: ListKind, name: string): Promise<ListItem> {
    need(actor, "users:manage");
    const value = name.trim();
    if (value === "" || value.length > 100)
      throw new DirectoryError("invalid", "Názov musí mať 1 až 100 znakov.");
    return withTransaction(this.db, async (tx) => {
      try {
        const row = (
          await tx.query<ListItem>(
            `insert into ${LIST_TABLES[kind].table} (name) values ($1) returning id, name, active`,
            [value],
          )
        ).rows[0];
        if (!row) throw new DirectoryError("invalid", "Záznam sa nepodarilo vytvoriť.");
        await this.writeAudit(tx, {
          actor: { id: actor.userId, login: actor.login },
          action: `${LIST_TABLES[kind].audit}.create`,
          targetType: LIST_TABLES[kind].audit,
          targetId: row.id,
          details: { name: value },
        });
        return row;
      } catch (error) {
        if (isUniqueViolation(error))
          throw new DirectoryError("conflict", "Záznam s týmto názvom už existuje.");
        throw error;
      }
    });
  }

  async updateItem(
    actor: Access,
    kind: ListKind,
    id: number,
    patch: { name?: string; active?: boolean },
  ): Promise<ListItem> {
    need(actor, "users:manage");
    return withTransaction(this.db, async (tx) => {
      const existing = (
        await tx.query<ListItem>(
          `select id, name, active from ${LIST_TABLES[kind].table} where id = $1 for update`,
          [id],
        )
      ).rows[0];
      if (!existing) throw new DirectoryError("not-found", "Záznam neexistuje.");
      const name = patch.name !== undefined ? patch.name.trim() : existing.name;
      if (name === "" || name.length > 100)
        throw new DirectoryError("invalid", "Názov musí mať 1 až 100 znakov.");
      try {
        await tx.query(
          `update ${LIST_TABLES[kind].table} set name = $1, active = $2 where id = $3`,
          [name, patch.active ?? existing.active, id],
        );
      } catch (error) {
        if (isUniqueViolation(error))
          throw new DirectoryError("conflict", "Záznam s týmto názvom už existuje.");
        throw error;
      }
      await this.writeAudit(tx, {
        actor: { id: actor.userId, login: actor.login },
        action: `${LIST_TABLES[kind].audit}.update`,
        targetType: LIST_TABLES[kind].audit,
        targetId: id,
        details: {
          before: { name: existing.name, active: existing.active },
          after: { name, active: patch.active ?? existing.active },
        },
      });
      return { id, name, active: patch.active ?? existing.active };
    });
  }

  // =========================================================== internals

  private async loadUser(q: Queryable, id: number, lock = false): Promise<User | undefined> {
    if (lock) await q.query("select id from users where id = $1 for update", [id]);
    const { rows } = await q.query<UserRow>(`${USER_SELECT} where u.id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : undefined;
  }

  private validateProfile(input: Partial<UserInput>): void {
    const tooLong = (value: string | null | undefined, max: number) => (value?.length ?? 0) > max;
    if (
      input.firstName !== undefined &&
      (input.firstName.trim() === "" || tooLong(input.firstName, 100))
    )
      throw new DirectoryError("invalid", "Meno musí mať 1 až 100 znakov.");
    if (
      input.lastName !== undefined &&
      (input.lastName.trim() === "" || tooLong(input.lastName, 100))
    )
      throw new DirectoryError("invalid", "Priezvisko musí mať 1 až 100 znakov.");
    if (input.email !== undefined && !EMAIL.test(input.email.trim()))
      throw new DirectoryError("invalid", "Neplatná e-mailová adresa.");
    for (const [value, max, label] of [
      [input.titleBefore, 40, "Titul"],
      [input.titleAfter, 40, "Titul"],
      [input.position, 120, "Funkcia"],
      [input.phone, 40, "Telefón"],
      [input.landline, 40, "Pevná linka"],
    ] as const) {
      if (tooLong(value, max)) throw new DirectoryError("invalid", `${label} je príliš dlhý.`);
    }
  }

  private async insertUser(tx: Queryable, input: UserInput, roles: RoleRef[]): Promise<User> {
    const login = input.login.trim().toLowerCase();
    if (!LOGIN.test(login))
      throw new DirectoryError(
        "invalid",
        "Prihlasovacie meno môže mať písmená bez diakritiky, čísla a znaky . _ - @ +.",
      );
    this.validateProfile(input);
    if (input.email === undefined || input.firstName === undefined || input.lastName === undefined)
      throw new DirectoryError("invalid", "Chýbajú povinné údaje.");
    if (roles.length === 0)
      throw new DirectoryError("invalid", "Používateľ musí mať aspoň jednu rolu.");
    if (input.departmentId) await this.requireListItem(tx, "departments", input.departmentId);
    if (input.branchId) await this.requireListItem(tx, "branches", input.branchId);
    let id: number;
    try {
      const row = (
        await tx.query<{ id: string }>(
          `insert into users (login, email, title_before, first_name, last_name, title_after, position, phone, landline, department_id, branch_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
          [
            login,
            input.email.trim(),
            clean(input.titleBefore),
            input.firstName.trim(),
            input.lastName.trim(),
            clean(input.titleAfter),
            clean(input.position),
            clean(input.phone),
            clean(input.landline),
            input.departmentId ?? null,
            input.branchId ?? null,
          ],
        )
      ).rows[0];
      id = Number(row?.id);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DirectoryError(
          "conflict",
          "Používateľ s týmto prihlasovacím menom alebo e-mailom už existuje.",
        );
      throw error;
    }
    for (const role of roles)
      await tx.query("insert into user_roles (user_id, role_id) values ($1, $2)", [id, role.id]);
    const user = await this.loadUser(tx, id);
    if (!user) throw new DirectoryError("not-found", "Používateľ neexistuje.");
    return user;
  }

  private async rolesByIds(q: Queryable, ids: number[]): Promise<RoleRef[]> {
    const unique = [...new Set(ids)];
    const { rows } = await q.query<RoleRef>(
      "select id, key, name from roles where id = any($1::int[]) order by name",
      [unique],
    );
    if (rows.length !== unique.length)
      throw new DirectoryError("invalid", "Niektorá rola neexistuje.");
    return rows;
  }

  private async rolesByKeys(q: Queryable, keys: string[]): Promise<RoleRef[]> {
    const { rows } = await q.query<RoleRef>(
      "select id, key, name from roles where key = any($1::text[])",
      [keys],
    );
    return rows;
  }

  private async requireListItem(q: Queryable, kind: ListKind, id: number | null): Promise<void> {
    if (id === null) return;
    const { rowCount } = await q.query(`select 1 from ${LIST_TABLES[kind].table} where id = $1`, [
      id,
    ]);
    if (!rowCount)
      throw new DirectoryError(
        "invalid",
        kind === "departments" ? "Oddelenie neexistuje." : "Pobočka neexistuje.",
      );
  }

  /** Throws when `excludingUserId` is the only active superadmin. */
  private async requireAnotherSuperadmin(q: Queryable, excludingUserId: number): Promise<void> {
    const { rows } = await q.query<{ n: string }>(
      `select count(*) as n from users u join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id
        where r.key = $1 and u.status = 'active' and u.id <> $2`,
      [SUPERADMIN_KEY, excludingUserId],
    );
    if (Number(rows[0]?.n ?? 0) === 0)
      throw new DirectoryError(
        "last-superadmin",
        "Toto je posledný aktívny superadmin. Najprv ustanovte iného.",
      );
  }

  private checkPermissions(actor: Access, requested: string[]): Permission[] {
    const unknown = requested.filter((p) => !isPermission(p));
    if (unknown.length)
      throw new DirectoryError("invalid", `Neznáme oprávnenie: ${unknown.join(", ")}`);
    const permissions = [...new Set(requested)] as Permission[];
    if (permissions.some((p) => RESTRICTED_PERMISSIONS.includes(p)) && !actor.isSuperadmin) {
      throw new DirectoryError("forbidden", "Obmedzené oprávnenia môže prideľovať len superadmin.");
    }
    return permissions;
  }

  private async freshRoleKey(q: Queryable, name: string): Promise<string> {
    const key =
      name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "rola";
    const { rowCount } = await q.query("select 1 from roles where key = $1", [key]);
    if (rowCount) throw new DirectoryError("conflict", "Rola s týmto názvom už existuje.");
    return key;
  }

  private async writeAudit(q: Queryable, entry: AuditInput): Promise<void> {
    await q.query(
      "insert into audit_log (actor_id, actor_login, action, target_type, target_id, details) values ($1, $2, $3, $4, $5, $6)",
      [
        entry.actor.id,
        entry.actor.login,
        entry.action,
        entry.targetType ?? null,
        entry.targetId === undefined ? null : String(entry.targetId),
        JSON.stringify(entry.details ?? {}),
      ],
    );
  }
}

export { fullName };
