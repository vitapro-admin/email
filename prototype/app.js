(function () {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
};
const TODAY = AQ_TODAY, ME = AQ_USER;
const PRIO = { "Vysoká": 1, "Stredná": 2, "Nízka": 3 };
const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${+d}. ${+m}. ${y}`; };
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- stav (zdieľaný medzi oknami cez localStorage + BroadcastChannel) ---------- */
function defaults() { return { tasks: clone(AQ_TASKS), inbox: clone(AQ_INBOX), sent: [], drafts: {}, seq: 2420 }; }
let S;
function loadState() { try { S = JSON.parse(store.get("aq.state")) || defaults(); } catch (e) { S = defaults(); } }
function saveState() { store.set("aq.state", JSON.stringify(S)); post({ t: "state" }); }
const ui = (() => { try { return JSON.parse(store.get("aq.ui")) || {}; } catch (e) { return {}; } })();
ui.theme = ui.theme || "dark";
function saveUi() { store.set("aq.ui", JSON.stringify(ui)); }
const bc = "BroadcastChannel" in window ? new BroadcastChannel("aq-podpora") : null;
function post(m) { if (bc) bc.postMessage(m); }
loadState();

/* ---------- pomocné ---------- */
const task = (id) => S.tasks.find((t) => t.id === id);
const overdue = (t) => t.termin < TODAY;
const urgency = (t) => [overdue(t) ? 0 : 1, PRIO[t.priorita], t.termin];
function cmp(a, b) { const x = urgency(a), y = urgency(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; }
function toast(msg) { const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 4200); }
const view = () => (location.hash.replace(/^#\//, "") || "fronta");
const base = () => location.href.split("#")[0];
const IC = {
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/></svg>'
};

/* ---------- rámec ---------- */
const NAV = [["fronta", "Fronta úloh", IC.list], ["prijate", "Prijaté e-maily", IC.inbox], ["email", "E-mail", IC.mail], ["odoslane", "Odoslané", IC.send]];
const TITLES = { fronta: "Fronta úloh", prijate: "Prijaté e-maily", email: "E-mail", odoslane: "Odoslané" };
function mineOpen() { return S.tasks.filter((t) => t.pridelene === ME).length; }
function shell() {
  const v = view();
  const counts = { fronta: mineOpen(), prijate: S.inbox.length, odoslane: S.sent.length };
  $("#sidebar").innerHTML = `
    <a class="brand" href="#/fronta" aria-label="AQUA PRO"><img class="logo-dark" src="podklady/logo-white.svg" alt="AQUA PRO"><img class="logo-light" src="podklady/logo.svg" alt="AQUA PRO"></a>
    <nav class="nav" aria-label="Hlavná navigácia">${NAV.map(([k, n, i]) => `<button data-nav="${k}" ${v === k ? 'aria-current="page"' : ""}>${i}<span>${n}</span>${counts[k] ? `<span class="count">${counts[k]}</span>` : ""}</button>`).join("")}</nav>
    <div class="side-foot">
      <label class="switch"><input type="checkbox" id="dual" ${ui.dual ? "checked" : ""}><span>Režim dvoch okien<br><span class="hint">E-mail sa otvorí v samostatnom okne (2. monitor)</span></span></label>
      <button data-act="open-email-window" class="ghost">Otvoriť okno e-mailu</button>
      <button data-act="reset" class="ghost">Obnoviť ukážkové dáta</button>
    </div>`;
  $("#header").innerHTML = `
    <div class="crumb">${ME} · <strong>${TITLES[v] || ""}</strong></div>
    <div class="hright"><span class="chip-demo">Modelové údaje · odosielanie a zápis do CRM sú simulované</span>
      <button class="icon-btn" data-act="theme" aria-label="Prepnúť tému" title="Prepnúť tému">
        <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>
        <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>
      </button></div>`;
  document.title = `AQUA PRO · ${TITLES[v] || "Podpora"}`;
}

/* ---------- fronta úloh ---------- */
const F = { typ: "", mine: true, q: "", sel: null, note: false };
function filtered() {
  return S.tasks.filter((t) => (!F.typ || t.typ === F.typ) && (!F.mine || t.pridelene === ME) &&
    (!F.q || (t.klient + t.id + t.kontakt.meno).toLowerCase().includes(F.q.toLowerCase()))).sort(cmp);
}
function viewFronta() {
  const mine = S.tasks.filter((t) => t.pridelene === ME);
  const sentToday = S.sent.filter((s) => s.den === TODAY).length;
  const list = filtered();
  if (!F.sel || !task(F.sel)) F.sel = list[0]?.id || null;
  $("#main").innerHTML = `
  <div class="kpis">
    <div class="kpi"><span>Moje otvorené úlohy</span><b>${mine.length}</b></div>
    <div class="kpi ${mine.filter(overdue).length ? "alert" : ""}"><span>Po termíne</span><b>${mine.filter(overdue).length}</b></div>
    <div class="kpi"><span>Termín dnes</span><b>${mine.filter((t) => t.termin === TODAY).length}</b></div>
    <div class="kpi"><span>Odoslané dnes</span><b>${sentToday}</b></div>
  </div>
  <div class="split">
    <section class="panel" aria-label="Zoznam úloh">
      <div class="panel-head">
        <div class="filters" role="group" aria-label="Typ úlohy">${[["", "Všetko"], ...Object.entries(AQ_TYPES)].map(([k, n]) => `<button data-typ="${k}" aria-pressed="${F.typ === k}">${n}</button>`).join("")}</div>
        <div class="tools"><label><input type="checkbox" id="mine" ${F.mine ? "checked" : ""}> Len moje</label><input type="search" id="q" placeholder="Hľadať klienta…" value="${esc(F.q)}" aria-label="Hľadať"></div>
      </div>
      ${list.length ? `<table><thead><tr><th>Typ</th><th>Klient</th><th>Stav</th><th>Termín</th></tr></thead><tbody>
      ${list.map((t) => `<tr data-sel="${t.id}" aria-selected="${t.id === F.sel}" tabindex="0">
        <td><span class="type t-${t.typ}"><i class="dot"></i>${AQ_TYPES[t.typ]}</span><span class="sub">${t.id} · ${t.crm.druh} ${t.crm.cislo}</span></td>
        <td>${esc(t.klient)}<span class="sub">${esc(t.kontakt.meno)} · ${esc(t.pridelene)}</span></td>
        <td><span class="pill ${t.stav === "Nová" ? "warn" : ""}">${t.stav}</span>${t.priorita === "Vysoká" ? ' <span class="pill neg">Vysoká</span>' : ""}</td>
        <td class="${overdue(t) ? "late" : ""}">${fmtDate(t.termin)}${overdue(t) ? '<span class="sub late">po termíne</span>' : ""}</td></tr>`).join("")}
      </tbody></table>` : '<div class="empty">Žiadne úlohy pre zvolený filter.</div>'}
    </section>
    <aside class="panel detail" id="detail" aria-label="Detail úlohy"></aside>
  </div>`;
  renderDetail();
}
function renderDetail() {
  const el = $("#detail"); if (!el) return;
  const t = F.sel && task(F.sel);
  if (!t) { el.innerHTML = '<div class="empty">Vyber úlohu zo zoznamu.</div>'; return; }
  el.innerHTML = `<div class="detail-in">
    <div class="dhead"><div class="meta"><span class="type t-${t.typ}"><i class="dot"></i>${AQ_TYPES[t.typ]}</span><span>${t.id}</span><span class="pill ${overdue(t) ? "neg" : ""}">Termín ${fmtDate(t.termin)}</span></div>
      <h2>${esc(t.klient)}</h2></div>
    <p>${esc(t.popis)}</p>
    <div class="box ai"><div class="lbl">Odporúčaný ďalší krok</div><div>${esc(t.ai.krok)}</div><div class="hint" style="margin-top:6px">${esc(t.ai.dovod)}</div>
      <div class="row"><button class="primary" data-act="compose" data-id="${t.id}">Pripraviť e-mail${ui.dual ? " v druhom okne" : ""}</button>
      <button data-act="note-toggle">Zapísať poznámku do CRM</button></div>
      ${F.note ? `<div style="margin-top:10px"><label for="note">Poznámka (vznikne ako event v CRM)</label><textarea id="note" rows="3"></textarea><div class="row"><button class="primary" data-act="note-save" data-id="${t.id}">Zapísať event</button><button class="ghost" data-act="note-toggle">Zrušiť</button></div></div>` : ""}</div>
    <div><h3 style="margin-bottom:8px">Záznam v CRM</h3><dl class="grid2">
      <div><dt>${t.crm.druh}</dt><dd>${t.crm.cislo}</dd></div><div><dt>Zdroj</dt><dd>${t.zdroj}</dd></div>
      <div><dt>Kontakt</dt><dd>${esc(t.kontakt.meno)}<br><span class="hint">${esc(t.kontakt.funkcia)}</span></dd></div><div><dt>Kontaktné údaje</dt><dd>${esc(t.kontakt.email)}<br>${esc(t.kontakt.tel)}</dd></div>
      <div><dt>Adresa</dt><dd>${esc(t.adresa)}</dd></div><div><dt>Pridelené</dt><dd>${esc(t.pridelene)}</dd></div></dl></div>
    <div><h3 style="margin-bottom:10px">História komunikácie</h3><div class="tl">${t.historia.slice().reverse().map(histItem).join("")}</div></div></div>`;
}
const histItem = (h) => `<div class="tl-i ${h.k}"><i></i><div><div class="tl-h">${h.d}${h.k === "crm" ? " · CRM" : h.k === "out" ? " · odoslané" : " · prijaté"}</div><div class="tl-t">${esc(h.t)}</div></div></div>`;

/* ---------- prijaté e-maily (AI triáž) ---------- */
function viewPrijate() {
  $("#main").innerHTML = `<section class="panel"><div class="panel-head"><div><h2>Prijaté e-maily</h2><div class="hint">AI e-mail roztriedi a navrhne záznam. O zápise do CRM rozhoduje človek.</div></div></div>
  ${S.inbox.length ? S.inbox.map((m) => `<article class="mail"><div><div class="from">${esc(m.od)} · ${m.cas}</div><div class="subj">${esc(m.predmet)}</div><div class="snip">${esc(m.text)}</div></div>
    <div class="box ai"><div class="lbl">Návrh AI · istota: ${m.ai.istota}</div>
      ${m.ai.typ ? `<dl class="grid2"><div><dt>Typ</dt><dd>${AQ_TYPES[m.ai.typ]}</dd></div><div><dt>Priorita</dt><dd>${m.ai.priorita}</dd></div><div style="grid-column:1/-1"><dt>Klient</dt><dd>${esc(m.ai.klient)}</dd></div><div style="grid-column:1/-1"><dt>Zhrnutie</dt><dd>${esc(m.ai.popis)}</dd></div></dl>` : `<div>${esc(m.ai.popis)}</div>`}
      <div class="row">${m.ai.typ ? `<button class="primary" data-act="inbox-ok" data-id="${m.id}">Potvrdiť a vytvoriť úlohu</button>` : ""}<button data-act="inbox-no" data-id="${m.id}">${m.ai.typ ? "Nie je úloha" : "Archivovať"}</button></div></div></article>`).join("") : '<div class="empty">Všetko spracované.</div>'}</section>`;
}
function inboxOk(id) {
  const m = S.inbox.find((x) => x.id === id); if (!m) return;
  const mm = /^(.*?)\s*<(.+)>$/.exec(m.od); const meno = mm ? mm[1] : m.od, email = mm ? mm[2] : "";
  const n = ++S.seq, druh = m.ai.typ === "ponuka" ? "Lead" : "Dokument";
  const t = { id: "T-" + n, typ: m.ai.typ, klient: m.ai.klient.replace(/\s*\(.*\)$/, "").replace(/^Nový kontakt – .*$/, meno), kontakt: { meno, oslovenie: "Dobrý deň", funkcia: "—", email, tel: "—" }, adresa: "—", zdroj: "E-mail",
    crm: { druh, cislo: (druh === "Lead" ? "LEAD-" : "DOK-") + (48230 + (n - 2420)) }, stav: "Nová", priorita: m.ai.priorita, termin: "2026-11-21", pridelene: ME, popis: m.ai.popis,
    historia: [{ d: m.cas, k: "in", t: `E-mail: ${m.predmet}` }, { d: "19. 11. 2026", k: "crm", t: `Záznam ${druh} vytvorený z e-mailu (simulácia zápisu do CRM).` }],
    ai: { sablona: m.ai.typ, krok: "Odpovedať klientovi a potvrdiť prijatie požiadavky.", dovod: "Úloha vznikla z prijatého e-mailu." } };
  S.tasks.push(t); S.inbox = S.inbox.filter((x) => x.id !== id); saveState(); F.sel = t.id; F.mine = true; F.typ = "";
  toast(`Vytvorená úloha ${t.id} (${t.crm.cislo}). Nájdeš ju vo fronte.`); render();
}

/* ---------- e-mailové návrhy a šablóna ---------- */
const miss = (v, n) => v || `[doplniť ${n}]`;
function factsFor(t, key) {
  const F2 = { reklamacia: [["Číslo reklamácie", t.crm.cislo], ["Predmet", miss(t.vymena, "predmet")], ["Reakcia do", "2 pracovné dni"]],
    servis: [["Navrhovaný termín", miss(t.navrhTermin, "termín")], ["Miesto", t.adresa], ["Číslo dokumentu", t.crm.cislo]],
    ponuka: [["Ponuka", miss(t.suma, "cenu")], ["Platnosť ponuky", "30 dní"], ["Referencia", t.crm.cislo]],
    dodavka: [["Termín dodávky", miss(t.terminDodavky, "termín")], ["Množstvo", miss(t.mnozstvo, "množstvo")], ["Adresa", t.adresa]],
    prieskum: [["Referencia", t.crm.cislo]] };
  return F2[key];
}
function paras(t, key, v, tel) {
  const os = t.kontakt.oslovenie + ",";
  const P = {
    reklamacia: [
      [os, `ďakujeme za Vašu správu a ospravedlňujeme sa za komplikácie. Vašu reklamáciu sme prijali a zaevidovali pod číslom ${t.crm.cislo}.`, `Preveríme ju (${miss(t.vymena, "predmet reklamácie")}) a do 2 pracovných dní sa Vám ozveme s konkrétnym riešením.`, `Ak by ste chceli niečo doplniť, odpovedzte prosím na tento e-mail alebo zavolajte na ${tel}.`],
      [os, `ďakujeme, že ste nám dali vedieť. To, čo opisujete, nie je štandard, aký od nás očakávate, a preto sa tomu venujeme prednostne.`, `Reklamácia má číslo ${t.crm.cislo}. Do 2 pracovných dní Vám napíšeme, ako vec vyriešime (${miss(t.vymena, "predmet reklamácie")}).`, `Keby ste potrebovali niečo vyriešiť skôr, volajte na ${tel}.`]],
    servis: [
      [os, `radi by sme Vás informovali o plánovanej servisnej kontrole Vášho dávkovača.`, `Navrhujeme termín ${miss(t.navrhTermin, "termín")}. Kontrola trvá približne 45 minút a nevyžaduje žiadnu prípravu z Vašej strany.`, `Ak Vám termín nevyhovuje, stačí odpovedať na tento e-mail a dohodneme iný.`],
      [os, `blíži sa čas na pravidelnú kontrolu dávkovača, aby Vám voda aj naďalej chutila tak, ako má.`, `Technik by k Vám mohol prísť ${miss(t.navrhTermin, "termín")}. Ak sa to nehodí, napíšte nám, kedy Vám to vyhovuje.`]],
    ponuka: [
      [os, `ďakujeme za Váš záujem. Na základe Vašich požiadaviek sme pripravili nasledujúcu cenovú ponuku.`, `Cena: ${miss(t.suma, "cenu")}. Ponuka je platná 30 dní.`, `Radi Vám ponuku vysvetlíme osobne alebo ju upravíme podľa Vašich potrieb.`],
      [os, `ďakujeme, že ste sa na nás obrátili. Pripravili sme pre Vás ponuku, ktorá vychádza z toho, čo ste nám opísali.`, `V skratke: ${miss(t.suma, "cenu")}, platnosť 30 dní. Ak by ste chceli niečo zmeniť, stačí nám napísať.`]],
    dodavka: [
      [os, `potvrdzujeme Vašu dodávku vody v nasledujúcom termíne.`, `Doručíme ${miss(t.mnozstvo, "množstvo")} v čase ${miss(t.terminDodavky, "termín")}. Prosíme o zabezpečenie prístupu k odbernému miestu.`],
      [os, `všetko je pripravené: dodávku máme zaradenú do trasy.`, `Príde k Vám ${miss(t.mnozstvo, "množstvo")}, ${miss(t.terminDodavky, "termín")}. Ak sa niečo zmení, dajte nám vedieť.`]],
    prieskum: [
      [os, `ďakujeme, že ste s nami. Radi by sme vedeli, ako ste spokojní so službami AQUA PRO.`, `Vyplnenie trvá menej ako dve minúty a pomôže nám zlepšiť naše služby.`],
      [os, `Váš názor je pre nás dôležitý. Pomôžete nám pár odpoveďami zlepšiť to, čo robíme?`]]
  };
  return P[key][v % P[key].length];
}
function newCompose(t, key, v = 0) {
  const per = AQ_PEOPLE[t.pridelene] ? t.pridelene : ME;
  return { taskId: t.id, tpl: key, v, od: per, komu: t.kontakt.email, kopia: "", predmet: AQ_TEMPLATES[key].predmet(t), telo: paras(t, key, v, AQ_PEOPLE[per].tel).join("\n\n") };
}
function emailHTML(c) {
  const t = task(c.taskId); const p = AQ_PEOPLE[c.od] || AQ_PEOPLE[ME];
  const facts = factsFor(t, c.tpl);
  const body = c.telo.split(/\n\s*\n/).map((x) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#192c3b">${esc(x).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="margin:0;background:#e9eef3;font-family:Inter,'Segoe UI',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9eef3"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="padding:26px 36px 18px"><img src="${window.AQ_LOGO}" width="116" alt="AQUA PRO" style="display:block"></td></tr>
<tr><td style="height:3px;background:#246aaf;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 36px 8px"><h1 style="margin:0 0 20px;font-size:21px;line-height:1.3;color:#192c3b;font-weight:600">${esc(c.predmet)}</h1>${body}</td></tr>
<tr><td style="padding:4px 36px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f8;border-left:3px solid #246aaf;border-radius:4px">
${facts.map(([k, v]) => `<tr><td style="padding:8px 14px;font-size:13px;color:#4c657b;width:42%">${esc(k)}</td><td style="padding:8px 14px;font-size:14px;color:#192c3b;font-weight:600">${esc(v)}</td></tr>`).join("")}</table></td></tr>
<tr><td style="padding:22px 36px 30px;font-size:15px;line-height:1.55;color:#192c3b">S pozdravom<br><b>${esc(c.od)}</b><br><span style="color:#4c657b;font-size:13px">${esc(p.rola)} · AQUA PRO<br>${esc(p.tel)} · ${esc(p.email)}</span></td></tr>
<tr><td style="padding:16px 36px;background:#f2f5f8;font-size:11px;line-height:1.5;color:#4c657b">Táto správa je určená výlučne adresátovi. Modelová šablóna prototypu: právny text a odhlásenie doplníme podľa pokynov firmy.</td></tr>
</table></td></tr></table></body></html>`;
}

