/**
 * Administration from the terminal.
 *
 *   Create the very first superadmin (works only while none exists):
 *   DATABASE_URL=postgres://... pnpm --filter @aquapro/directory admin first-superadmin \
 *     --login peter --email peter@firma.sk --first Peter --last Ivan
 *
 *   Demo users for development (matching the test mailboxes):
 *   DATABASE_URL=postgres://... pnpm --filter @aquapro/directory admin demo
 */
import { createPool, migrate } from "@aquapro/db";
import { Directory } from "./directory.js";
import { DirectoryError } from "./types.js";

const args = process.argv.slice(2);
const command = args[0];
const option = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const url = process.env["DATABASE_URL"];
if (!url || !command) {
  console.error(
    "Použitie: DATABASE_URL=... admin <first-superadmin|demo> [--login ... --email ... --first ... --last ...]",
  );
  process.exit(1);
}
if (/^postgres(ql)?:\/\/[^@]*@[^/]*\.(amazonaws|azure|googleusercontent)/.test(url)) {
  console.error("Tento príkaz je určený na vývoj, nie na cudziu databázu.");
  process.exit(1);
}

const db = createPool({ databaseUrl: url });
try {
  await migrate(db);
  const directory = new Directory(db);

  if (command === "first-superadmin") {
    const login = option("login");
    const email = option("email");
    const firstName = option("first");
    const lastName = option("last");
    if (!login || !email || !firstName || !lastName) {
      console.error("Chýbajú údaje: --login, --email, --first, --last");
      process.exit(1);
    }
    const user = await directory.createFirstSuperadmin({
      login,
      email,
      firstName,
      lastName,
      titleBefore: option("title-before") ?? null,
      titleAfter: option("title-after") ?? null,
      position: option("position") ?? "Superadmin",
    });
    console.log(`Vytvorený superadmin: ${user.login} (${user.email})`);
  } else if (command === "demo") {
    const roles = await directory.listRoles();
    const roleId = (key: string) => roles.find((r) => r.key === key)?.id ?? 0;
    const existing = new Set((await directory.listUsers()).map((u) => u.login));
    let boss = (await directory.listUsers()).find((u) =>
      u.roles.some((r) => r.key === "superadmin"),
    );
    if (!boss)
      boss = await directory.createFirstSuperadmin({
        login: "podpora",
        email: "podpora@aquapro.test",
        firstName: "Peter",
        lastName: "Správca",
        position: "Superadmin",
        phone: "+421 900 000 200",
      });
    const actor = await directory.getAccess(boss.id);
    if (!actor) throw new Error("Nepodarilo sa načítať správcu.");
    const demo = [
      {
        login: "ivana",
        email: "ivana@aquapro.test",
        titleBefore: "Ing.",
        firstName: "Ivana",
        lastName: "Kováčová",
        position: "Podpora obchodu",
        phone: "+421 900 000 201",
        roleIds: [roleId("podpora_obchodu")],
      },
      {
        login: "integracia",
        email: "integracia@aquapro.test",
        firstName: "Marek",
        lastName: "Servis",
        position: "Servisný technik",
        roleIds: [roleId("servis")],
      },
      {
        login: "prijemca",
        email: "prijemca@aquapro.test",
        firstName: "Zuzana",
        lastName: "Obchodná",
        titleAfter: "MBA",
        position: "Obchodníčka",
        roleIds: [roleId("obchod")],
      },
    ];
    // Departments and branches, so that tasks "of the department" and the profile lists work.
    const departmentNames = ["Podpora obchodu", "Obchod", "Servis"];
    const have = new Map((await directory.listItems("departments")).map((d) => [d.name, d.id]));
    for (const name of departmentNames) {
      if (!have.has(name))
        have.set(name, (await directory.createItem(actor, "departments", name)).id);
    }
    if ((await directory.listItems("branches")).length === 0) {
      await directory.createItem(actor, "branches", "Bratislava");
    }
    const departmentOf: Record<string, string> = {
      ivana: "Podpora obchodu",
      integracia: "Servis",
      prijemca: "Obchod",
    };
    for (const user of demo) {
      const departmentId = have.get(departmentOf[user.login] ?? "") ?? null;
      if (existing.has(user.login)) {
        // Users created by an earlier version of the demo get their department added.
        const current = (await directory.listUsers()).find((u) => u.login === user.login);
        if (current && current.departmentId === null && departmentId !== null) {
          await directory.updateUser(actor, current.id, { departmentId });
          console.log(`Doplnené oddelenie: ${user.login}`);
        }
        continue;
      }
      await directory.createUser(actor, { ...user, departmentId });
      console.log(`Vytvorený používateľ: ${user.login}`);
    }
    console.log("Hotovo. Prihlasovacie heslá sú heslá testovacích schránok.");
  } else {
    console.error(`Neznámy príkaz: ${command}`);
    process.exit(1);
  }
} catch (error) {
  if (error instanceof DirectoryError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
} finally {
  await db.end();
}
