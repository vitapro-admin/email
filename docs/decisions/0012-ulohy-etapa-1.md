# 0012 · Úlohy, etapa 1: zoznam, detail, prideľovanie

Stav: prijaté (24. 11. 2026). Prvá etapa modulu úloh podľa 0005, 0009 a 0011. Komunikácia (e-maily, kanály) príde v etape 2.

## Čo etapa robí

- **Úloha** je buď event zo zrkadla CRM (obsah sa len číta, stav eventu sa z našej strany nikdy nemení), alebo lokálny návrh, ktorý v CRM ešte nevznikol.
- Každý event zo zrkadla sa zmení na úlohu automaticky (`adoptEvents`). Vlastníka, aktivitu a lokálne návrhy drží len naša databáza (tabuľka `tasks`).
- **Názvy polí CRM sú na jednom mieste** (`packages/tasks/src/mapping.ts`). Pochádzajú z falošného servera, postaveného podľa príručky. Keď prídu skutočné vzorky, upraví sa len tento súbor.
- Čitateľné názvy stavu, kategórie a priority sa berú zo zrkadla číselníkov (`referenceData`), ak nie sú, zobrazí sa číslo.

## Kto čo vidí

Oprávnenia sa spájajú:

- `tasks:view:all` alebo **`tasks:manage`**: všetky úlohy. Kto úlohy vytvára a prideľuje, musí vidieť všetky, inak by mu úloha po pridelení zmizla zo zoznamu.
- `tasks:view:department`: úlohy, ktorých vlastník je z rovnakého oddelenia.
- `tasks:view:own`: úlohy, ktorých je vlastníkom alebo tvorcom.
- Bez týchto oprávnení nie je modul Úlohy viditeľný.
- Kontrola je na serveri pri každej požiadavke. Úloha, ktorú človek nesmie vidieť, sa tvári ako neexistujúca.

`tasks:manage` majú predvolene admin a podpora obchodu. Vytvárať lokálne návrhy a prideľovať úlohy môže len ten, kto ho má. Pridelená môže byť len aktívnemu používateľovi. Vytvorenie aj pridelenie sa zapisuje do záznamu zmien.

## Otvorené (zatiaľ len odhad)

- Ako je vlastník zapísaný v eventoch Actiwhere (meno, e-mail, login). Kým to nevieme, prideľuje sa v našej databáze ručne.
- Naviazanie eventu na zákazníka (`customerId`) a ďalšie polia sa overia na vzorkách.
