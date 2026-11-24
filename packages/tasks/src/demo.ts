/**
 * Demo tasks for development: turns the mirrored CRM events into tasks, assigns one and adds a
 * local draft. Safe to run repeatedly. Run after `pnpm crm:demo` and `pnpm admin:demo`.
 */
import { createPool, migrate } from "@aquapro/db";
import { Directory } from "@aquapro/directory";
import { TaskService } from "./tasks.js";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("Chýba DATABASE_URL.");
  process.exit(1);
}

const db = createPool({ databaseUrl: url });
try {
  await migrate(db);
  const directory = new Directory(db);
  const tasks = new TaskService(db);
  const users = await directory.listUsers();
  const boss = users.find((u) => u.roles.some((r) => r.key === "superadmin"));
  const ivana = users.find((u) => u.login === "ivana");
  const prijemca = users.find((u) => u.login === "prijemca");
  const actor = boss ? await directory.getAccess(boss.id) : undefined;
  if (!actor || !ivana || !prijemca) {
    console.error("Najprv spustite pnpm admin:demo.");
    process.exit(1);
  }

  const adopted = await tasks.adoptEvents();
  console.log(`Úlohy z CRM: pridaných ${adopted}`);

  const all = await tasks.list(actor);
  const first = all.find((t) => t.source === "crm" && t.owner === null);
  if (first && all.every((t) => t.owner === null)) {
    await tasks.assign(actor, first.id, ivana.id);
    console.log(`Pridelená úloha „${first.title}“ používateľovi ivana`);
  }
  if (!all.some((t) => t.source === "local")) {
    await tasks.createLocal(actor, {
      title: "Zavolať zákazníkovi ohľadom ponuky",
      ownerId: prijemca.id,
    });
    console.log("Vytvorený lokálny návrh úlohy");
  }
  console.log("Hotovo.");
} finally {
  await db.end();
}
