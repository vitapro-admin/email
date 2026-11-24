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
