# 0002 · Dizajn odchádzajúcich e-mailov

Stav: návrh (24. 11. 2026), čaká na výber variantu

Každý odchádzajúci e-mail prejde jedným renderom (`packages/email-render`, MJML) z obmedzeného modelu obsahu (`packages/editor-schema`). Používateľ nemôže meniť písmo, veľkosť, farbu ani zarovnanie, lebo také voľby v modeli neexistujú.

Dva smery na výber (spustenie galérie: `pnpm gallery`):

- **A: čistý** biela stránka, logo vľavo, nadpis a tabuľka údajov s tenkými čiarami, inšpirované transakčnými e-mailmi.
- **B: karta** biela karta na svetlosivom podklade, logo na stred, tabuľka údajov na tónovanom podklade s akcentom.

Spoločné pravidlá: logo je PNG a je len raz (hore); reply a forward používajú jednotný citovaný blok; vždy sa vytvára aj textová verzia; odkazy len `http`, `https`, `mailto`, `tel`; písmo: skupina bezpečných fontov s Inter ako preferovaným; svetlý režim (nepodporujeme inverziu tmavého režimu).

Otvorené: skutočný vzhľad v Outlooku (desktop), Gmaile a Apple Mail; PNG logo vo vyššom rozlíšení; právny text päty od firmy.
