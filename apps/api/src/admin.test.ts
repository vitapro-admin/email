import { InMemoryMailGateway } from "@aquapro/mail-gateway";
import { migrate } from "@aquapro/db";
import { createTestDb, TEST_DATABASE_URL } from "@aquapro/db/test-helpers";
import { Directory } from "@aquapro/directory";
import type { Access } from "@aquapro/directory";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(20),
]);

describe.skipIf(!TEST_DATABASE_URL)("directory in the API", () => {
  let app: FastifyInstance;
  let directory: Directory;
  let drop: () => Promise<void>;
  let boss: Access;
  const clock = { now: 1_000_000 };

  const roleId = async (key: string) =>
    (await directory.listRoles()).find((r) => r.key === key)?.id ?? 0;

  const call = (
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    options: { cookie?: string; body?: unknown; raw?: Buffer } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(method !== "GET" ? { "x-aq-client": "web" } : {}),
        ...(options.raw ? { "content-type": "application/octet-stream" } : {}),
      },
      ...(options.cookie ? { cookies: { aq_session: options.cookie } } : {}),
      ...(options.raw
        ? { payload: options.raw }
        : options.body !== undefined
          ? { payload: options.body as object }
          : {}),
    });

  const login = async (username: string) => {
    const res = await call("POST", "/api/login", { body: { username, password: "tajne" } });
    return { res, cookie: res.cookies.find((c) => c.name === "aq_session")?.value ?? "" };
  };

  beforeEach(async () => {
    let db;
    ({ db, drop } = await createTestDb());
    await migrate(db);
    directory = new Directory(db);
    const first = await directory.createFirstSuperadmin({
      login: "boss",
      email: "boss@aquapro.test",
      firstName: "Peter",
      lastName: "Boss",
    });
    const access = await directory.getAccess(first.id);
    if (!access) throw new Error("no access");
    boss = access;
    await directory.createUser(boss, {
      login: "ivana",
      email: "ivana@aquapro.test",
      titleBefore: "Ing.",
      firstName: "Ivana",
      lastName: "Kováčová",
      position: "Podpora obchodu",
      phone: "+421 900 000 201",
      landline: "055 123 456",
      roleIds: [await roleId("podpora_obchodu")],
    });
    app = await buildApp({
      config: loadConfig({}),
      directory,
      createGateway: () => new InMemoryMailGateway({ INBOX: [] }),
      authenticate: async (_u, p) => p === "tajne",
      now: () => clock.now,
    });
  });
  afterEach(async () => {
    await app.close();
    await drop();
  });

  it("logs in with the profile from the directory and returns permissions", async () => {
    const { res } = await login("ivana");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      name: "Ing. Ivana Kováčová",
      role: "Podpora obchodu",
      email: "ivana@aquapro.test",
      phone: "+421 900 000 201",
      landline: "055 123 456",
    });
    expect(body.permissions).toContain("module:mail");
    expect(body.permissions).not.toContain("users:manage");
    expect(body.isSuperadmin).toBe(false);
  });

  it("refuses people who are not in the directory or are blocked", async () => {
    expect((await login("stranger")).res.statusCode).toBe(403);
    const user = (await directory.listUsers()).find((u) => u.login === "ivana");
    await directory.setStatus(boss, user?.id ?? 0, "disabled");
    expect((await login("ivana")).res.statusCode).toBe(403);
    const log = await directory.listAudit(boss);
    expect(log.filter((e) => e.action === "auth.denied")).toHaveLength(2);
  });

  it("ends an open session shortly after the account is blocked", async () => {
    const { cookie } = await login("ivana");
    expect((await call("GET", "/api/me", { cookie })).statusCode).toBe(200);
    const user = (await directory.listUsers()).find((u) => u.login === "ivana");
    await directory.setStatus(boss, user?.id ?? 0, "disabled");
    clock.now += 11_000;
    expect((await call("GET", "/api/me", { cookie })).statusCode).toBe(401);
    expect((await call("GET", "/api/me", { cookie })).statusCode).toBe(401);
  });

  it("a person without permission cannot use administration", async () => {
    const { cookie } = await login("ivana");
    expect((await call("GET", "/api/admin/users", { cookie })).statusCode).toBe(403);
    expect((await call("GET", "/api/admin/audit", { cookie })).statusCode).toBe(403);
    const res = await call("POST", "/api/admin/users", {
      cookie,
      body: { login: "x", email: "x@aquapro.test", firstName: "A", lastName: "B", roleIds: [1] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("superadmin creates a user, changes a role and sees everything in the audit log", async () => {
    const { cookie } = await login("boss");
    const roles = (await call("GET", "/api/admin/roles", { cookie })).json().roles as {
      id: number;
      key: string;
    }[];
    const obchod = roles.find((r) => r.key === "obchod")?.id;
    const created = await call("POST", "/api/admin/users", {
      cookie,
      body: {
        login: "marek",
        email: "marek@aquapro.test",
        firstName: "Marek",
        lastName: "Nový",
        roleIds: [obchod],
      },
    });
    expect(created.statusCode).toBe(200);
    const id = created.json().user.id as number;
    const dup = await call("POST", "/api/admin/users", {
      cookie,
      body: {
        login: "marek",
        email: "m2@aquapro.test",
        firstName: "M",
        lastName: "N",
        roleIds: [obchod],
      },
    });
    expect(dup.statusCode).toBe(409);
    const patched = await call("PATCH", `/api/admin/users/${id}`, {
      cookie,
      body: { position: "Obchodník" },
    });
    expect(patched.json().user.position).toBe("Obchodník");
    expect(
      (await call("PATCH", `/api/admin/users/${id}`, { cookie, body: { email: "zle" } }))
        .statusCode,
    ).toBe(400);
    const audit = (await call("GET", "/api/admin/audit", { cookie })).json().entries as {
      action: string;
    }[];
    expect(audit.map((e) => e.action)).toEqual(
      expect.arrayContaining(["user.create", "user.update", "auth.login"]),
    );
  });

  it("admin cannot grant admin role or block the superadmin", async () => {
    const adminUser = await directory.createUser(boss, {
      login: "adm",
      email: "adm@aquapro.test",
      firstName: "Ad",
      lastName: "Min",
      roleIds: [await roleId("admin")],
    });
    const { cookie } = await login("adm");
    expect((await call("GET", "/api/admin/users", { cookie })).statusCode).toBe(200);
    const ivana = (await directory.listUsers()).find((u) => u.login === "ivana");
    const grant = await call("PATCH", `/api/admin/users/${ivana?.id}`, {
      cookie,
      body: { roleIds: [await roleId("admin")] },
    });
    expect(grant.statusCode).toBe(403);
    const block = await call("POST", `/api/admin/users/${boss.userId}/status`, {
      cookie,
      body: { status: "disabled" },
    });
    expect(block.statusCode).toBe(403);
    const self = await call("POST", `/api/admin/users/${adminUser.id}/status`, {
      cookie,
      body: { status: "disabled" },
    });
    expect(self.statusCode).toBe(409);
  });

  it("stores a profile photo and serves it to signed-in users only", async () => {
    const { cookie } = await login("boss");
    const ivana = (await directory.listUsers()).find((u) => u.login === "ivana");
    const bad = await call("PUT", `/api/admin/users/${ivana?.id}/photo`, {
      cookie,
      raw: Buffer.from("not an image"),
    });
    expect(bad.statusCode).toBe(400);
    const ok = await call("PUT", `/api/admin/users/${ivana?.id}/photo`, { cookie, raw: PNG });
    expect(ok.statusCode).toBe(200);
    const photo = await call("GET", `/api/users/${ivana?.id}/photo`, { cookie });
    expect(photo.headers["content-type"]).toBe("image/png");
    expect(photo.headers["x-content-type-options"]).toBe("nosniff");
    expect((await call("GET", `/api/users/${ivana?.id}/photo`)).statusCode).toBe(401);
  });

  it("lists of departments are readable by everyone, changed only by managers", async () => {
    const mgr = await login("boss");
    const created = await call("POST", "/api/admin/lists/departments", {
      cookie: mgr.cookie,
      body: { name: "Servis" },
    });
    expect(created.statusCode).toBe(200);
    const staff = await login("ivana");
    const items = (await call("GET", "/api/lists/departments", { cookie: staff.cookie })).json()
      .items;
    expect(items).toEqual([expect.objectContaining({ name: "Servis" })]);
    const denied = await call("POST", "/api/admin/lists/departments", {
      cookie: staff.cookie,
      body: { name: "X" },
    });
    expect(denied.statusCode).toBe(403);
    expect((await call("GET", "/api/lists/nonsense", { cookie: staff.cookie })).statusCode).toBe(
      400,
    );
  });
});
