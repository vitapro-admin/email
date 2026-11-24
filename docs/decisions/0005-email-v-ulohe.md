# 0005 · E-mail v úlohe

Stav: návrh (24. 11. 2026), čaká na overenie bodov v otvorených otázkach

Písanie e-mailov je cieľovo súčasťou dashboardu podpory. Úloha (event alebo dokument z CRM) ukazuje časovú os komunikácie a e-mail sa píše priamo v nej. Mailový klient ostáva ako samostatný pohľad na celú poštu. Oba používajú rovnaké písanie (editor, render, citácia, odosielanie).

## Rozhodnutia

- Pošta zostáva na mailservere. Väzbu úloha a e-mail (Message-ID, vlákno, smer, stav, spôsob priradenia) drží naša databáza (Postgres), nie CRM.
- Viditeľnosť pre tím: pri odoslaní z úlohy ide BCC kópia do spoločnej schránky (napr. `ukoly@`). Neskôr sa zváži Reply-To s označením úlohy (vyžaduje plus-adresy v Mailcow).
- Priradenie prichádzajúcich e-mailov: (1) hlavičky vlákna, (2) číslo úlohy v predmete, (3) návrh podľa odosielateľa v CRM, ktorý potvrdí človek.
- Pri písaní v úlohe sú dve záložky: E-mail klientovi a Interná poznámka. Poznámka sa zapíše do CRM ako event a nikam von nejde.
- Po odoslaní sa do CRM zapíše event (vždy najprv `preview: true`). Naviazanie na zákazníka alebo dokument zatiaľ **nie je overené** a treba ho preveriť na testovacom CRM.
- Šablóna sa vyberie podľa typu úlohy, polia ide z CRM, návrh AI z časovej osi cez `ai-gateway`; odosiela a schvaľuje človek.

## Súkromie

V úlohe sa ukážu len e-maily s väzbou na úlohu. Ostatná osobná pošta ostáva súkromná. Kópia v spoločnej schránke podlieha rovnakým zásadám GDPR a dobe uchovávania.

## Plán fázy C

C1 Postgres a zrkadlo CRM (`crm-connector`) · C2 úlohy a dashboard podpory · C3 väzba e-mail a úloha, časová os · C4 písanie v úlohe, interná poznámka, zápis eventu do CRM · C5 triáž prijatých e-mailov.

Plné znenie je v dokumente „AQUA PRO · Návrh riešenia“, sekcia 9.
