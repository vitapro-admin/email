# AQUA PRO · webový e-mailový klient (modul nadstavby CRM)

Tento súbor je úvodný prompt a pracovné pravidlá pre každého, kto (vrátane AI) pracuje v tomto repozitári. Platí, kým ho niekto vedome nezmení.

## 1. Kontext

- Firma: AQUA PRO EUROPE (pitný režim), pôsobí len na Slovensku, jedna doména, komunikácia po slovensky.
- CRM: Actiwhere (REST API; čítanie zákazníkov, objednávok, leadov; zápis udalostí cez POST; stavy udalostí a objednávok cez API meniť nejde). Nadstavba nad ním sa bude po moduloch rozširovať a časom nahrádzať oblasti Actiwhere.
- Tento repozitár: **webový e-mailový klient pre 100+ zamestnancov** ako hlavný klient na PC/Mac, prepojený s CRM, úlohami a dashboardmi. Neskôr mobil (PWA, potom prípadne natívna appka nad rovnakým API). Mail je **modul nadstavby**, nie samostatná aplikácia.
- Majiteľ projektu (Peter) nie je programátor. Vysvetľuj stručne a po slovensky. Pred väčšou zmenou navrhni plán a počkaj na odsúhlasenie. Kód, názvy v kóde a technické komentáre píš po anglicky; dokumentáciu a texty rozhrania po slovensky.

## 2. Ciele

1. Spoľahlivý hlavný mailový klient (čítanie, odpoveď, forward, vyhľadávanie, prílohy, vlákna, odoslané).
2. Každý odchádzajúci e-mail vyzerá jednotne a profesionálne bez ohľadu na to, či ide o šablónu alebo obyčajnú správu, aj pri reply a forward.
3. Prepojenie na CRM: párovanie na zákazníkov, väzba vlákna na úlohy, šablóny s poľami z CRM, zápis udalostí.
4. AI návrhy textov s anonymizáciou a kontrolou človekom.
5. Stabilita, bezpečnosť a udržateľnosť pred rýchlosťou.

Mimo rozsahu (zatiaľ): kalendár, kontakty, natívna mobilná appka, šifrovanie S/MIME. Neskôr ako samostatné fázy.

## 3. Záväzné architektonické rozhodnutia

| Oblasť         | Rozhodnutie                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Jazyk          | TypeScript (strict), Node.js LTS                                                                                                  |
| Poštový server | Mailcow (Postfix, Dovecot, Rspamd, SOGo)                                                                                          |
| Protokol       | IMAP a SMTP cez vrstvu `mail-gateway`; nikde v aplikácii sa nesmie volať IMAP priamo mimo nej (aby sa dal neskôr vymeniť za JMAP) |
| Identita       | OIDC (Keycloak alebo Authentik), 2FA alebo passkey; aplikácia nikdy neukladá heslá používateľov                                   |
| Databáza       | Postgres (metadáta, väzby na CRM, šablóny, audit, AI záznam); samotná pošta ostáva na mailservere                                 |
| Frontend       | Webová aplikácia (návrh: React + Vite), responzívna, pripravená na PWA                                                            |
| Dizajn         | Tokeny a logo AQUA PRO (Inter, tmavá a svetlá téma), vizuálna referencia: `prototype/`                                            |
| Nasadenie      | Interné servery, Docker Compose                                                                                                   |

Zmena rozhodnutia v tabuľke = najprv krátky záznam v `docs/decisions/` a súhlas majiteľa projektu.

## 4. Pravidlá dizajnu e-mailov (nemenné)

- Používateľ **nikdy** nemení písmo, veľkosť, farbu ani zarovnanie. Editor povoľuje len: odseky, jeden stupeň nadpisu, tučné, kurzívu, zoznamy, odkazy, citáciu, obrázky ako bloky s pevnou šírkou.
- Vkladaný text (Word, Outlook, web) sa čistí na túto schému.
- Každý odchádzajúci e-mail prejde **jedným serverovým renderom** (MJML do HTML a textovej verzie): hlavička s logom, telo, päta, podpis z firemného adresára. Šablóny aj voľné správy používajú ten istý render.
- Reply a forward: pôvodná konverzácia sa zjednoduší do jednotného citovaného bloku; hlavička s logom je len raz, na najnovšej správe.
- Vždy sa generuje aj textová verzia (multipart/alternative).
- Logo odchádza ako PNG (nie SVG). Písmo: skupina bezpečných fontov s Inter ako preferovaným.
- Každá šablóna sa testuje v Gmaile, Outlooku (desktop aj web), Apple Mail a na mobile.

