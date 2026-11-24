/** Starts the fake Actiwhere on a fixed port for manual development: pnpm --filter @aquapro/crm-connector mock */
import { MOCK_CREDENTIALS, createMockActiwhere } from "./server.js";

const mock = await createMockActiwhere();
console.log(`Falošný Actiwhere beží: ${mock.url}`);
console.log("Prihlasovacie údaje (vymyslené):", MOCK_CREDENTIALS);
console.log("Ukončenie: Ctrl+C");
process.on("SIGINT", () => void mock.close().then(() => process.exit(0)));
