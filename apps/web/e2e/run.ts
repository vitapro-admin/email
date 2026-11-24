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
import { ImapMailGateway, SmtpMailSender } from "@aquapro/mail-gateway";
import { chromium } from "playwright";
import type { Page } from "playwright";

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

async function startApi(): Promise<ChildProcess> {
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

async function main() {
  await waitForMailserver();
  // E2E_CHROMIUM lets you point to an already installed Chromium instead of the Playwright download.
  const executablePath = process.env["E2E_CHROMIUM"];
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const api = await startApi().catch(async (error: unknown) => {
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

    assert.deepEqual(pageErrors, [], `chyby v prehliadači: ${pageErrors.join("; ")}`);
    console.log("\n✔ E2E test prešiel.");
  } finally {
    await browser.close();
    api.kill();
  }
}

main().catch((error: unknown) => {
  console.error("\n✘ E2E test zlyhal:", error);
  process.exit(1);
});
