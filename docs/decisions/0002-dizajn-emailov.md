# 0002 · Dizajn odchádzajúcich e-mailov

Stav: prijaté (24. 11. 2026), variant A

Každý odchádzajúci e-mail prejde jedným renderom (`packages/email-render`, MJML) z obmedzeného modelu obsahu (`packages/editor-schema`). Používateľ nemôže meniť písmo, veľkosť, farbu ani zarovnanie, lebo také voľby v modeli neexistujú.

## Schválené rozloženie (variant A: čistý)

- Biela stránka. V hlavičke vľavo logo a na tej istej úrovni vpravo nadpis (len pri šablónach).
- Pod tým text správy, voliteľná tabuľka údajov z CRM (medzi tenkými čiarami), podpis, citovaná história a päta.
- Variant B (karta na sivom podklade) bol zamietnutý a z kódu odstránený.

## Správanie na telefóne

- Krátky nadpis (do 24 znakov) ostáva vedľa loga aj na telefóne. Dlhší sa na telefóne presunie pod logo a zarovná doľava.
- Na telefóne sú okraje menšie (22 px) a text väčší (16 px).
- Dlhé slová, webové adresy a e-maily sa zalamujú, nikdy nepretekajú.

## Obsah a citácie

- Všetok text, ktorý sa dostane do odchádzajúceho e-mailu (písaný, vložený z Wordu/Outlooku, citovaný), prejde modelom obsahu `editor-schema`. Neznáme veci (fonty, veľkosti, farby, obrázky, skripty, skrytý text, nebezpečné odkazy) sa zahodia.
- Dáta zo servera (JSON z prehliadača) sa vždy znovu overia (`sanitizeDoc`), takže vzhľad sa nedá obísť ani priamym volaním API.
- Reply cituje len najnovší text pôvodnej správy (staršia história sa vynechá). Forward cituje celú správu aj s jej históriou, ktorú zobrazí ako citačné bloky.
- Veľmi dlhá citovaná správa sa skráti (20 000 znakov) a doplní sa poznámka.
- Predmet: jeden prefix `Re:` alebo `Fwd:`, predchádzajúce prefixy (RE, Odp, FW, Pred) sa odstránia.
- Čas v citácii sa vždy ukazuje v slovenskom čase.

## Spoločné pravidlá

- Logo je PNG a je v e-maile len raz (hore). Reply a forward používajú jednotný citovaný blok.
- Vždy sa vytvára aj textová verzia.
- Odkazy len `http`, `https`, `mailto`, `tel`.
- Písmo: skupina bezpečných fontov s Inter ako preferovaným. Svetlý režim (nepodporujeme inverziu tmavého režimu).
- Galéria ukážok: `pnpm gallery`.

## Otvorené

- Skutočný vzhľad v Outlooku (desktop), Gmaile a Apple Mail (až po odoslaní testovacieho e-mailu).
- Logo v e-maile bez sloganu alebo vo väčšom rozlíšení.
- Skutočný právny text päty od firmy.
