import { createPool, migrate } from "@aquapro/db";
import { Directory } from "@aquapro/directory";
import { TaskService } from "@aquapro/tasks";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
// Without DATABASE_URL (development only) the app uses a simple login with a made-up profile.
const db = config.databaseUrl ? createPool({ databaseUrl: config.databaseUrl }) : undefined;
if (db) await migrate(db);
const app = await buildApp({
  config,
  logger: true,
  ...(db ? { directory: new Directory(db), tasks: new TaskService(db) } : {}),
});
await app.listen({ port: config.port, host: config.host });