/* ---------- editor e-mailu ---------- */
let C = null, previewTimer = 0;
function openCompose(id, tpl) { const t = task(id); if (!t) return; const sv = S.drafts[id]; C = sv && (!tpl || sv.tpl === tpl) ? clone(sv) : newCompose(t, tpl || t.ai.sablona); }
function viewEmail() {
  const opts = S.tasks.slice().sort(cmp).map((t) => `<option value="${t.id}" ${C && C.taskId === t.id ? "selected" : ""}>${t.id} · ${esc(t.klient)} (${AQ_TYPES[t.typ]})</option>`).join("");
  if (!C) { $("#main").innerHTML = `<section class="panel form" style="max-width:560px"><h2>Nový e-mail</h2><p class="hint">Vyber úlohu. E-mail pripravíš aj priamo z detailu úlohy vo fronte.</p><div><label for="pick">Úloha</label><select id="pick"><option value="">Vyber…</option>${opts}</select></div></section>`; return; }
  const t = task(C.taskId); const hist = t.historia.slice(-3).reverse();
  $("#main").innerHTML = `<div class="ed"><div class="ed-left">
    <section class="panel ctx"><div><label for="pick">Úloha</label><select id="pick">${opts}</select></div>
      <div id="ctx"></div></section>
    <section class="panel form"><div class="frow"><div><label for="tpl">Šablóna</label><select id="tpl">${Object.entries(AQ_TEMPLATES).map(([k, v]) => `<option value="${k}" ${C.tpl === k ? "selected" : ""}>${v.nazov}</option>`).join("")}</select></div>
      <div style="align-self:end"><button data-act="redraft" style="width:100%">Navrhnúť znova</button></div></div>
      <div><label for="od">Od</label><select id="od">${Object.entries(AQ_PEOPLE).map(([n, p]) => `<option value="${n}" ${C.od === n ? "selected" : ""}>${n} &lt;${p.email}&gt;</option>`).join("")}</select></div>
      <div><label for="komu">Komu</label><input id="komu" value="${esc(C.komu)}"></div>
      <div><label for="kopia">Kópia</label><input id="kopia" value="${esc(C.kopia)}" placeholder="voliteľné"></div>
      <div><label for="predmet">Predmet</label><input id="predmet" value="${esc(C.predmet)}"></div>
      <div><label for="telo">Text e-mailu</label><textarea id="telo" rows="14">${esc(C.telo)}</textarea></div>
      <div class="why"><b>Ako vznikol návrh:</b> šablóna podľa typu dokumentu (${AQ_TYPES[t.typ]} → ${AQ_TEMPLATES[t.ai.sablona].nazov}), oslovenie a polia z CRM, ${t.historia.length} záznamy z histórie. <i>Ukážka: text sa tu skladá zo šablóny, AI jazykový model sa napojí v ďalšej fáze. Pole v [zátvorkách] treba doplniť.</i></div>
      <div class="row" id="actions"></div></section></div>
    <section class="panel preview"><div class="panel-head"><h2>Náhľad e-mailu</h2><span class="hint">tak ho uvidí klient</span></div><iframe id="pv" title="Náhľad e-mailu"></iframe></section></div>`;
  ctxUpdate(); actions(); updatePreview();
}
function ctxUpdate() {
  const el = $("#ctx"); if (!el || !C) return; const t = task(C.taskId);
  el.innerHTML = `<div class="facts"><span class="fact"><b>Klient</b>${esc(t.klient)}</span><span class="fact"><b>Kontakt</b>${esc(t.kontakt.meno)}</span><span class="fact"><b>${t.crm.druh}</b>${t.crm.cislo}</span><span class="fact"><b>Termín</b>${fmtDate(t.termin)}</span></div>
  <div style="margin-top:6px"><div class="hint" style="margin-bottom:6px">Posledná komunikácia</div><div class="tl">${t.historia.slice(-3).reverse().map(histItem).join("")}</div></div>`;
}
function actions(confirm) {
  const el = $("#actions"); if (!el) return;
  el.innerHTML = confirm ? `<span style="flex-basis:100%">Odoslať na <b>${esc(C.komu)}</b> z adresy <b>${esc(AQ_PEOPLE[C.od].email)}</b>?</span><button class="primary" data-act="send-ok">Áno, odoslať</button><button data-act="send-cancel">Späť k úprave</button>`
    : `<button class="primary" data-act="send">Schváliť a odoslať</button><button data-act="draft">Uložiť koncept</button><button class="ghost" data-act="download">Stiahnuť HTML</button>`;
}
function updatePreview() { const f = $("#pv"); if (f && C) f.srcdoc = emailHTML(C); }
function syncFromForm(id, val) { if (!C) return; C[id] = val; clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 120); }
function sendMail() {
  const t = task(C.taskId); const html = emailHTML(C);
  S.sent.unshift({ id: "S-" + Date.now(), den: TODAY, cas: "19. 11. 2026 " + new Date().toTimeString().slice(0, 5), od: C.od, komu: C.komu, predmet: C.predmet, tpl: AQ_TEMPLATES[C.tpl].nazov, taskId: t.id, klient: t.klient, html });
  t.historia.push({ d: "19. 11. 2026 " + new Date().toTimeString().slice(0, 5), k: "out", t: `E-mail odoslaný: „${C.predmet}“ (z adresy ${AQ_PEOPLE[C.od].email}).` });
  t.historia.push({ d: "19. 11. 2026", k: "crm", t: `Event EVT-${++S.seq} zapísaný do CRM (simulácia).` });
  t.stav = "Čaká na klienta"; delete S.drafts[t.id]; saveState();
  toast(`Odoslané (simulácia) · ${C.komu}. Úloha ${t.id} je v stave „Čaká na klienta“.`); C = null; render();
}

