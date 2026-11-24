# Čo potrebujeme z CRM (Actiwhere): zoznam pre IT a dodávateľa

Cieľ: vyvíjať prepojenie na testovacom CRM tak, aby sa živé údaje nemohli pokaziť.

## Zásady

1. **Len testovacie prostredie.** Ostrú databázu nepoužívame na vývoj ani na skúšky.
2. **Osobné údaje.** V teste majú byť vymyslené alebo anonymizované údaje (mená, e-maily, telefóny, adresy, IČO). Reálne údaje klientov nepatria do vývoja ani do rozhovoru s AI.
3. **Zámky v kóde.** Konektor je predvolene len na čítanie. Zápis je najprv len „preview“ (Actiwhere údaje overí a vráti späť, nič nevznikne). Skutočný zápis je možný len do prostredia označeného ako testovacie. Do živého CRM sa skutočný zápis odomkne len výslovným a samostatným rozhodnutím.
4. **Najmenšie práva.** Integračný používateľ vie čítať a vytvárať udalosti (events). Nič iné.

## A. Prístup

| Čo                                                           | Poznámka                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Adresa testovacieho API                                      | tvar `https://<server>/<aplikácia>/rest`, výslovne testovacie prostredie                                              |
| API kľúč (GUID)                                              | pre testovaciu firmu                                                                                                  |
| Integračný používateľ (meno a heslo)                         | vyhradený pre integráciu, nie osobný účet                                                                             |
| Práva používateľa                                            | čítanie zákazníkov, kontaktov, zmlúv, objednávok, udalostí a referenčných údajov; zápis len udalostí (`POST /events`) |
| Potvrdenie, že ide o samostatnú testovaciu databázu          | zápis nesmie ovplyvniť produkciu                                                                                      |
| Postman kolekcia                                             | spomína sa v dokumentácii                                                                                             |
| Voliteľne: SQL prístup len na čítanie do testovacej databázy | pre údaje, ktoré API nevie filtrovať (udalosti)                                                                       |

**Odovzdanie:** heslá a kľúče neposielať e-mailom ani do chatu s AI. Nastaví ich Peter priamo do lokálnej konfigurácie (súbor `.env`, ktorý sa nedostane do gitu).

## B. Otázky pre dodávateľa Actiwhere

1. **Udalosť (`POST /events`):** dá sa naviazať na zákazníka, kontakt a dokument? Ktorými poliami? Kde nájdeme ID kategórií, podkategórií, priorít a stavov (názvy referenčných tabuliek pre `/referenceData`)?
2. **Čítanie udalostí (`GET /events`):** podľa dokumentácie filtruje len podľa `eventId`. Dá sa filtrovať podľa zákazníka, dátumu a stavu? Ak nie, je možné API rozšíriť alebo povoliť SQL na čítanie?
3. **Dokumenty** (dodávka vody, servisná návšteva, reklamácia, cenová ponuka): ktorý endpoint ich vracia? (`/documents` je v API pre faktúry. Sú to `/orders`?) Ako zistíme typ dokumentu, jeho stav (otvorený, ukončený) a zodpovednú osobu?
4. **Kontakty:** kde je e-mailová adresa kontaktu? Môže mať zákazník viac kontaktov a ako sa označí hlavný?
5. **Zmena stavu:** dá sa stav udalosti alebo dokumentu meniť cez API? (Z dokumentácie vyplýva, že `PATCH` majú len zákazníci a skladové doklady.)
6. **Zmeny v údajoch:** existujú webhooky alebo iný spôsob, ako zistiť zmeny bez neustáleho sťahovania? Aký je limit volaní?
7. **Testovacie prostredie:** je zápis povolený a ako sa údaje obnovujú?
8. **Používatelia:** dá sa cez API alebo SQL (na čítanie) získať zoznam používateľov Actiwhere (meno, rola, aktívny alebo neaktívny, telefón, e-mail)? Dá sa používateľ vytvoriť alebo zablokovať cez API? Dokumentácia uvádza len prihlásenie (`/login`), nie správu používateľov.

## C. Ak prístup potrvá: anonymizované ukážky odpovedí

Z Postmanu stačí uložiť odpovede API (JSON) a **pred poslaním nahradiť osobné údaje** vymyslenými. Štruktúru a ID nechať:

- 5 zákazníkov s kontaktmi (`GET /customers` s `includeContactDetails`, `includeAddressDetails`, `includeContractDetails`)
- 5 udalostí (`GET /events`)
- po 3 dokumenty: dodávka vody, servisná návšteva, reklamácia, cenová ponuka (odpoveď endpointu, ktorý ich vracia)
- odpovede `/documentTypes` a `/referenceData` pre kategórie, podkategórie, priority a stavy udalostí

Z nich dokážem postaviť mapovanie a zrkadlo údajov aj bez priameho prístupu.

## Čo robíme medzitým

Konektor na Actiwhere s ochranami a falošný Actiwhere server podľa dokumentácie sú hotové, takže vývoj nemusí čakať. Falošný server nie je skutočný systém: názvy polí v ňom sú ilustračné, kým nemáme skutočné ukážky.
