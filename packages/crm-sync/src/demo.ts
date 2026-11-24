/**
 * Demonstration without any real CRM: starts the fake Actiwhere, copies its data into the local
 * database and prints the result. Run with: pnpm crm:demo (needs pnpm mail:up first).
 */
import { ActiwhereClient } from "@aquapro/crm-connector";
import { MOCK_CREDENTIALS, createMockActiwhere } from "@aquapro/crm-connector/mock";
import { createPool, getRecords, migrate } from "@aquapro/db";
import { requestLogger } from "./request-log.js";
import { DEFAULT_SPECS } from "./specs.js";
import { syncEntity } from "./sync.js";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("Chýba DATABASE_URL.");
  process.exit(1);
}
const mock = await createMockActiwhere();
const db = createPool({ databaseUrl: url });
try {
  await migrate(db);
  const client = new ActiwhereClient(
    {
      baseUrl: mock.url,
      apiKey: MOCK_CREDENTIALS.key,
      username: MOCK_CREDENTIALS.username,
      password: MOCK_CREDENTIALS.password,
      environment: "test",
      writes: "off",
    },
    { onRequest: requestLogger(db) },
  );
  for (const spec of DEFAULT_SPECS) {
    const r = await syncEntity(client, db, spec);
    console.log(
      `${r.entity}: načítaných ${r.fetched}, nových ${r.inserted}, zmenených ${r.updated}, bez zmeny ${r.unchanged}, odstránených ${r.removed}`,
    );
  }
  const customers = await getRecords(db, "customers");
  console.log("\nUložení zákazníci (vymyslení):");
  for (const c of customers) console.log(` - ${c.crmId}: ${String(c.data["name"])}`);
} finally {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await db.end();
  await mock.close();
}
