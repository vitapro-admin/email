# 0003 · Odosielanie a zobrazenie pošty

Stav: prijaté (24. 11. 2026)

## Zobrazenie prichádzajúcej pošty (`packages/mail-sanitize`)

- Dve vrstvy ochrany: (1) allowlist sanitizér (len známe značky, atribúty a CSS vlastnosti; skripty, formuláre, rámce, SVG, nebezpečné odkazy a CSS, ktoré niečo načítava alebo polohuje, sa odstránia); (2) zobrazenie výlučne v `<iframe srcdoc>` s `sandbox="allow-popups allow-popups-to-escape-sandbox"` a prísnou CSP.
- Vzdialené obrázky sú predvolene blokované (sledovanie). Používateľ ich môže pre správu povoliť; sledovacie pixely (do 2×2 px) sa nepustia nikdy.
- Odkazy, ktorých viditeľný text ukazuje na iný web než skutočný cieľ, sa počítajú ako podozrivé (varovanie v rozhraní).

## Odosielanie (`packages/mail-gateway`)

- Odosielateľ (`From`) je vždy prihlásený používateľ z konfigurácie. Správa ho nesie nemôže, takže sa nedá sfalšovať.
- Kontrola pred odoslaním: príjemcovia (max. 100), adresy, predmet, hlavičky vlákna, prílohy (max. 20 MB) a ochrana proti vloženiu hlavičiek (CR/LF).
- Skrytá kópia (Bcc) sa použije len na doručenie a nikdy sa nezapíše do hlavičiek.
- Správa obsahuje HTML aj textovú verziu. Logo odchádza ako vložená príloha (`cid:`), takže sa zobrazí aj tam, kde sú vzdialené obrázky blokované. Toto rozhodnutie uzatvára otvorenú otázku z 0002.
- Odoslaná správa sa uloží aj do priečinka Odoslané (IMAP `APPEND`), označená ako prečítaná.
- Hlavičky vlákna: `In-Reply-To` a `References` (posledných 20).
