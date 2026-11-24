# 0010 · Spam, phishing a ochrana odchádzajúcej pošty

Stav: prijaté (24. 11. 2026). Dopĺňa 0009 (kôš nedoručiteľnej pošty). Implementácia sa rozloží do fáz B až E.

## Rozdelenie zodpovednosti

- **Server (Mailcow, Rspamd):** zahodí zjavný spam, vyhodnotí SPF, DKIM a DMARC, zvyšok spamu ukladá do priečinka Nevyžiadaná pošta.
- **Aplikácia:** zobrazí priečinok Nevyžiadaná pošta, ponúkne „Toto je spam“ a „Nie je spam“ (presun medzi priečinkami cez `mail-gateway`) a upozorní na podozrivých odosielateľov.
- Predpoklad na overenie: Mailcow sa učí z presunov správ do priečinka Nevyžiadaná pošta a späť.

## Kôš nedoručiteľnej pošty

- Do koša ide len pošta, ktorú Rspamd nevyhodnotil ako spam. Zjavný spam na neexistujúce adresy server odmietne pri prijatí.
- V koši je pri každej správe viditeľné skóre spamu a pôvod. Prístup majú len admin a podpora obchodu.

## Ochrana pred podvodmi pri čítaní

Pri zobrazení správy aplikácia ukáže varovný pás, keď:

- odosielateľ neprešiel DMARC, alebo sa zobrazované meno nezhoduje s adresou,
- odkaz zobrazuje inú adresu, než kam vedie,
- adresa je mimo domény firmy (len jemné označenie, nie varovanie).

Platí aj existujúce pravidlo: vzdialené obrázky sú blokované, sledovacie pixely sa nikdy nezobrazia.

## Odchádzajúca pošta

- Doména musí mať správne SPF, DKIM a DMARC. Je to súčasť kontrolného zoznamu nasadenia (`docs/`), nie kód aplikácie.
- **Limit 200 odoslaných správ za deň na používateľa**, zmeniteľný v nastaveniach. Pri prekročení sa odosielanie zastaví s jasnou správou. Admin dostane upozornenie aj pri neobvyklom náraste (napadnutý účet).

## Spam, úlohy a AI

- Správa v priečinku Nevyžiadaná pošta sa nedá previazať s úlohou ani sa z nej nedá vytvoriť event.
- Text príchodzích správ je nedôveryhodný vstup aj pre triediaceho agenta. Agent len navrhuje, nemá nástroje a ide cez `ai-gateway` (pravidlá z CLAUDE.md).

## Otvorené

- Overiť v Mailcow, ako sa učí Rspamd z presunov a ako sa nastavuje odmietnutie neexistujúcich adries oproti catch-all.
- Konkrétne prahy skóre pre odmietnutie a pre kôš, vyladiť na reálnej prevádzke.