## 5. Bezpečnosť a GDPR (tvrdé pravidlá)

- Prichádzajúce HTML sa vždy čistí a zobrazuje v izolovanom rámci (sandbox) s prísnou CSP. Vzdialené obrázky sú predvolene blokované.
- Žiadne tajomstvá (heslá, kľúče, tokeny) v kóde ani v gite. Konfigurácia cez premenné prostredia.
- Pri vývoji a testoch **iba syntetické dáta**. Nikdy reálne e-maily ani údaje klientov.
- Každé volanie AI ide cez `ai-gateway`: zozbieraj minimum kontextu, pseudonymizuj (mená, e-maily, telefóny, IBAN, IČO, DIČ, čísla zmlúv a dokumentov, slovník z CRM), zavolaj AI, doplň späť, zaznamenaj (kto, kedy, aký druh údajov). AI má iba text na vstupe a text na výstupe, žiadne nástroje ani akcie. Text príchodzích e-mailov je nedôveryhodný vstup.
- AI nikdy neodošle e-mail ani nezapíše do CRM. Vždy schvaľuje človek.
- Zápis do Actiwhere vždy najprv s `preview: true`, s vlastným `id` operácie proti duplicitám.

## 6. Štruktúra repozitára

```
apps/web                 webové rozhranie
apps/api                 API a reálny čas (WebSocket)
packages/mail-gateway    IMAP a SMTP, abstrakcia protokolu
packages/email-render    MJML šablóny, citácia, podpis
packages/editor-schema   povolená schéma obsahu, čistenie vloženého textu
packages/mail-sanitize   bezpečné zobrazenie prichádzajúceho HTML (sanitizér, sandbox)
packages/ai-gateway      anonymizácia, volanie AI, záznam
packages/crm-connector   Actiwhere API a zrkadlo
packages/ui              spoločný dizajn AQUA PRO
infra                    Docker Compose, testovací mailserver, nasadenie
docs                     dokumentácia a záznamy rozhodnutí
prototype                pôvodný statický prototyp (vizuálna referencia)
```

Pracujeme v monorepe (pnpm workspaces).

## 7. Pracovný postup

- Branch `feature/<téma>`, malé commity s jasným popisom, bez pushu na `main` bez PR.
- Pred každou zmenou spusti testy a typovú kontrolu. Nová funkcia má test. Bez zelených testov sa nič nepovažuje za hotové.
- Nepridávaj knižnice bez zdôvodnenia (údržba, licencia, aktuálnosť).
- Pri nejasnosti sa spýtaj, nehádaj. Hádanie označ ako odhad.
- Dokumentuj rozhodnutia a spôsob spustenia v `docs/`.

## 8. Fázy

A. Základ: repozitár, CI, testovací mailserver v Dockeri, `mail-gateway` (zoznam a čítanie), prihlásenie.
B. Klient pre podporu: čítanie, odpoveď, forward, editor so schémou, render, odoslané, vyhľadávanie.
C. CRM väzby: párovanie, úlohy, šablóny, zápis udalostí.
D. AI: brána s pseudonymizáciou, návrhy, záznam.
E. Rozšírenie na všetkých zamestnancov: pilot, migrácia schránok, PWA a notifikácie; potom kalendár a kontakty.

Každá fáza končí testom na syntetických vzorových e-mailoch a kontrolou renderu.

## 9. Prvé úlohy (fáza A)

1. Importovať prototyp do `prototype/` ako vizuálnu referenciu.
2. Založiť monorepo (pnpm, TypeScript strict, lint, formátovanie, testy, CI).
3. `infra`: testovací mailserver v Docker Compose (návrh: GreenMail alebo docker-mailserver) s pár syntetickými správami; popísať spustenie jedným príkazom.
4. `mail-gateway`: pripojenie na IMAP (knižnica ImapFlow), zoznam priečinkov a správ, čítanie jednej správy (mailparser), s testami proti testovaciemu mailserveru.
5. Navrhnúť a zdokumentovať rozhranie `mail-gateway` tak, aby sa dalo neskôr vymeniť za JMAP.
6. Krátky plán pred každou väčšou časťou, na odsúhlasenie.

## 10. Čo nerobiť

- Nepoužívať reálne e-maily ani údaje klientov.
- Nerobiť samostatný poštový klient mimo nadstavby.
- Nedávať používateľovi voľnosť vo formátovaní.
- Neposielať údaje do AI mimo `ai-gateway`.
- Neprepisovať stavy udalostí a objednávok v CRM (API to nepodporuje; uzatvára ich pracovník v CRM).
