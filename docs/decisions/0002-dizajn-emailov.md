# 0002 · Dizajn odchádzajúcich e-mailov

Stav: prijaté (24. 11. 2026), variant A

Každý odchádzajúci e-mail prejde jedným renderom (`packages/email-render`, MJML) z obmedzeného modelu obsahu (`packages/editor-schema`). Používateľ nemôže meniť písmo, veľkosť, farbu ani zarovnanie, lebo také voľby v modeli neexistujú.

## Schválené rozloženie (variant A: čistý)

- Biela stránka. V hlavičke vľavo logo a na tej istej úrovni vpravo nadpis (len pri šablónach).
- Pod tým text správy, voliteľná tabuľka údajov z CRM (medzi tenkými čiarami), podpis, citovaná história a päta.
- Variant B (karta na sivom podklade) bol zamietnutý a z kódu odstránený.

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
