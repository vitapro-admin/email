# 0004 · Webové rozhranie a API

Stav: prijaté (24. 11. 2026)

## Rozloženie

- `apps/api` (Fastify): prihlásenie, čítanie pošty, náhľad a odoslanie. `apps/web` (React, Vite): zoznam, čítanie, písanie.
- Editor (TipTap) má schému obmedzenú na odseky, jeden stupeň nadpisu, tučné, kurzívu, zoznamy, citát, odkaz a zalomenie riadka. Vložený text sa zredukuje na túto schému už pri vložení. Server obsah aj tak vždy znovu overí (`sanitizeDoc`), takže vzhľad sa nedá obísť priamym volaním API.
- Náhľad e-mailu v editore je skutočný výstup renderu (rovnaký ako odoslaný).
- Písanie sa dá otvoriť v samostatnom okne (`#/compose?...`), vhodné na druhý monitor. Hlavné okno sa po odoslaní obnoví (BroadcastChannel).

## Bezpečnosť

- Relácia: náhodný identifikátor v `HttpOnly` cookie s `SameSite=Strict` (`Secure` v produkcii), nečinnosť 30 minút, najviac 12 hodín. Limit prihlasovacích pokusov.
- Stavové volania musia niesť hlavičku `X-AQ-Client: web` a prípadný `Origin` musí byť vlastný (ochrana pred cudzími stránkami).
- Správa sa zobrazuje v rámci so `sandbox` a prísnou CSP. Prílohy sa vždy sťahujú ako súbor, nikdy sa nezobrazia v stránke.
- API odmietne spustenie v produkcii bez šifrovaného spojenia, s neoverenými certifikátmi alebo bez zabezpečenej cookie.

## Známe obmedzenia (vedomé)

- Vývojové prihlásenie používa heslo schránky a drží ho v pamäti servera počas relácie. V produkcii ho nahradí OIDC a prístup k schránke cez master user na mailservere.
- Zoznam správ je len podľa priečinka (bez vyhľadávania a vlákien), stránkovanie je pevne 100 správ.
- Sledovanie podľa užívateľa, koncepty a automatické uloženie nie sú zatiaľ implementované.
- Prepojenie na CRM a AI príde vo fázach C a D.

## Koncepty a prílohy (doplnené 24. 11. 2026)

- **Koncepty** sa ukladajú do priečinka Koncepty na poštovom serveri (nie v prehliadači), takže sú dostupné z iného počítača aj z iného klienta. Uloží sa príjemcovia, predmet, text, väzba na pôvodnú správu aj prílohy. Stav editora je v koncepte ako skrytá príloha `aquapro-draft.json`.
- **Automatické ukladanie** každých 15 sekúnd, ak sa niečo zmenilo. Nová verzia sa najprv uloží a až potom sa zmaže predchádzajúca, takže pri chybe koncept nezmizne.
- **Zatváranie:** ak je napísané niečo zmysluplné, okno sa opýta (Uložiť ako koncept, Zahodiť, Pokračovať v písaní). Prázdna správa alebo správa bez zmeny sa zatvorí bez otázky. Prehliadač varuje pri zatvorení karty s neuloženými zmenami.
- **Nové okno** najprv uloží koncept a pokračuje v ňom, takže sa nič nestratí.
- **Prílohy:** nahrávajú sa samostatne ako surové bajty, limit 20 MB spolu a 20 súborov. Spustiteľné súbory a skripty (.exe, .bat, .js, .scr, .msi a podobné) sú zakázané, kontrola je v prehliadači aj na serveri (server rozhoduje). Súbory čakajúce na odoslanie sú len v pamäti servera, patria jednej relácii a po 12 hodinách alebo po konci relácie sa zahodia.
- **Preposlanie** pribalí pôvodné prílohy ako bežné prílohy, ktoré sa dajú odstrániť.

Známe obmedzenie: súbory sú v pamäti servera. Pri väčšom počte používateľov sa presunú na disk.