/* ---------- odoslané ---------- */
let selSent = null;
function viewOdoslane() {
  if (!selSent || !S.sent.find((s) => s.id === selSent)) selSent = S.sent[0]?.id || null;
  const s = S.sent.find((x) => x.id === selSent);
  $("#main").innerHTML = S.sent.length ? `<div class="split"><section class="panel"><div class="panel-head"><h2>Odoslané e-maily</h2></div><table><thead><tr><th>Čas</th><th>Komu</th><th>Predmet</th></tr></thead><tbody>
    ${S.sent.map((m) => `<tr data-sent="${m.id}" aria-selected="${m.id === selSent}" tabindex="0"><td>${m.cas}</td><td>${esc(m.klient)}<span class="sub">${esc(m.komu)}</span></td><td>${esc(m.predmet)}<span class="sub">${m.tpl} · ${m.od}</span></td></tr>`).join("")}</tbody></table></section>
    <section class="panel preview"><div class="panel-head"><h2>Náhľad</h2></div><iframe id="pv" title="Náhľad odoslaného e-mailu"></iframe></section></div>`
    : '<section class="panel"><div class="empty">Zatiaľ nič neodoslané. Pripraviť e-mail môžeš z detailu úlohy.</div></section>';
  if (s && $("#pv")) $("#pv").srcdoc = s.html;
}

