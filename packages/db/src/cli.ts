/** Applies database migrations: DATABASE_URL=postgres://... pnpm --filter @aquapro/db migrate */
import { migrate } from "./migrate.js";
import { createPool } from "./pool.js";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("Chýba DATABASE_URL.");
  process.exit(1);
}
const db = createPool({ databaseUrl: url });
try {
  const { applied } = await migrate(db);
  console.log(applied.length ? `Použité migrácie: ${applied.join(", ")}` : "Databáza je aktuálna.");
} finally {
  await db.end();
}
