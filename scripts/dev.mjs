/**
 * One command for development: starts the test services (Docker), fills them with synthetic data,
 * starts the API and the web app, and cleans everything up on Ctrl+C.
 *
 *   pnpm dev
 *
 * DEV_SKIP_DOCKER=1  do not touch Docker (services are already running)
 * DEV_KEEP=1         on exit leave the Docker services running
 */
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

const skipDocker = process.env.DEV_SKIP_DOCKER === "1";
const keep = process.env.DEV_KEEP === "1";
const say = (text) => console.log(`\n▶ ${text}`);
const fail = (text) => {
  console.error(`\n✘ ${text}`);
  process.exit(1);
};

const portOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => (socket.destroy(), resolve(false)));
  });

async function waitFor(port, label) {
  for (let i = 0; i < 60; i++) {
    if (await portOpen(port)) return;
    await sleep(1000);
  }
  fail(`${label} sa nespustil do minúty. Skontrolujte, či beží Docker Desktop.`);
}

const run = (command, args) => spawnSync(command, args, { stdio: "inherit" }).status === 0;

for (const [port, what] of [
  [3000, "server aplikácie"],
  [5173, "webová stránka"],
]) {
  if (await portOpen(port)) {
    fail(
      `Na porte ${port} už niečo beží (${what}). Zatvorte staré okná terminálu alebo ich zastavte Ctrl+C a skúste znova.`,
    );
  }
}

let freshMail = true;
if (!skipDocker) {
  say("Kontrolujem Docker");
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    fail("Docker nebeží. Spustite Docker Desktop, počkajte kým sa naštartuje, a skúste znova.");
  }
  freshMail = !(await portOpen(3143));
  say("Spúšťam poštový server a databázu");
  if (!run("docker", ["compose", "-f", "infra/docker-compose.yml", "up", "-d"])) {
    fail("Docker služby sa nepodarilo spustiť.");
  }
}
await waitFor(3143, "Poštový server");
await waitFor(3025, "Poštový server (odosielanie)");
await waitFor(5432, "Databáza");

if (freshMail) {
  say("Napĺňam testovaciu poštu");
  if (!run("pnpm", ["mail:seed"])) fail("Naplnenie testovacej pošty zlyhalo.");
}
say("Pripravujem testovacích používateľov");
if (!run("pnpm", ["admin:demo"])) fail("Vytvorenie testovacích používateľov zlyhalo.");

const children = [];
let stopping = false;

function start(name, script) {
  // Own process group, so the whole tree (pnpm, tsx, vite) can be stopped together.
  const child = spawn("pnpm", [script], { stdio: ["ignore", "pipe", "pipe"], detached: true });
  const pipe = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(`[${name}] ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`\n✘ Proces „${name}“ sa zastavil (kód ${code}). Vypínam všetko.`);
      void shutdown(1);
    }
  });
  children.push(child);
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  say("Zastavujem aplikáciu");
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
  await sleep(500);
  if (!skipDocker && !keep) {
    say("Vypínam poštový server a databázu");
    run("docker", ["compose", "-f", "infra/docker-compose.yml", "down"]);
  }
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

say("Spúšťam aplikáciu");
start("server", "dev:api");
start("web", "dev:web");

for (let i = 0; i < 60 && !((await portOpen(5173)) && (await portOpen(3000))); i++)
  await sleep(500);
console.log(`
══════════════════════════════════════════════════════════════
  Aplikácia beží:  http://localhost:5173

  Prihlásenie (meno = heslo):
    podpora   superadmin (vidí Správu)
    ivana     podpora obchodu
    prijemca  obchod

  Vypnutie: stlačte Ctrl + C v tomto okne.
══════════════════════════════════════════════════════════════
`);