/* ---------- vykresľovanie a udalosti ---------- */
function render() {
  const v = view(); shell();
  ({ fronta: viewFronta, prijate: viewPrijate, email: viewEmail, odoslane: viewOdoslane }[v] || viewFronta)();
}
function goCompose(id) {
  store.set("aq.compose", JSON.stringify({ id, ts: Date.now() })); handledTs = JSON.parse(store.get("aq.compose")).ts;
  if (ui.dual) {
    post({ t: "compose", id });
    const w = window.open(base() + "#/email", "aq-email", "popup,width=1320,height=940");
    if (!w) toast("Prehliadač zablokoval nové okno. Povoľ vyskakovacie okná pre túto stránku.");
  } else { openCompose(id); location.hash = "#/email"; }
}
let handledTs = 0;
function consumePending() {
  if (view() !== "email") return;
  try { const p = JSON.parse(store.get("aq.compose")); if (p && p.ts > handledTs && Date.now() - p.ts < 15000) { handledTs = p.ts; openCompose(p.id); } } catch (e) { /* nič */ }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act],[data-nav],[data-typ],[data-sel],[data-sent]"); if (!b) return;
  const d = b.dataset;
  if (d.nav) { location.hash = "#/" + d.nav; return; }
  if (d.typ !== undefined) { F.typ = d.typ; render(); return; }
  if (d.sel) { F.sel = d.sel; F.note = false; viewFronta(); return; }
  if (d.sent) { selSent = d.sent; viewOdoslane(); return; }
  const a = d.act;
  if (a === "theme") { ui.theme = ui.theme === "dark" ? "light" : "dark"; saveUi(); applyTheme(); post({ t: "ui" }); }
  else if (a === "compose") goCompose(d.id);
  else if (a === "note-toggle") { F.note = !F.note; renderDetail(); }
  else if (a === "note-save") { const v = $("#note").value.trim(); if (!v) { toast("Napíš poznámku."); return; } const t = task(d.id);
    t.historia.push({ d: "19. 11. 2026", k: "crm", t: `Event EVT-${++S.seq} zapísaný do CRM (simulácia): ${v}` }); F.note = false; saveState(); toast("Event zapísaný (simulácia)."); renderDetail(); }
  else if (a === "inbox-ok") inboxOk(d.id);
  else if (a === "inbox-no") { S.inbox = S.inbox.filter((x) => x.id !== d.id); saveState(); render(); }
  else if (a === "redraft") { const t = task(C.taskId); const n = newCompose(t, C.tpl, C.v + 1); n.od = C.od; n.komu = C.komu; n.kopia = C.kopia; n.telo = paras(t, C.tpl, n.v, AQ_PEOPLE[C.od].tel).join("\n\n"); C = n; viewEmail(); }
  else if (a === "draft") { S.drafts[C.taskId] = clone(C); saveState(); toast("Koncept uložený."); }
  else if (a === "download") { const u = URL.createObjectURL(new Blob([emailHTML(C)], { type: "text/html" })); const l = document.createElement("a"); l.href = u; l.download = `email-${C.taskId}.html`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
  else if (a === "send") { if (!/^\S+@\S+\.\S+$/.test(C.komu)) { toast("Skontroluj adresu príjemcu."); return; } actions(true); }
  else if (a === "send-cancel") actions(false);
  else if (a === "send-ok") sendMail();
  else if (a === "open-email-window") { const w = window.open(base() + "#/email", "aq-email", "popup,width=1320,height=940"); if (!w) toast("Prehliadač zablokoval nové okno."); }
  else if (a === "reset") { S = defaults(); C = null; saveState(); toast("Ukážkové dáta obnovené."); render(); }
});
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[tabindex]")) { e.preventDefault(); e.target.click(); } });
document.addEventListener("input", (e) => {
  const id = e.target.id;
  if (id === "q") { F.q = e.target.value; const pos = e.target.selectionStart; viewFronta(); const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos); }
  else if (["komu", "kopia", "predmet", "telo"].includes(id)) syncFromForm(id, e.target.value);
});
document.addEventListener("change", (e) => {
  const id = e.target.id;
  if (id === "mine") { F.mine = e.target.checked; render(); }
  else if (id === "dual") { ui.dual = e.target.checked; saveUi(); toast(ui.dual ? "Režim dvoch okien zapnutý: e-mail sa otvorí v samostatnom okne." : "Režim dvoch okien vypnutý."); }
  else if (id === "pick") { if (e.target.value) { openCompose(e.target.value); viewEmail(); } }
  else if (id === "tpl") { const t = task(C.taskId); const n = newCompose(t, e.target.value); n.od = C.od; n.komu = C.komu; n.kopia = C.kopia; n.telo = paras(t, n.tpl, 0, AQ_PEOPLE[C.od].tel).join("\n\n"); C = n; viewEmail(); }
  else if (id === "od") { const t = task(C.taskId); C.od = e.target.value; C.telo = C.telo.replace(/(zavolajte na |volajte na )\+421[\d ]+/, `$1${AQ_PEOPLE[C.od].tel}`); viewEmail(); }
});
function applyTheme() { document.documentElement.dataset.theme = ui.theme; }
function onRemote(m) {
  if (m.t === "state") { loadState(); if (view() === "email") { if (C && !task(C.taskId)) C = null; ctxUpdate(); } else render(); }
  else if (m.t === "ui") { try { Object.assign(ui, JSON.parse(store.get("aq.ui"))); } catch (e) { /* nič */ } applyTheme(); shell(); }
  else if (m.t === "compose") { if (view() === "email") { loadState(); openCompose(m.id); viewEmail(); window.focus(); } }
}
if (bc) bc.onmessage = (e) => onRemote(e.data);
window.addEventListener("storage", (e) => { if (!bc && e.key === "aq.state") onRemote({ t: "state" }); if (!bc && e.key === "aq.ui") onRemote({ t: "ui" }); if (e.key === "aq.compose" && view() === "email") { consumePending(); viewEmail(); } });
window.addEventListener("hashchange", () => { consumePending(); render(); });
applyTheme(); consumePending(); render();
window.AQ_DEBUG = { get state() { return S; } };
})();
