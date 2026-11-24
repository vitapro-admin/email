# 0009 · Komunikácia v úlohe, kanály a odchod zamestnanca

Stav: prijaté (24. 11. 2026). Dopĺňa 0005 (e-mail v úlohe) a 0008 (používatelia a roly). Implementácia až v module úloh (C2).

## Previazanie vlákna s úlohou

- Vlákno sa previaže s úlohou (event alebo dokument z CRM). Previazaním sa konkrétna komunikácia sprístupní všetkým, ktorí majú prístup k úlohe. **Ostatná pošta zostáva súkromná**: kolegovia nikdy nevidia priečinky ani vyhľadávanie v cudzej schránke.
- **Previazať sa dá:**
  1. automaticky, keď mail vzniká priamo v úlohe,
  2. tlačidlom „Vytvoriť event z e-mailu“: mail je potom prvou správou na časovej osi úlohy,
  3. ručne tlačidlom „Priradiť k úlohe“,
  4. na základe návrhu aplikácie (číslo úlohy v predmete, zhoda zákazníka v CRM), ktorý človek potvrdí. Aplikácia previaže sama len v prípadoch 1 a 2.
- **Všetky budúce správy** previazaného vlákna sa k úlohe pridávajú automaticky a majú viditeľný štítok „zdieľané v úlohe“.
- **Previazané správy sa ukladajú ako kópia** (telo, prílohy, hlavičky) do našej databázy. Po odchode zamestnanca alebo zmazaní originálu ostane komunikácia v úlohe zachovaná. Kópie sa zobrazujú rovnako bezpečne ako prichádzajúca pošta (sanitizér, sandbox, blokované vzdialené obrázky).
- **Odpojenie vlákna** (oprava omylu): bežný používateľ to nemôže, môže to len admin a s uvedeným dôvodom. Kópia sa nemaže, v úlohe sa len skryje a v zázname zmien ostane s dôvodom. Obnoviť ju môže len admin.
- **Prístup ku komunikácii** v úlohe majú všetci s prístupom k úlohe (podľa `tasks:view:*`) a admin.
- E-mail z úlohy sa vždy odosiela z adresy konkrétneho používateľa, nie zo spoločnej schránky.

## Vytvorenie úlohy z e-mailu

Zápis do Actiwhere ide vždy cez `POST /events` najprv ako náhľad (`preview: true`) a so schválením človekom (pravidlá z 0006). Kým event v CRM nevznikne, úloha beží ako lokálny návrh. Zákazníka aplikácia navrhne podľa adresy odosielateľa, človek potvrdí.

## Kanály

Úloha má viac kanálov, každý s vlastným vláknom a účastníkmi:

- **Kanál klienta** je jediný, v ktorom sa posiela skutočný e-mail von.
- **Interné kanály** (podpora–servis, podpora–obchod, podpora–ekonomika, ďalšie podľa potreby) sú správy v aplikácii so zmienkami (@meno) a notifikáciou. Nie sú to e-maily, takže pri nich technicky nemôže vzniknúť omyl s externým príjemcom.
- Ak treba komunikovať s externým partnerom (nie klientom), vzniká ďalší externý kanál s vlastnými pravidlami.
- **Viditeľnosť kanála:** predvolene ho vidia všetci s prístupom k úlohe. Pri vytvorení sa dá obmedziť na vybrané roly (napr. ekonomika, kde sú ceny a marže).
- **Kanály otvára podpora obchodu, obchod a admin.** Podpora obchodu spolu s obchodníkom zodpovedá za klienta.

## Odchod zamestnanca

- Pri zablokovaní používateľa admin vyberie **nástupcu**. Aplikácia ponúkne:
  1. prevod otvorených úloh na nástupcu,
  2. **presmerovanie (alias)** adresy odídenca na nástupcu na **12 mesiacov**, s pripomienkou adminovi pred koncom.
     Nič v poštovom serveri sa nezmení bez potvrdenia admina. Kým nemáme prepojenie na Mailcow, presmerovanie nastaví admin ručne.
- Odpoveď klienta na starú adresu sa pripojí k pôvodnému vláknu a úlohe. **Nový človek odpovedá vždy zo svojej adresy.**
- Zablokovanie schránky nie je jej zmazanie. Dĺžka archivácie sa určí s ohľadom na GDPR (otvorené).

## Kôš nedoručiteľnej pošty

Po skončení presmerovania, alebo ak pošta príde na neexistujúcu adresu, ide do **zbernej schránky** (catch-all kôš), kde sa zbiera a triedi.

- Prístup k nej majú len určené roly (admin a podpora obchodu), pretože sa tu zachytáva aj spam a prípadná súkromná pošta.
- **Neskôr:** triediaca nadstavba s definovanou logikou, prípadne agent, ktorý navrhne, komu mail patrí (podľa zákazníka v CRM, čísla úlohy, domény). Spĺňa pravidlá z CLAUDE.md: ide len cez `ai-gateway` s pseudonymizáciou, má len text na vstupe a výstupe, nič nepresúva ani neodosiela a každý návrh schvaľuje človek.

## Otvorené

- Dĺžka archivácie schránok odídených zamestnancov (GDPR).
- Čo presne umožňuje Mailcow API (aliasy, catch-all, správa schránok): zatiaľ len predpoklad, treba overiť.
- Skutočné polia eventov a dokumentov: čakáme na vzorky z CRM (docs/crm-pristup.md).
