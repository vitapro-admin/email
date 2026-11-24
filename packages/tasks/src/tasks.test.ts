import { ensureEnvironment, migrate, upsertRecords } from "@aquapro/db";
import type { Db } from "@aquapro/db";
import { createTestDb, TEST_DATABASE_URL } from "@aquapro/db/test-helpers";
import { Directory } from "@aquapro/directory";
import type { Access } from "@aquapro/directory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskError, TaskService } from "./tasks.js";

describe.skipIf(!TEST_DATABASE_URL)("TaskService", () => {
  let db: Db;
  let drop: () => Promise<void>;
  let dir: Directory;
  let tasks: TaskService;
  let boss: Access;
  let support: Access; // podpora_obchodu in department "Podpora"
  let colleague: Access; // podpora_obchodu in the same department
  let sales: Access; // obchod in department "Obchod"
  let outsider: Access; // no task permission at all

  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      if (e instanceof TaskError) return e.code;
      throw e;
    }
    return "ok";
  };

  const access = async (id: number): Promise<Access> => {
    const a = await dir.getAccess(id);
    if (!a) throw new Error("no access");
    return a;
  };

  beforeEach(async () => {
    ({ db, drop } = await createTestDb());
    await migrate(db);
    dir = new Directory(db);
    tasks = new TaskService(db);
    const first = await dir.createFirstSuperadmin({
      login: "boss",
      email: "boss@aquapro.test",
      firstName: "Peter",
      lastName: "Boss",
    });
    boss = await access(first.id);
    // A role that sees only the tasks of the person's department (no managing).
    await dir.createRole(boss, {
      name: "Oddelenie",
      permissions: ["module:mail", "tasks:view:department"],
    });
    const roles = await dir.listRoles();
    const role = (key: string) => roles.find((r) => r.key === key)?.id ?? 0;
    const support1 = await dir.createItem(boss, "departments", "Podpora");
    const sales1 = await dir.createItem(boss, "departments", "Obchod");
    const make = async (login: string, roleKey: string, departmentId: number | null) =>
      access(
        (
          await dir.createUser(boss, {
            login,
            email: `${login}@aquapro.test`,
            firstName: login,
            lastName: "Test",
            roleIds: [role(roleKey)],
            departmentId,
          })
        ).id,
      );
    support = await make("ivana", "podpora_obchodu", support1.id);
    colleague = await make("jana", "oddelenie", support1.id);
    sales = await make("marek", "obchod", sales1.id);
    outsider = await make("tech", "technicke_zabezpecenie", null);
    const noTasks = await dir.createRole(boss, { name: "Len pošta", permissions: ["module:mail"] });
    outsider = await access(
      (
        await dir.createUser(boss, {
          login: "len",
          email: "len@aquapro.test",
          firstName: "Len",
          lastName: "Posta",
          roleIds: [noTasks.id],
        })
      ).id,
    );

    await ensureEnvironment(db, "test");
    await upsertRecords(db, "events", [
      {
        crmId: "9921",
        data: {
          eventId: 9921,
          subject: "Servisný interval",
          statusId: 1,
          categoryId: 2,
          priorityId: 3,
          customerId: 86858,
        },
      },
      {
        crmId: "9934",
        data: {
          eventId: 9934,
          subject: "Dopyt na dávkovače",
          statusId: 2,
          categoryId: 2,
          priorityId: 1,
        },
      },
    ]);
    await upsertRecords(db, "customers", [
      { crmId: "86858", data: { customerId: 86858, name: "Hotel Panoráma" } },
    ]);
    await upsertRecords(db, "ref:eventStatuses", [
      { crmId: "1", data: { id: 1, name: "Otvorený" } },
      { crmId: "2", data: { id: 2, name: "Uzavretý" } },
    ]);
  });
  afterEach(async () => {
    await drop();
  });

  it("creates a task for every CRM event once and ignores removed events", async () => {
    expect(await tasks.adoptEvents()).toBe(2);
    expect(await tasks.adoptEvents()).toBe(0);
    await db.query(
      "update crm_records set removed_at = now() where entity = 'events' and crm_id = '9934'",
    );
    await upsertRecords(db, "events", [
      { crmId: "7000", data: { eventId: 7000, subject: "Nový" } },
    ]);
    expect(await tasks.adoptEvents()).toBe(1);
  });

  it("shows CRM content read-only with readable names, falling back to ids", async () => {
    await tasks.adoptEvents();
    const list = await tasks.list(boss);
    const a = list.find((t) => t.crmEventId === "9921");
    expect(a).toMatchObject({
      title: "Servisný interval",
      status: "Otvorený",
      customerName: "Hotel Panoráma",
      priority: "Priorita 3",
      source: "crm",
      owner: null,
    });
    expect(list.find((t) => t.crmEventId === "9934")?.status).toBe("Uzavretý");
  });

  it("applies visibility: all, own, department, unassigned for managers, nothing without permission", async () => {
    await tasks.adoptEvents();
    const [a, b] = (await tasks.list(boss)).sort((x, y) => x.id - y.id);
    if (!a || !b) throw new Error("tasks missing");
    await tasks.assign(boss, a.id, support.userId); // ivana
    await tasks.assign(boss, b.id, sales.userId); // marek

    expect((await tasks.list(boss)).length).toBe(2);
    // a colleague with department rights sees only tasks owned by people of the same department
    expect((await tasks.list(colleague)).map((t) => t.id)).toEqual([a.id]);
    // sales sees only their own
    expect((await tasks.list(sales)).map((t) => t.id)).toEqual([b.id]);
    // support manages tasks, so it sees all of them, also after handing them over
    expect((await tasks.list(support)).length).toBe(2);
    await expect(tasks.list(outsider)).rejects.toThrow(TaskError);
    expect(await code(tasks.get(sales, a.id))).toBe("not-found");
    expect(await code(tasks.get(colleague, a.id))).toBe("ok");
    expect(await code(tasks.get(colleague, b.id))).toBe("not-found");

    // an unassigned task is invisible to department colleagues and to sales, visible to support
    await tasks.assign(boss, a.id, null);
    expect(await tasks.list(colleague)).toEqual([]);
    expect(await code(tasks.get(sales, a.id))).toBe("not-found");
    expect(await code(tasks.get(support, a.id))).toBe("ok");
  });

  it("creates local tasks only for managers and validates input", async () => {
    expect(await code(tasks.createLocal(sales, { title: "X" }))).toBe("forbidden");
    expect(await code(tasks.createLocal(support, { title: "   " }))).toBe("invalid");
    const made = await tasks.createLocal(support, {
      title: "Zavolať zákazníkovi",
      ownerId: sales.userId,
    });
    expect(made).toMatchObject({
      source: "local",
      title: "Zavolať zákazníkovi",
      status: "Návrh",
      owner: { id: sales.userId },
    });
    expect((await tasks.list(sales)).map((t) => t.id)).toContain(made.id);
    // the creator keeps sight of what they created, even after handing it over
    expect((await tasks.list(support)).map((t) => t.id)).toContain(made.id);
    expect(await code(tasks.createLocal(support, { title: "Y", ownerId: 99999 }))).toBe("invalid");
  });

  it("assignment needs permission, a visible task and an active user, and is audited", async () => {
    await tasks.adoptEvents();
    const a = (await tasks.list(boss))[0];
    if (!a) throw new Error("no task");
    expect(await code(tasks.assign(sales, a.id, sales.userId))).toBe("forbidden");
    await dir.setStatus(boss, marek(sales), "disabled");
    expect(await code(tasks.assign(boss, a.id, sales.userId))).toBe("invalid");
    expect(await code(tasks.assign(boss, 424242, support.userId))).toBe("not-found");
    await tasks.assign(support, a.id, colleague.userId);
    const audit = await dir.listAudit(boss);
    expect(audit.find((e) => e.action === "task.assign")?.details).toMatchObject({
      to: colleague.userId,
    });
    expect((await tasks.assignees(support)).map((u) => u.name)).not.toContain("marek Test");
  });

  it("filters by search text and scope", async () => {
    await tasks.adoptEvents();
    await tasks.assign(
      boss,
      (await tasks.list(boss)).find((t) => t.crmEventId === "9921")?.id ?? 0,
      boss.userId,
    );
    expect((await tasks.list(boss, { search: "dávkov" })).map((t) => t.crmEventId)).toEqual([
      "9934",
    ]);
    expect((await tasks.list(boss, { scope: "mine" })).map((t) => t.crmEventId)).toEqual(["9921"]);
    expect((await tasks.list(boss, { scope: "unassigned" })).map((t) => t.crmEventId)).toEqual([
      "9934",
    ]);
  });

  function marek(a: Access): number {
    return a.userId;
  }
});
