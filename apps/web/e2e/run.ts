/**
 * End-to-end test in a real browser (Chromium): login, reading a hostile message, replying with the
 * restricted editor, previewing, sending, checking delivery, and composing in a second window.
 *
 * Needs the test mailserver running (pnpm mail:up) and the web app built (the "e2e" script builds it).
 * Optional: E2E_SCREENSHOTS=/some/folder saves screenshots. Browsers: pnpm exec playwright install chromium
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createPool, ensureEnvironment, migrate, upsertRecords } from "@aquapro/db";
import { TaskService } from "@aquapro/tasks";
import type { Db } from "@aquapro/db";
import { Directory } from "@aquapro/directory";
import { ImapMailGateway, SmtpMailSender } from "@aquapro/mail-gateway";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

const here = fileURLToPath(new URL(".", import.meta.url));
const webDir = resolve(here, "..");
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const run = String(Date.now());
const shots = process.env["E2E_SCREENSHOTS"];
if (shots) mkdirSync(shots, { recursive: true });

const step = (message: string) => console.log(`• ${message}`);
const screenshot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: resolve(shots, `${name}.png`) });
};

// With a database the app runs with the user directory and the administration is tested too.
// Without one the development login is used and the administration step is skipped.
const dbUrl = process.env["E2E_DATABASE_URL"] ?? process.env["TEST_DATABASE_URL"];
const schema = `e2e_${run}`;
let adminDb: Db | undefined;

async function prepareDirectory(): Promise<string | undefined> {
  if (!dbUrl) return undefined;
  adminDb = createPool({ databaseUrl: dbUrl, searchPath: schema });
  await adminDb.query(`create schema ${schema}`);
  await migrate(adminDb);
  const directory = new Directory(adminDb);
  const boss = await directory.createFirstSuperadmin({
    login: "podpora",
    email: "podpora@aquapro.test",
    firstName: "Peter",
    lastName: "Správca",
    position: "Superadmin",
  });
  const access = await directory.getAccess(boss.id);
  if (!access) throw new Error("Superadmin sa nenačítal.");
  const roles = await directory.listRoles();
  const roleId = (key: string) => roles.find((r) => r.key === key)?.id ?? 0;
  await directory.createUser(access, {
    login: "ivana",
    email: "ivana@aquapro.test",
    firstName: "Ivana",
    lastName: "Test",
    position: "Podpora obchodu",
    roleIds: [roleId("podpora_obchodu")],
  });
  await directory.createUser(access, {
    login: "prijemca",
    email: "prijemca@aquapro.test",
    firstName: "Zuzana",
    lastName: "Obchodná",
    roleIds: [roleId("obchod")],
  });
  // Two CRM events (made up) that become tasks.
  await ensureEnvironment(adminDb, "test");
  await upsertRecords(adminDb, "events", [
    { crmId: "9921", data: { eventId: 9921, subject: "Otázka na servisný interval", statusId: 1 } },
    {
      crmId: "9934",
      data: { eventId: 9934, subject: "Dopyt na prenájom dávkovačov", statusId: 1 },
    },
  ]);
  await upsertRecords(adminDb, "ref:eventStatuses", [
    { crmId: "1", data: { id: 1, name: "Otvorený" } },
  ]);
  await new TaskService(adminDb).adoptEvents();
  return `${dbUrl}${dbUrl.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
}

async function startApi(databaseUrl: string | undefined): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", resolve(webDir, "../api/src/server.ts")],
    {
      cwd: webDir,
      env: {
        ...process.env,
        PORT: String(PORT),
        WEB_DIST: resolve(webDir, "dist"),
        NODE_ENV: "development",
        ...(databaseUrl ? { DATABASE_URL: databaseUrl } : { DATABASE_URL: "" }),
      },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${BASE}/api/me`);
      if (response.status === 401) return child;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  child.kill();
  throw new Error("API sa nespustilo.");
}

async function waitForMailserver() {
  for (let i = 0; i < 20; i++) {
    try {
      const gateway = new ImapMailGateway({
        host: "127.0.0.1",
        port: 3143,
        secure: false,
        user: "ivana",
        password: "ivana",
        allowInvalidCertificates: true,
      });
      await gateway.listFolders();
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error("Testovací mailserver nebeží. Spustite: pnpm mail:up");
}

const smtp = (from: { name: string; email: string }) =>
  new SmtpMailSender({ host: "127.0.0.1", port: 3025, secure: false, requireTls: false, from });

async function adminScenario(browser: Browser, pageErrors: string[]) {
  step("správa: bežný používateľ nevidí položku Správa");
  const staffContext = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const staff = await staffContext.newPage();
  staff.on("pageerror", (e) => pageErrors.push(e.message));
  await staff.goto(BASE);
  await staff.getByLabel("Meno").fill("ivana");
  await staff.getByLabel("Heslo").fill("ivana");
  await staff.getByRole("button", { name: "Prihlásiť" }).click();
  await staff.getByRole("button", { name: "Nová správa" }).waitFor();
  await staff.getByRole("button", { name: /^Účet:/ }).click();
  await staff.getByRole("menuitem", { name: "Odhlásiť" }).waitFor();
  assert.equal(await staff.getByRole("menuitem", { name: "Správa" }).count(), 0);
  const forbidden = await staffContext.request.get(`${BASE}/api/admin/users`);
  assert.equal(forbidden.status(), 403);
  await staffContext.close();

  step("správa: superadmin sa prihlási a otvorí Správu");
  const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(BASE);
  await page.getByLabel("Meno").fill("podpora");
  await page.getByLabel("Heslo").fill("podpora");
  await page.getByRole("button", { name: "Prihlásiť" }).click();
  await page.getByRole("button", { name: "Nová správa" }).waitFor();
  await page.getByRole("button", { name: /^Účet:/ }).click();
  await page.getByRole("menuitem", { name: "Správa" }).click();
  await page.getByRole("heading", { name: "Používatelia" }).waitFor();
  await page.getByRole("button", { name: /Ivana Test/ }).waitFor();
  await screenshot(page, "09-sprava-pouzivatelia");

  step("správa: vytvorenie používateľa, duplicita sa odmietne");
  const createUser = async () => {
    await page.getByRole("button", { name: "Nový používateľ" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Prihlasovacie meno").fill("marek");
    await dialog.getByLabel("E-mail", { exact: true }).fill("marek@aquapro.test");
    await dialog.getByLabel("Meno", { exact: true }).fill("Marek");
    await dialog.getByLabel("Priezvisko").fill("Servisný");
    await dialog.getByLabel("Titul pred menom").fill("Ing.");
    await dialog.getByLabel("Servis", { exact: true }).check();
    await dialog.getByRole("button", { name: "Vytvoriť" }).click();
    return dialog;
  };
  await createUser();
  await page.getByRole("button", { name: /Ing\. Marek Servisný/ }).waitFor();
  const duplicate = await createUser();
  await duplicate.getByRole("alert").filter({ hasText: "už existuje" }).waitFor();
  await duplicate.getByRole("button", { name: "Zavrieť", exact: true }).click();

  step("správa: zablokovanie a odblokovanie účtu");
  await page.getByRole("button", { name: /Ing\. Marek Servisný/ }).click();
  await page.getByRole("button", { name: "Zablokovať účet" }).click();
  await page.getByRole("button", { name: "Odblokovať účet" }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Zavrieť", exact: true }).click();
  await page.getByText("Zablokovaný", { exact: true }).waitFor();

  step("správa: roly, zoznamy a záznam zmien");
  await page.getByRole("button", { name: "Roly" }).click();
  await page.getByRole("button", { name: /Superadmin/ }).click();
  await page.getByText("Superadmin má vždy všetky oprávnenia").waitFor();
  await page.getByRole("button", { name: "Nová rola" }).click();
  await page.getByLabel("Názov").fill("Šéf skladu");
  await page.getByLabel("Distribúcia a trasy").check();
  await page.getByRole("button", { name: "Vytvoriť" }).click();
  await page.getByText("Uložené.").waitFor();
  await screenshot(page, "10-sprava-roly");

  await page.getByRole("button", { name: "Zoznamy" }).click();
  await page.getByLabel("Nová položka: Oddelenia").fill("Servis");
  await page.getByRole("button", { name: "Pridať" }).first().click();
  await page.getByRole("listitem").filter({ hasText: "Servis" }).waitFor();

  await page.getByRole("button", { name: "Záznam zmien" }).click();
  await page.getByRole("cell", { name: "Vytvorená rola" }).waitFor();
  await page.getByRole("cell", { name: "Zablokovaný účet" }).waitFor();
  await screenshot(page, "11-sprava-zaznam");

  step("správa: späť do pošty");
  await page.getByRole("button", { name: "← Späť do pošty" }).click();
  await page.getByRole("button", { name: "Nová správa" }).waitFor();
  await context.close();
}

async function tasksScenario(browser: Browser, pageErrors: string[]) {
  const signIn = async (user: string) => {
    const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(BASE);
    await page.getByLabel("Meno").fill(user);
    await page.getByLabel("Heslo").fill(user);
    await page.getByRole("button", { name: "Prihlásiť" }).click();
    await page.getByRole("button", { name: "Nová správa" }).waitFor();
    return { context, page };
  };

  step("úlohy: podpora vidí úlohy z CRM a pridelí jednu kolegovi");
  const support = await signIn("ivana");
  await support.page.getByRole("tab", { name: "Úlohy" }).click();
  await support.page.getByRole("button", { name: /Otázka na servisný interval/ }).click();
  await support.page.getByRole("heading", { name: "Otázka na servisný interval" }).waitFor();
  await support.page.getByText("Otvorený", { exact: true }).first().waitFor();
  await support.page
    .getByLabel("Vlastník úlohy")
    .selectOption({ label: "prijemca Test" })
    .catch(async () => {
      // the display name comes from the directory: "Zuzana Obchodná"
      await support.page.getByLabel("Vlastník úlohy").selectOption({ label: "Zuzana Obchodná" });
    });
  await support.page.getByText("Úloha bola pridelená.").waitFor();
  await screenshot(support.page, "12-ulohy");

  step("úlohy: nová lokálna úloha");
  await support.page.getByRole("button", { name: "Nová úloha" }).click();
  await support.page.getByRole("dialog").getByLabel("Názov").fill("Zavolať zákazníkovi");
  await support.page.getByRole("dialog").getByRole("button", { name: "Vytvoriť" }).click();
  await support.page.getByRole("heading", { name: "Zavolať zákazníkovi" }).waitFor();
  await support.context.close();

  step("úlohy: kolega vidí len pridelenú úlohu a nemôže ju prideľovať");
  const colleague = await signIn("prijemca");
  await colleague.page.getByRole("tab", { name: "Úlohy" }).click();
  await colleague.page.getByRole("button", { name: /Otázka na servisný interval/ }).click();
  await colleague.page.getByRole("heading", { name: "Otázka na servisný interval" }).waitFor();
  assert.equal(await colleague.page.getByRole("button", { name: /Dopyt na prenájom/ }).count(), 0);
  assert.equal(await colleague.page.getByLabel("Vlastník úlohy").count(), 0);
  assert.equal(await colleague.page.getByRole("button", { name: "Nová úloha" }).count(), 0);
  await colleague.context.close();
}

async function main() {
  await waitForMailserver();
  // E2E_CHROMIUM lets you point to an already installed Chromium instead of the Playwright download.
  const executablePath = process.env["E2E_CHROMIUM"];
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const databaseUrl = await prepareDirectory();
  const api = await startApi(databaseUrl).catch(async (error: unknown) => {
    await browser.close();
    throw error;
  });
  try {
    // A customer writes to ivana. The HTML is hostile on purpose.
    step("zákazník píše Ivane (správa so škodlivým HTML a prílohou)");
    const subject = `Reklamácia ${run}`;
    await smtp({ name: "Jana Horváthová", email: "j.horvathova@hotelpanorama.example" }).send({
      to: [{ email: "ivana@aquapro.test" }],
      subject,
      text: "Dve fľaše majú zakalenú vodu.",
      html: `<p onclick="parent.__pwned=1">Dve fľaše majú <b>zakalenú vodu</b>.</p>
        <script>parent.__pwned = 2</script>
        <img src="x" onerror="parent.__pwned = 3">
        <img src="http://tracker.example/pixel.gif" width="1" height="1">
        <img src="http://tracker.example/banner.png" width="300">
        <a href="https://evil.example/login">https://www.mojabanka.sk/prihlasenie</a>`,
      attachments: [
        { filename: "foto.txt", content: Buffer.from("obsah fotky"), contentType: "text/plain" },
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1360, height: 860 },
      locale: "sk-SK",
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    step("prihlásenie so zlým heslom zlyhá");
    await page.goto(BASE);
    await page.getByLabel("Meno").fill("ivana");
    await page.getByLabel("Heslo").fill("zle-heslo");
    await page.getByRole("button", { name: "Prihlásiť" }).click();
    await page.getByRole("alert").filter({ hasText: "Nesprávne" }).waitFor();
    await screenshot(page, "01-prihlasenie");

    step("prihlásenie so správnym heslom");
    await page.getByLabel("Heslo").fill("ivana");
    await page.getByRole("button", { name: "Prihlásiť" }).click();
    await page.getByRole("button", { name: "Nová správa" }).waitFor();

    step("správa je v zozname a otvorí sa");
    await page.getByRole("button", { name: new RegExp(subject) }).click();
    await page.getByRole("heading", { name: subject }).waitFor();
    const frame = page.frameLocator('iframe[title="Obsah správy"]');
    await frame.getByText("zakalenú vodu").waitFor();
    await screenshot(page, "02-citanie");

    step("škodlivý obsah sa nevykonal, rámec je izolovaný");
    await sleep(500);
    assert.equal(
      await page.evaluate(() => (window as unknown as Record<string, unknown>)["__pwned"]),
      undefined,
    );
    const sandbox = await page.locator('iframe[title="Obsah správy"]').getAttribute("sandbox");
    assert.equal(sandbox, "allow-popups allow-popups-to-escape-sandbox");
    assert.equal(await frame.locator("script").count(), 0);
    assert.equal(await frame.locator('img[src*="tracker.example"]').count(), 0);

    step("upozornenia: zablokované obrázky a podozrivý odkaz");
    await page.getByText("Obrázky z internetu sú zablokované (2)").waitFor();
    await page.getByText("Pozor: správa obsahuje odkaz").waitFor();

    step("príloha sa stiahne ako súbor");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "foto.txt" }).click(),
    ]);
    assert.equal(download.suggestedFilename(), "foto.txt");

    step("odpoveď: predvyplnený príjemca a predmet");
    await page.getByRole("button", { name: "Odpovedať", exact: true }).click();
    const dialog = page.getByRole("region", { name: "Odpoveď" });
    await dialog.getByLabel("Komu").waitFor();
    await page.waitForFunction(() =>
      (document.getElementById("subject") as HTMLInputElement | null)?.value.startsWith("Re:"),
    );
    assert.equal(await dialog.getByLabel("Predmet").inputValue(), `Re: ${subject}`);
    assert.match(
      await dialog.getByLabel("Komu").inputValue(),
      /j\.horvathova@hotelpanorama\.example/,
    );

    step("editor: písanie, tučné a vloženie škaredého textu z Wordu");
    const editor = dialog.getByRole("textbox", { name: "Text správy" });
    await editor.click();
    await page.keyboard.type("Dobrý deň, výmenu zabezpečíme ");
    await page.keyboard.press("Control+b");
    await page.keyboard.type("pri najbližšej dodávke");
    await page.keyboard.press("Control+b");
    await page.keyboard.type(".");
    await page.keyboard.press("Enter");
    await editor.evaluate((node) => {
      const data = new DataTransfer();
      data.setData(
        "text/html",
        '<p style="font-family:Comic Sans MS;font-size:40px;color:red"><span style="font-weight:bold;color:blue">Vložený</span> text <u>podčiarknutý</u><img src="http://tracker.example/x.gif"></p>',
      );
      data.setData("text/plain", "Vložený text podčiarknutý");
      node.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await page.waitForTimeout(300);
    await screenshot(page, "03-pisanie");

    step("náhľad e-mailu: jednotný vzhľad, citácia a podpis, žiadne cudzie štýly");
    await dialog.getByRole("tab", { name: "Náhľad e-mailu" }).click();
    const preview = page.frameLocator('iframe[title="Náhľad e-mailu"]');
    await preview.locator("p", { hasText: "výmenu zabezpečíme" }).first().waitFor();
    const previewHtml = await preview.locator("body").innerHTML();
    assert.match(previewHtml, /Vložený/);
    assert.doesNotMatch(
      previewHtml,
      /Comic Sans|font-size:40px|tracker\.example|<u>|color:red|color:blue/,
    );
    await preview.getByText("zakalenú vodu").first().waitFor();
    assert.ok(await preview.getByText("Ivana").first().isVisible());
    assert.ok(await preview.locator('img[alt="AQUA PRO EUROPE"]').isVisible());
    await screenshot(page, "04-nahlad");

    step("odoslanie príjemcovi");
    await dialog.getByRole("tab", { name: "Písať" }).click();
    await dialog.getByLabel("Komu").fill("prijemca@aquapro.test");
    await dialog.getByRole("button", { name: "Odoslať" }).click();
    await page.getByText("Správa bola odoslaná.").waitFor();

    step("správa dorazila príjemcovi s citáciou, logom a vláknom");
    const recipient = new ImapMailGateway({
      host: "127.0.0.1",
      port: 3143,
      secure: false,
      user: "prijemca",
      password: "prijemca",
      allowInvalidCertificates: true,
    });
    let arrived;
    for (let i = 0; i < 20 && !arrived; i++) {
      arrived = (await recipient.listMessages("INBOX")).find((m) => m.subject === `Re: ${subject}`);
      if (!arrived) await sleep(250);
    }
    assert.ok(arrived, "odpoveď nedorazila");
    const received = await recipient.getMessage("INBOX", arrived.uid);
    assert.equal(received?.from.email, "ivana@aquapro.test");
    assert.match(received?.text ?? "", /výmenu zabezpečíme pri najbližšej dodávke\./);
    assert.match(received?.text ?? "", /> Dve fľaše majú zakalenú vodu\./);
    assert.doesNotMatch(received?.html ?? "", /Comic Sans|font-size:40px|tracker\.example/);
    assert.match(received?.html ?? "", /data:image\/png;base64,/);
    assert.ok(received?.inReplyTo, "chýba In-Reply-To");

    step("kópia je v priečinku Odoslané");
    await page.getByRole("button", { name: /Odoslané/ }).click();
    await page.getByRole("button", { name: new RegExp(`Re: ${subject}`) }).waitFor();
    await screenshot(page, "05-odoslane");

    step("druhé okno: písanie v samostatnom okne, hlavné okno sa obnoví");
    const popup = await context.newPage();
    await popup.goto(`${BASE}/#/compose?mode=new`);
    const popupDialog = popup.getByRole("region", { name: "Nová správa" });
    await popupDialog.getByLabel("Komu").fill("ivana@aquapro.test");
    await popupDialog.getByLabel("Predmet").fill(`Test druhého okna ${run}`);
    await popupDialog.getByRole("textbox", { name: "Text správy" }).click();
    await popup.keyboard.type("Správa z druhého okna.");
    await screenshot(popup, "06-druhe-okno");
    await popupDialog.getByRole("button", { name: "Odoslať" }).click();
    await page.getByRole("button", { name: /Doručená pošta/ }).click();
    await page
      .getByRole("button", { name: new RegExp(`Test druhého okna ${run}`) })
      .waitFor({ timeout: 15_000 });

    step("koncept a príloha: pripojenie súboru, zákaz .exe, automatické uloženie");
    const draftSubject = `Koncept ${run}`;
    await page.getByRole("button", { name: "Nová správa" }).first().click();
    const draftDialog = page.getByRole("region", { name: "Nová správa" });
    await draftDialog.getByLabel("Komu").fill("prijemca@aquapro.test");
    await draftDialog.getByLabel("Predmet").fill(draftSubject);
    await draftDialog.getByRole("textbox", { name: "Text správy" }).click();
    await page.keyboard.type("Rozpísaná správa s prílohou.");
    await draftDialog.getByLabel("Vybrať súbory").setInputFiles({
      name: "cenník ť.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("obsah prílohy"),
    });
    await draftDialog.getByRole("list", { name: "Prílohy" }).getByText("cenník ť.txt").waitFor();
    await draftDialog.getByLabel("Vybrať súbory").setInputFiles({
      name: "program.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ"),
    });
    await draftDialog.getByText(/bezpečnostných dôvodov/).waitFor();
    assert.equal(
      await draftDialog.getByRole("list", { name: "Prílohy" }).getByRole("listitem").count(),
      1,
    );
    await screenshot(page, "09-priloha");
    await draftDialog.getByText(/Koncept uložený o/).waitFor({ timeout: 25_000 }); // automatic saving after about 15 s

    step("zatvorenie: otázka, pokračovanie, uloženie ako koncept");
    await draftDialog.getByRole("button", { name: "Zavrieť" }).click();
    const ask = page.getByRole("alertdialog");
    await ask.getByText("Správa nie je odoslaná").waitFor();
    await screenshot(page, "10-zatvorenie");
    await ask.getByRole("button", { name: "Pokračovať v písaní" }).click();
    await ask.waitFor({ state: "detached" });
    assert.match(await draftDialog.getByLabel("Predmet").inputValue(), new RegExp(draftSubject));
    await page.keyboard.press("Escape"); // Escape asks as well
    await ask.waitFor();
    await ask.getByRole("button", { name: "Uložiť ako koncept" }).click();
    await draftDialog.waitFor({ state: "detached" });

    step("koncept sa dá znova otvoriť a ostane v ňom všetko");
    await page.getByRole("button", { name: /Koncepty/ }).click();
    await page.getByRole("button", { name: new RegExp(draftSubject) }).click();
    await page.getByRole("button", { name: "Upraviť koncept" }).click();
    const reopened = page.getByRole("region", { name: "Nová správa" });
    await page.waitForFunction(() =>
      (document.getElementById("subject") as HTMLInputElement | null)?.value.startsWith("Koncept"),
    );
    assert.equal(await reopened.getByLabel("Komu").inputValue(), "prijemca@aquapro.test");
    await reopened.getByText("Rozpísaná správa s prílohou.").waitFor();
    await reopened.getByRole("list", { name: "Prílohy" }).getByText("cenník ť.txt").waitFor();

    step("odoslanie konceptu: príloha dorazí a koncept zmizne");
    await reopened.getByRole("button", { name: "Odoslať" }).click();
    await page.getByText("Správa bola odoslaná.").waitFor();
    let withFile;
    for (let i = 0; i < 20 && !withFile; i++) {
      withFile = (await recipient.listMessages("INBOX")).find((m) => m.subject === draftSubject);
      if (!withFile) await sleep(250);
    }
    assert.ok(withFile?.hasAttachments, "správa dorazila bez prílohy");
    const delivered = await recipient.getAttachment("INBOX", withFile.uid, 0);
    assert.equal(delivered?.filename, "cenník ť.txt");
    assert.equal(delivered?.content.toString(), "obsah prílohy");
    await page.getByRole("button", { name: /Koncepty/ }).click();
    await page.waitForTimeout(500);
    assert.equal(
      await page.getByRole("button", { name: new RegExp(draftSubject) }).count(),
      0,
      "koncept mal po odoslaní zmiznúť",
    );

    step("zahodenie rozpísanej správy nenechá žiadny koncept");
    await page.getByRole("button", { name: "Nová správa" }).first().click();
    const throwaway = page.getByRole("region", { name: "Nová správa" });
    await throwaway.getByLabel("Predmet").fill(`Zahodiť ${run}`);
    await throwaway.getByRole("textbox", { name: "Text správy" }).click();
    await page.keyboard.type("Toto sa nemá uložiť.");
    await throwaway.getByRole("button", { name: "Zavrieť" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Zahodiť" }).click();
    await throwaway.waitFor({ state: "detached" });
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole("button", { name: new RegExp(`Zahodiť ${run}`) }).count(), 0);

    step("prázdne okno sa zatvorí bez otázky");
    await page.getByRole("button", { name: "Nová správa" }).first().click();
    await page
      .getByRole("region", { name: "Nová správa" })
      .getByRole("button", { name: "Zavrieť" })
      .click();
    await page.getByRole("region", { name: "Nová správa" }).waitFor({ state: "detached" });

    step("preposlanie prinesie pôvodné prílohy a dajú sa odstrániť");
    await page.getByRole("button", { name: /Doručená pošta/ }).click();
    await page.getByRole("button", { name: new RegExp(`Reklamácia ${run}`) }).click();
    await page.getByRole("button", { name: "Preposlať" }).click();
    const forward = page.getByRole("region", { name: "Preposlanie" });
    await forward.getByRole("list", { name: "Prílohy" }).getByText("foto.txt").waitFor();
    await forward.getByRole("button", { name: "Odstrániť prílohu foto.txt" }).click();
    await forward.getByRole("list", { name: "Prílohy" }).waitFor({ state: "detached" });
    // Nothing meaningful is left in the message, so closing needs no question.
    await forward.getByRole("button", { name: "Zavrieť" }).click();
    await forward.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("alertdialog").count(), 0);

    step("v ľavom paneli je viditeľné práve jedno logo (svetlá aj tmavá téma)");
    assert.equal(await page.locator(".sidebar-logo:visible").count(), 1);
    await page.getByRole("button", { name: "Prepnúť na tmavú tému" }).click();
    assert.equal(await page.locator(".sidebar-logo:visible").count(), 1);
    await page.getByRole("button", { name: "Prepnúť na svetlú tému" }).click();
    assert.equal(await page.locator(".sidebar-logo:visible").count(), 1);

    step("odhlásenie");
    await page.getByRole("button", { name: "Prepnúť na tmavú tému" }).click();
    await screenshot(page, "07-tmava-tema");
    await page.getByRole("button", { name: "Prepnúť na svetlú tému" }).click();
    await page.getByRole("button", { name: /^Účet:/ }).click();
    await page.getByRole("menuitem", { name: "Odhlásiť" }).waitFor();
    await screenshot(page, "08-menu-pouzivatela");
    await page.getByRole("menuitem", { name: "Odhlásiť" }).click();
    await page.getByRole("heading", { name: "Prihlásenie do pošty" }).waitFor();
    const afterLogout = await context.request.get(`${BASE}/api/folders`);
    assert.equal(afterLogout.status(), 401);

    if (databaseUrl) await adminScenario(browser, pageErrors);
    if (databaseUrl) await tasksScenario(browser, pageErrors);
    else step("správa používateľov sa preskočila (nie je nastavená E2E_DATABASE_URL)");

    assert.deepEqual(pageErrors, [], `chyby v prehliadači: ${pageErrors.join("; ")}`);
    console.log("\n✔ E2E test prešiel.");
  } finally {
    await browser.close();
    api.kill();
    if (adminDb) {
      await adminDb.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
      await adminDb.end().catch(() => undefined);
    }
  }
}

main().catch((error: unknown) => {
  console.error("\n✘ E2E test zlyhal:", error);
  process.exit(1);
});
