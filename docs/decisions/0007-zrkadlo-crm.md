# 0007 · Zrkadlo CRM v databáze

Stav: prijaté (24. 11. 2026)

## Rozhodnutia

- **Surový JSON.** Záznamy z CRM sa ukladajú do `crm_records` presne tak, ako ich vrátilo API (stĺpec `data` typu JSONB). Mapovanie na vlastné stĺpce a tabuľky sa urobí až podľa skutočných ukážok, aby sa nehádali názvy polí.
- **Synchronizácia je len na čítanie.** Odmietne klienta s právom zápisu. Do CRM sa nič nezapisuje.
- **Čítanie sa dokončí celé, potom sa mení databáza.** Zmena prebehne v jednej transakcii. Pri chybe uprostred čítania ostanú predchádzajúce údaje bezo zmeny a beh sa zaznamená ako neúspešný.
- **Nič sa nemaže.** Záznam, ktorý CRM prestalo vracať, dostane `removed_at` a ostáva. Ak sa vráti, obnoví sa.
- **Ochrana pred hromadným zmazaním.** Ak by jeden beh označil za odstránené viac ako 10 záznamov a viac ako polovicu existujúcich, beh sa odmietne (zlá alebo prázdna odpoveď). Obísť sa dá len výslovným povolením.
- **Žiadne hádanie.** Záznam bez poľa s identifikátorom alebo opakujúci sa identifikátor je chyba. Predvolene sa synchronizujú len zákazníci (`customerId`) a udalosti (`eventId`), ktorých polia uvádza dokumentácia.
- **Jedno prostredie na databázu.** Prvá synchronizácia zapíše prostredie (`test` alebo `production`) a ďalšie z iného prostredia sa odmietnu, takže sa testovacie a živé údaje nikdy nepomiešajú.
- **Čítanie zo živého CRM je zamknuté** aj pre synchronizáciu (`ACTIWHERE_PRODUCTION_READ`), lebo vývoj nemá obsahovať živé osobné údaje.
- **Záznam volaní** (`crm_request_log`) a behov (`crm_sync_runs`) bez hesiel, kľúčov a obsahu.

## Migrácie

Súbory `packages/db/migrations/NNN_nazov.sql` sa používajú v poradí, každý v samostatnej transakcii pod zámkom. Už použitá migrácia sa nesmie meniť (kontrola kontrolným súčtom), zmeny idú novou migráciou.

## Známe obmedzenia

- Celý zoznam sa pri behu načíta do pamäte. Pre státisíce záznamov bude treba spracovanie po dávkach.
- Sťahujú sa vždy všetky záznamy (žiadne prírastkové čítanie), lebo API nemá filter podľa dátumu zmeny. Treba preveriť u dodávateľa.
