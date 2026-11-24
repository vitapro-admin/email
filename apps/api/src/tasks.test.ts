import { InMemoryMailGateway } from "@aquapro/mail-gateway";
import { ensureEnvironment, migrate, upsertRecords } from "@aquapro/db";
import { createTestDb, TEST_DATABASE_URL } from "@aquapro/db/test-helpers";
import { Directory } from "@aquapro/directory";
import { TaskService } from "@aquapro/tasks";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

describe.skipIf(!TEST_DATABASE_URL)("tasks in the API", () => {
  let app: FastifyInstance;
  let drop: () => Promise<void>;
  let ids: Record<string, number>;

  const call = (
    method: "GET" | "POST",
    url: string,
    options: { cookie?: string; body?: unknown } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: method === "POST" ? { "x-aq-client": "web" } : {},
      ...(options.cookie ? { cookies: { aq_session: options.cookie } } : {}),
      ...(options.body !== undefined ? { payload: options.body as object } : {}),
    });

  const login = async (username: string) => {
    const res = await call("POST", "/api/login", { body: { username, password: "tajne" } });
    return res.cookies.find((c) => c.name === "aq_session")?.value ?? "";
  };

  beforeEach(async () => {
    const created = await createTestDb();
    drop = created.drop;
    const db = created.db;
    await migrate(db);
    const directory = new Directory(db);
    const first = await directory.createFirstSuperadmin({
      login: "boss",
      email: "boss@aquapro.test",
      firstName: "Peter",
      lastName: "Boss",
    });
    const boss = await directory.getAccess(first.id);
    if (!boss) throw new Error("no access");
    const roles = await directory.listRoles();
    const role = (key: string) => roles.find((r) => r.key === key)?.id ?? 0;
    const department = await directory.createItem(boss, "departments", "Podpora");
    ids = {};
    for (const [login, roleKey, dep] of [
      ["ivana", "podpora_obchodu", department.id],
      ["marek", "obchod", null],
    ] as const) {
      const user = await directory.createUser(boss, {
        login,
        email: `${login}@aquapro.test`,
        firstName: login,
        lastName: "Test",
        roleIds: [role(roleKey)],
        departmentId: dep,
      });
      ids[login] = user.id;
    }
    await ensureEnvironment(db, "test");
    await upsertRecords(db, "events", [
      { crmId: "9921", data: { eventId: 9921, subject: "Servisný interval", statusId: 1 } },
      { crmId: "9934", data: { eventId: 9934, subject: "Dopyt na dávkovače", statusId: 1 } },
    ]);
    app = await buildApp({
      config: loadConfig({}),
      directory,
      tasks: new TaskService(db),
      createGateway: () => new InMemoryMailGateway({ INBOX: [] }),
      authenticate: async (_u, p) => p === "tajne",
    });
  });
  afterEach(async () => {
    await app.close();
    await drop();
  });

  it("needs a login", async () => {
    expect((await call("GET", "/api/tasks")).statusCode).toBe(401);
  });

  it("support sees unassigned CRM events, assigns them, and the owner then sees them", async () => {
    const support = await login("ivana");
    const list = (await call("GET", "/api/tasks", { cookie: support })).json().tasks as {
      id: number;
      title: string;
      owner: unknown;
    }[];
    expect(list.map((t) => t.title).sort()).toEqual(["Dopyt na dávkovače", "Servisný interval"]);

    const sales = await login("marek");
    expect((await call("GET", "/api/tasks", { cookie: sales })).json().tasks).toEqual([]);

    const first = list[0];
    if (!first) throw new Error("no task");
    const assigned = await call("POST", `/api/tasks/${first.id}/assign`, {
      cookie: support,
      body: { ownerId: ids["marek"] },
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json().task.owner).toMatchObject({ id: ids["marek"] });

    const mine = (await call("GET", "/api/tasks?scope=mine", { cookie: sales })).json().tasks;
    expect(mine).toHaveLength(1);
    expect((await call("GET", `/api/tasks/${first.id}`, { cookie: sales })).statusCode).toBe(200);
  });

  it("refuses assignment and creation without permission, and hidden tasks look missing", async () => {
    const support = await login("ivana");
    const sales = await login("marek");
    const list = (await call("GET", "/api/tasks", { cookie: support })).json().tasks as {
      id: number;
    }[];
    const id = list[0]?.id ?? 0;
    expect(
      (
        await call("POST", `/api/tasks/${id}/assign`, {
          cookie: sales,
          body: { ownerId: ids["marek"] },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await call("POST", "/api/tasks", { cookie: sales, body: { title: "X" } })).statusCode,
    ).toBe(403);
    expect((await call("GET", `/api/tasks/${id}`, { cookie: sales })).statusCode).toBe(404);
    expect((await call("GET", "/api/task-assignees", { cookie: sales })).statusCode).toBe(403);
  });

  it("creates a local task and validates the input", async () => {
    const support = await login("ivana");
    const made = await call("POST", "/api/tasks", {
      cookie: support,
      body: { title: "Zavolať zákazníkovi", ownerId: ids["marek"] },
    });
    expect(made.statusCode).toBe(200);
    expect(made.json().task).toMatchObject({ source: "local", status: "Návrh" });
    expect(
      (await call("POST", "/api/tasks", { cookie: support, body: { title: "   " } })).statusCode,
    ).toBe(400);
    expect(
      (await call("POST", "/api/tasks", { cookie: support, body: { nope: 1 } })).statusCode,
    ).toBe(400);
    expect((await call("GET", "/api/tasks?scope=bad", { cookie: support })).statusCode).toBe(400);
    const assignees = (await call("GET", "/api/task-assignees", { cookie: support })).json().users;
    expect(assignees.length).toBeGreaterThan(2);
  });
});
