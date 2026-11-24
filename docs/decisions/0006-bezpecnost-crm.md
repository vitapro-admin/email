# 0006 · Ochrana živých údajov v CRM

Stav: prijaté (24. 11. 2026)

Vývoj a skúšky sa nikdy nerobia nad živými údajmi. Konektor `packages/crm-connector` to vynucuje v kóde, nielen dohodou.

- **Prostredie sa uvádza výslovne** (`test` alebo `production`), bez predvolenej hodnoty. Konektor ho nevie zistiť sám, zodpovedá za to ten, kto ho nastavuje.
- **Predvolene sa nezapisuje nič** (`writes: off`). Režim `preview` údaje len overí a Actiwhere ich vráti späť. Režim `on` zapisuje naozaj.
- **Skutočný zápis do živého CRM je zamknutý.** Odomkne sa len presnou frázou v konfigurácii (`UNLOCK_PRODUCTION_WRITES`) a len po samostatnom rozhodnutí. Režim `preview` voči živému CRM je dovolený.
- **Zoznam povolených zápisov:** predvolene len `POST /events`. Iné zápisy (zákazníci, objednávky, platby, sklad) sú zablokované.
- **Overenie sa nedá obísť:** `ignoreValidations` sa vždy posiela vypnuté a pri chybe v jednom zázname sa zruší celé volanie (`rollbackOnErrors`).
- **Duplicity:** každé volanie nesie `id`. Pri zopakovaní s rovnakým `id` ho Actiwhere odmietne (chyba 03).
- **Šifrovanie:** `https` je povinné (výnimka len pre lokálny testovací server).
- **Záznam volaní:** hlásenie obsahuje metódu, adresu, stav a trvanie. Nikdy nie heslá, kľúče, relácie ani obsah.
- Pri vývoji sa používa falošný Actiwhere (`pnpm crm:mock`), kým nie je k dispozícii testovacie CRM.

Zoznam toho, čo potrebujeme od IT a dodávateľa: `docs/crm-pristup.md`.
