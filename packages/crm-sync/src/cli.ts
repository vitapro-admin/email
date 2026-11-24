/**
 * Copies data from the CRM into the database (read only).
 *
 *   ACTIWHERE_BASE_URL=... ACTIWHERE_API_KEY=... ACTIWHERE_USERNAME=... ACTIWHERE_PASSWORD=... \
 *   ACTIWHERE_ENVIRONMENT=test DATABASE_URL=postgres://... pnpm crm:sync
 */
import { ActiwhereClient } from "@aquapro/crm-connector";
import { createPool, migrate } from "@aquapro/db";
import { requestLogger } from "./request-log.js";
import { DEFAULT_SPECS } from "./specs.js";
import { syncEntity } from "./sync.js";

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Chýba premenná ${name}.`);
    process.exit(1);
  }
  return value;
}

const environment = need("ACTIWHERE_ENVIRONMENT");
if (environment !== "test" && environment !== "production") {
  console.error("ACTIWHERE_ENVIRONMENT musí byť „test“ alebo „production“.");
  process.exit(1);
}
// Reading live data into a development database is what we must avoid; it needs a deliberate unlock.
if (
  environment === "production" &&
  process.env["ACTIWHERE_PRODUCTION_READ"] !== "CITAM-ZIVE-DATA"
) {
  console.error(
    "Čítanie zo živého CRM je zamknuté. Vývoj a skúšky patria na testovacie prostredie.",
  );
  process.exit(1);
}

const db = createPool({ databaseUrl: need("DATABASE_URL") });
try {
  await migrate(db);
  const client = new ActiwhereClient(
    {
      baseUrl: need("ACTIWHERE_BASE_URL"),
      apiKey: need("ACTIWHERE_API_KEY"),
      username: need("ACTIWHERE_USERNAME"),
      password: need("ACTIWHERE_PASSWORD"),
      environment,
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
} finally {
  await new Promise((resolve) => setTimeout(resolve, 100)); // let the request log finish
  await db.end();
}
