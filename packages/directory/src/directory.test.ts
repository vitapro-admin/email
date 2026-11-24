import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@aquapro/db";
import { createTestDb, TEST_DATABASE_URL } from "@aquapro/db/test-helpers";
import type { Db } from "@aquapro/db";
import { Directory } from "./directory.js";
import { DirectoryError } from "./types.js";
import type { Access, User } from "./types.js";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(20),
]);

describe.skipIf(!TEST_DATABASE_URL)("Directory", () => {
  let db: Db;
  let drop: () => Promise<void>;
  let dir: Directory;
  let boss: User;
  let bossAccess: Access;

  const roleId = async (key: string) => (await dir.listRoles()).find((r) => r.key === key)?.id ?? 0;
  const access = async (u: User) => {
    const a = await dir.getAccess(u.id);
    if (!a) throw new Error("no access");
    return a;
  };
  const person = (login: string, roleIds: number[]) => ({
    login,
    email: `${login}@aquapro.test`,
    firstName: "Test",
    lastName: login,
    roleIds,
  });
  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      if (e instanceof DirectoryError) return e.code;
      throw e;
    }
    return "ok";
  };

  beforeEach(async () => {
    ({ db, drop } = await createTestDb());
    await migrate(db);
    dir = new Directory(db);
    boss = await dir.createFirstSuperadmin({
      login: "boss",
      email: "boss@aquapro.test",
      firstName: "Peter",
      lastName: "Boss",
    });
    bossAccess = await access(boss);
  });
  afterEach(async () => {
    await drop();
  });

  it("superadmin has every permission, only one first superadmin can be created", async () => {
    expect(bossAccess.isSuperadmin).toBe(true);
    expect(bossAccess.permissions.has("roles:manage")).toBe(true);
    expect(
      await code(
        dir.createFirstSuperadmin({
          login: "x",
          email: "x@aquapro.test",
          firstName: "A",
          lastName: "B",
        }),
      ),
    ).toBe("conflict");
  });

  it("admin manages ordinary users but cannot touch privileged roles or users", async () => {
    const admin = await dir.createUser(bossAccess, person("adm", [await roleId("admin")]));
    const adminAccess = await access(admin);
    const clerk = await dir.createUser(adminAccess, person("clerk", [await roleId("obchod")]));
    expect(clerk.roles.map((r) => r.key)).toEqual(["obchod"]);
    expect(await code(dir.createUser(adminAccess, person("evil", [await roleId("admin")])))).toBe(
      "forbidden",
    );
    expect(
      await code(dir.updateUser(adminAccess, clerk.id, { roleIds: [await roleId("superadmin")] })),
    ).toBe("forbidden");
    expect(await code(dir.setStatus(adminAccess, boss.id, "disabled"))).toBe("forbidden");
    expect(await code(dir.updateUser(adminAccess, boss.id, { position: "x" }))).toBe("forbidden");
  });

  it("ordinary user without users:manage is refused", async () => {
    const u = await dir.createUser(bossAccess, person("sales", [await roleId("obchod")]));
    expect(await code(dir.createUser(await access(u), person("z", [await roleId("obchod")])))).toBe(
      "forbidden",
    );
    expect(await code(dir.listAudit(await access(u)))).toBe("forbidden");
  });

  it("protects the last superadmin and self-disable", async () => {
    expect(await code(dir.setStatus(bossAccess, boss.id, "disabled"))).toBe("self-action");
    const second = await dir.createUser(bossAccess, person("second", [await roleId("superadmin")]));
    const secondAccess = await access(second);
    await dir.setStatus(secondAccess, boss.id, "disabled");
    expect(await code(dir.setStatus(secondAccess, second.id, "disabled"))).toBe("self-action");
    expect(await code(dir.setStatus(bossAccess, second.id, "disabled"))).toBe("last-superadmin");
    expect(
      await code(dir.updateUser(secondAccess, second.id, { roleIds: [await roleId("obchod")] })),
    ).toBe("last-superadmin");
  });

  it("disabled user reports status; access is re-read fresh", async () => {
    const u = await dir.createUser(bossAccess, person("temp", [await roleId("obchod")]));
    expect((await dir.getAccess(u.id))?.status).toBe("active");
    await dir.setStatus(bossAccess, u.id, "disabled");
    expect((await dir.getAccess(u.id))?.status).toBe("disabled");
    expect((await dir.resolveLogin("TEMP"))?.userId).toBe(u.id);
    expect((await dir.resolveLogin("temp@aquapro.test"))?.userId).toBe(u.id);
    expect(await dir.resolveLogin("nobody")).toBeUndefined();
  });

  it("custom roles: restricted permissions only by superadmin, builtin protected, delete only unused", async () => {
    const adminRole = await dir.createUser(bossAccess, person("adm", [await roleId("admin")]));
    const adminAccess = await access(adminRole);
    expect(
      await code(dir.createRole(adminAccess, { name: "X", permissions: ["users:view"] })),
    ).toBe("forbidden");
    const role = await dir.createRole(bossAccess, {
      name: "Šéf skladu",
      permissions: ["module:distribution", "tasks:view:all"],
    });
    expect(role.key).toBe("sef_skladu");
    expect(await code(dir.createRole(bossAccess, { name: "šéf skladu", permissions: [] }))).toBe(
      "conflict",
    );
    expect(await code(dir.createRole(bossAccess, { name: "Bad", permissions: ["nonsense"] }))).toBe(
      "invalid",
    );
    expect(
      await code(dir.updateRole(bossAccess, await roleId("superadmin"), { permissions: [] })),
    ).toBe("forbidden");
    expect(await code(dir.updateRole(bossAccess, await roleId("obchod"), { name: "Iné" }))).toBe(
      "forbidden",
    );
    const u = await dir.createUser(bossAccess, person("sklad", [role.id]));
    expect(await code(dir.deleteRole(bossAccess, role.id))).toBe("conflict");
    await dir.updateUser(bossAccess, u.id, { roleIds: [await roleId("obchod")] });
    expect(await code(dir.deleteRole(bossAccess, role.id))).toBe("ok");
    expect(await code(dir.deleteRole(bossAccess, await roleId("obchod")))).toBe("forbidden");
  });

  it("permissions come from all of the user's roles", async () => {
    const role = await dir.createRole(bossAccess, {
      name: "Extra",
      permissions: ["module:finance"],
    });
    const u = await dir.createUser(bossAccess, person("multi", [await roleId("obchod"), role.id]));
    const a = await access(u);
    expect(a.permissions.has("module:finance")).toBe(true);
    expect(a.permissions.has("module:mail")).toBe(true);
    expect(a.permissions.has("users:manage")).toBe(false);
  });

  it("profile, lists, photo and signature name", async () => {
    const dep = await dir.createItem(bossAccess, "departments", "Servis");
    const br = await dir.createItem(bossAccess, "branches", "Košice");
    expect(await code(dir.createItem(bossAccess, "departments", "servis"))).toBe("conflict");
    const u = await dir.createUser(bossAccess, {
      ...person("ivana", [await roleId("obchod")]),
      titleBefore: "Ing.",
      titleAfter: "PhD.",
      position: "Obchod",
      departmentId: dep.id,
      branchId: br.id,
      landline: "055 123 456",
    });
    expect((await access(u)).profile.name).toBe("Ing. Test ivana, PhD.");
    expect(
      await code(
        dir.createUser(bossAccess, {
          ...person("bad", [await roleId("obchod")]),
          departmentId: 9999,
        }),
      ),
    ).toBe("invalid");
    expect(await code(dir.setPhoto(bossAccess, u.id, Buffer.from("not an image")))).toBe("invalid");
    expect(
      await code(dir.setPhoto(bossAccess, u.id, Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]))),
    ).toBe("invalid");
    await dir.setPhoto(bossAccess, u.id, PNG);
    expect((await dir.getPhoto(u.id))?.contentType).toBe("image/png");
    expect((await dir.getUser(u.id))?.hasPhoto).toBe(true);
    await dir.removePhoto(bossAccess, u.id);
    expect(await dir.getPhoto(u.id)).toBeUndefined();
  });

  it("rejects duplicates and invalid input", async () => {
    await dir.createUser(bossAccess, person("dup", [await roleId("obchod")]));
    expect(await code(dir.createUser(bossAccess, person("DUP", [await roleId("obchod")])))).toBe(
      "conflict",
    );
    expect(
      await code(
        dir.createUser(bossAccess, { ...person("ok1", [await roleId("obchod")]), email: "bad" }),
      ),
    ).toBe("invalid");
    expect(await code(dir.createUser(bossAccess, person("ok2", [])))).toBe("invalid");
    expect(await code(dir.createUser(bossAccess, person("ž!", [await roleId("obchod")])))).toBe(
      "invalid",
    );
  });

  it("audit log records changes and cannot be altered", async () => {
    const u = await dir.createUser(bossAccess, person("aud", [await roleId("obchod")]));
    await dir.updateUser(bossAccess, u.id, { position: "Nová" });
    const log = await dir.listAudit(bossAccess);
    expect(log.map((e) => e.action)).toEqual(
      expect.arrayContaining(["user.create", "user.update", "user.create-first-superadmin"]),
    );
    await expect(db.query("update audit_log set action = 'x'")).rejects.toThrow();
    await expect(db.query("delete from audit_log")).rejects.toThrow();
  });

  it("failed change leaves no audit line and no change", async () => {
    const u = await dir.createUser(bossAccess, person("atom", [await roleId("obchod")]));
    const before = (await dir.listAudit(bossAccess)).length;
    expect(
      await code(dir.updateUser(bossAccess, u.id, { position: "X", departmentId: 9999 })),
    ).toBe("invalid");
    expect((await dir.getUser(u.id))?.position).toBeNull();
    expect((await dir.listAudit(bossAccess)).length).toBe(before);
  });
});
