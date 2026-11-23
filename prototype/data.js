/* Modelové (vymyslené) údaje. V ostrej verzii ich nahradí import z Actiwhere. */
window.AQ_TODAY = "2026-11-19";
window.AQ_USER = "Ivana K.";
window.AQ_PEOPLE = {
  "Ivana K.": { email: "ivana.k@aquapro.example", tel: "+421 900 000 201", rola: "Podpora obchodu" },
  "Marek S.": { email: "marek.s@aquapro.example", tel: "+421 900 000 202", rola: "Podpora obchodu" },
  "Zuzana T.": { email: "zuzana.t@aquapro.example", tel: "+421 900 000 203", rola: "Podpora obchodu" },
  "Tomáš B.": { email: "tomas.b@aquapro.example", tel: "+421 900 000 204", rola: "Podpora obchodu" }
};
window.AQ_TYPES = {
  dodavka: "Dodávka vody", reklamacia: "Reklamácia", servis: "Servisná návšteva", ponuka: "Cenová ponuka"
};
window.AQ_TASKS = [
  { id: "T-2411", typ: "reklamacia", klient: "Hotel Panoráma s.r.o.", kontakt: { meno: "Jana Horváthová", oslovenie: "Dobrý deň, pani Horváthová", funkcia: "Prevádzková manažérka", email: "j.horvathova@hotelpanorama.example", tel: "+421 900 000 101" }, adresa: "Hlavná 14, Poprad", zdroj: "E-mail", crm: { druh: "Dokument", cislo: "DOK-48213" }, stav: "Nová", priorita: "Vysoká", termin: "2026-11-19", pridelene: "Ivana K.",
    popis: "Klient reklamuje zákal vody v dvoch 19 l fľašiach z dodávky zo 17. 11. Požaduje výmenu a vysvetlenie.",
    historia: [
      { d: "17. 11. 2026 14:20", k: "out", t: "Dodávka 24 × 19 l fľaša vykonaná (DOK-48102)." },
      { d: "19. 11. 2026 07:48", k: "in", t: "E-mail klienta: „Dve fľaše z poslednej dodávky majú zakalenú vodu, prosíme o výmenu a stanovisko.“" }],
    ai: { sablona: "reklamacia", krok: "Odpovedať klientovi ešte dnes: potvrdiť prijatie reklamácie, ospravedlniť sa a navrhnúť výmenu fľaší pri najbližšej dodávke.", dovod: "Reklamácia po termíne reakcie (dnes). Klient je zmluvný odberateľ od 2021." },
    vymena: "2 fľaše 19 l" },
  { id: "T-2409", typ: "servis", klient: "Zdravotné stredisko MEDICA", kontakt: { meno: "Peter Kollár", oslovenie: "Dobrý deň, pán Kollár", funkcia: "Správca budovy", email: "p.kollar@medica.example", tel: "+421 900 000 102" }, adresa: "Nemocničná 3, Žilina", zdroj: "Telefonát", crm: { druh: "Dokument", cislo: "DOK-48190" }, stav: "V riešení", priorita: "Vysoká", termin: "2026-11-18", pridelene: "Ivana K.",
    popis: "Ročná sanitácia dávkovača vody. Termín s technikom sa musí dohodnúť, klient preferuje ráno.",
    historia: [
      { d: "12. 11. 2026 10:05", k: "in", t: "Telefonát: klient žiada sanitáciu pred koncom mesiaca." },
      { d: "12. 11. 2026 10:20", k: "crm", t: "Zapísaný dokument DOK-48190 – Servisná návšteva." }],
    ai: { sablona: "servis", krok: "Poslať oznámenie servisnej kontroly s návrhom termínu (utorok 24. 11., 8:00–10:00).", dovod: "Termín je po lehote. Technik je v regióne Žilina voľný 24. 11." },
    navrhTermin: "utorok 24. 11. 2026, 8:00 – 10:00" },
  { id: "T-2412", typ: "ponuka", klient: "Kancelárie Westend a.s.", kontakt: { meno: "Lucia Mináriková", oslovenie: "Dobrý deň, pani Mináriková", funkcia: "Office manažérka", email: "l.minarikova@westend.example", tel: "+421 900 000 103" }, adresa: "Einsteinova 21, Bratislava", zdroj: "Obchodník", crm: { druh: "Dokument", cislo: "DOK-48221" }, stav: "Nová", priorita: "Stredná", termin: "2026-11-20", pridelene: "Ivana K.",
    popis: "Obchodník žiada ponuku na 3 stolové dávkovače a mesačnú dodávku vody pre 85 zamestnancov.",
    historia: [{ d: "18. 11. 2026 16:30", k: "crm", t: "Obchodník (R. Baláž) zadal požiadavku na ponuku." }],
    ai: { sablona: "ponuka", krok: "Odoslať cenovú ponuku. Podklady sú v CRM, chýba iba potvrdenie počtu dávkovačov.", dovod: "Podobná ponuka (Business Park Ružinov) bola prijatá po úprave tónu na stručnejší." },
    suma: "389,00 € / mesiac bez DPH" },
  { id: "T-2405", typ: "dodavka", klient: "ZŠ Pri parku", kontakt: { meno: "Mgr. Eva Kováčová", oslovenie: "Dobrý deň, pani riaditeľka", funkcia: "Riaditeľka", email: "riaditelka@zspripark.example", tel: "+421 900 000 104" }, adresa: "Školská 8, Nitra", zdroj: "Telefonát", crm: { druh: "Dokument", cislo: "DOK-48177" }, stav: "Čaká na zásah", priorita: "Stredná", termin: "2026-11-19", pridelene: "Marek S.",
    popis: "Mimoriadna dodávka 10 × 19 l fľaša, škola žiada doručenie do štvrtka.",
    historia: [{ d: "16. 11. 2026 11:10", k: "in", t: "Telefonát: žiadosť o mimoriadnu dodávku." }, { d: "16. 11. 2026 11:25", k: "crm", t: "Zapísaný dokument DOK-48177 – Dodávka. Pridelené distribúcii." }],
    ai: { sablona: "dodavka", krok: "Potvrdiť klientovi termín dodávky (štvrtok 19. 11.). Distribúcia už trasu zaradila.", dovod: "Klient čaká na potvrdenie už 3 dni." },
    terminDodavky: "štvrtok 19. 11. 2026, 10:00 – 14:00", mnozstvo: "10 × 19 l fľaša" },
  { id: "T-2398", typ: "servis", klient: "Autoservis Kováč", kontakt: { meno: "Ján Kováč", oslovenie: "Dobrý deň, pán Kováč", funkcia: "Majiteľ", email: "kovac@autoservis.example", tel: "+421 900 000 105" }, adresa: "Priemyselná 5, Trenčín", zdroj: "E-mail", crm: { druh: "Event", cislo: "EVT-9921" }, stav: "Čaká na klienta", priorita: "Nízka", termin: "2026-11-25", pridelene: "Ivana K.",
    popis: "Klient sa pýta na dĺžku servisného intervalu pre dávkovač.",
    historia: [{ d: "10. 11. 2026 09:00", k: "in", t: "E-mail: otázka na servisný interval." }, { d: "10. 11. 2026 13:40", k: "out", t: "Odpoveď odoslaná, čakáme na potvrdenie termínu." }],
    ai: { sablona: "servis", krok: "Pripomenúť klientovi termín servisnej kontroly (nereagoval 9 dní).", dovod: "Žiadna odpoveď od 10. 11." },
    navrhTermin: "streda 25. 11. 2026, 13:00 – 15:00" },
  { id: "T-2401", typ: "dodavka", klient: "Penzión U Jeleňa", kontakt: { meno: "Mária Slobodová", oslovenie: "Dobrý deň, pani Slobodová", funkcia: "Majiteľka", email: "info@ujelena.example", tel: "+421 900 000 106" }, adresa: "Horná 2, Tatranská Lomnica", zdroj: "Telefonát", crm: { druh: "Dokument", cislo: "DOK-48150" }, stav: "V riešení", priorita: "Nízka", termin: "2026-11-23", pridelene: "Zuzana T.",
    popis: "Zmena dodacieho dňa z utorka na stredu.",
    historia: [{ d: "9. 11. 2026 15:00", k: "in", t: "Telefonát: žiadosť o zmenu dňa." }],
    ai: { sablona: "dodavka", krok: "Potvrdiť zmenu dodacieho dňa.", dovod: "Zmena platí od budúceho týždňa." },
    terminDodavky: "streda 25. 11. 2026, 9:00 – 12:00", mnozstvo: "12 × 19 l fľaša" },
  { id: "T-2413", typ: "ponuka", klient: "Fitness Aktiv s.r.o.", kontakt: { meno: "Martin Dobrovič", oslovenie: "Dobrý deň, pán Dobrovič", funkcia: "Konateľ", email: "m.dobrovic@fitnessaktiv.example", tel: "+421 900 000 107" }, adresa: "Športová 12, Banská Bystrica", zdroj: "E-mail", crm: { druh: "Event", cislo: "EVT-9934" }, stav: "Nová", priorita: "Stredná", termin: "2026-11-24", pridelene: "Ivana K.",
    popis: "Záujem o prenájom 2 chladených dávkovačov pre fitness centrum.",
    historia: [{ d: "19. 11. 2026 08:15", k: "in", t: "E-mail: dopyt na prenájom 2 dávkovačov." }],
    ai: { sablona: "ponuka", krok: "Odoslať cenovú ponuku a ponúknuť nezáväznú obhliadku.", dovod: "Nový zákazník, odporúčame osobnejší tón." },
    suma: "54,00 € / mesiac bez DPH" },
  { id: "T-2392", typ: "reklamacia", klient: "Advokátska kancelária Novák & Partners", kontakt: { meno: "JUDr. Alena Nováková", oslovenie: "Dobrý deň, pani doktorka", funkcia: "Partnerka", email: "a.novakova@novakpartners.example", tel: "+421 900 000 108" }, adresa: "Obchodná 40, Bratislava", zdroj: "E-mail", crm: { druh: "Dokument", cislo: "DOK-48098" }, stav: "Čaká na klienta", priorita: "Stredná", termin: "2026-11-17", pridelene: "Marek S.",
    popis: "Reklamácia faktúry za október, klient rozporuje počet dodaných fľaší.",
    historia: [{ d: "6. 11. 2026 10:00", k: "in", t: "E-mail: rozporuje faktúru." }, { d: "9. 11. 2026 12:00", k: "out", t: "Požiadali sme o doloženie dodacích listov." }],
    ai: { sablona: "reklamacia", krok: "Pripomenúť klientovi doloženie podkladov.", dovod: "Klient neodpovedal 10 dní." },
    vymena: "kontrola faktúry za október" }
];
window.AQ_INBOX = [
  { id: "M-501", od: "Ing. Peter Gál <p.gal@stavbyplus.example>", predmet: "Servisná kontrola dávkovača", cas: "19. 11. 2026 09:41",
    text: "Dobrý deň,\nnaš dávkovač na 2. poschodí hlási chybu a voda má zvláštnu chuť. Mohli by ste poslať technika?\nĎakujem, P. Gál",
    ai: { typ: "servis", klient: "Stavby Plus s.r.o. (rozpoznaný podľa e-mailovej domény)", priorita: "Vysoká", istota: "vysoká", popis: "Porucha dávkovača, chuť vody. Žiadosť o technika." } },
  { id: "M-502", od: "Zuzana Lukáčová <z.lukacova@kozmetika-lux.example>", predmet: "Nová cenová ponuka", cas: "19. 11. 2026 09:12",
    text: "Dobrý deň,\nzaujímame sa o dodávku vody pre salón (4 zamestnanci) a o cenu stolového dávkovača. Ďakujem.",
    ai: { typ: "ponuka", klient: "Nový kontakt – v CRM sa nenašiel", priorita: "Stredná", istota: "stredná", popis: "Dopyt na ponuku: dávkovač + dodávka pre 4 osoby. Odporúčame založiť lead." } },
  { id: "M-503", od: "Fakturácia <ucto@hotelpanorama.example>", predmet: "Re: Faktúra 2026-1187", cas: "19. 11. 2026 08:55",
    text: "Dobrý deň,\nprosíme o zaslanie kópie dodacieho listu k faktúre.\nĎakujeme",
    ai: { typ: "dodavka", klient: "Hotel Panoráma s.r.o.", priorita: "Nízka", istota: "stredná", popis: "Žiadosť o kópiu dodacieho listu (nejde o reklamáciu)." } },
  { id: "M-504", od: "newsletter@dodavatel.example", predmet: "Novinky v novembri", cas: "19. 11. 2026 08:03",
    text: "Pozrite si naše novinky… (hromadná správa)", ai: { typ: null, klient: "—", priorita: "—", istota: "vysoká", popis: "Hromadná správa, nie je úloha." } }
];
window.AQ_TEMPLATES = {
  reklamacia: { nazov: "Reakcia na reklamáciu", predmet: (t) => `Vaša reklamácia ${t.crm.cislo} – prijali sme ju` },
  servis: { nazov: "Oznámenie servisnej kontroly", predmet: (t) => `Servisná kontrola dávkovača – návrh termínu` },
  ponuka: { nazov: "Cenová ponuka", predmet: (t) => `Cenová ponuka pre ${t.klient}` },
  dodavka: { nazov: "Potvrdenie dodávky vody", predmet: (t) => `Potvrdenie dodávky vody – ${t.terminDodavky || "termín"}` },
  prieskum: { nazov: "Prieskum spokojnosti", predmet: () => "Ako sme sa vám páčili? Pár otázok na záver" }
};
