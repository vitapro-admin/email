# 0008 · Používatelia, roly a oprávnenia

Stav: prijaté (24. 11. 2026)

## Rozhodnutia

- **Jeden adresár používateľov** v databáze (Postgres). Z neho sa berie podpis e-mailu, prideľovanie úloh a prístup k modulom. Actiwhere nie je zdrojom používateľov (API na to nemá koncové body).
- **Rola je zostava oprávnení.** Človek môže mať viac rolí, oprávnenia sa spájajú. Vstavané roly: superadmin, admin, podpora obchodu, obchod, ekonomika, servis, distribúcia, technické zabezpečenie. Ďalšie roly vie vytvárať a upravovať superadmin.
- **Superadmin** je nadradený všetkým: má všetky oprávnenia, jeho rola sa nedá upraviť a vie pridávať adminov. Je to „inžinier“ celého systému. Prvého superadmina založí príkaz v termináli.
- **Admin** spravuje používateľov nižších rolí a vidí záznam zmien. Nemôže vytvárať, meniť ani blokovať adminov a superadminov a nemôže prideliť ani odobrať rolu admin či superadmin.
- **Poistky:** nikto nemôže zablokovať sám seba, nemožno zablokovať ani odobrať rolu poslednému aktívnemu superadminovi, a obmedzené oprávnenia (správa rolí, výnimočný prístup k schránke) môže rolám prideliť len superadmin.
- **Súkromie:** superadmin vidí všetko v systéme (používatelia, roly, nastavenia, záznam zmien, údaje z CRM), ale **nie obsah cudzích schránok**. Výnimočný prístup k schránke (`mailbox:emergency-access`) je zatiaľ len vyhradené oprávnenie. Pre ostrú prevádzku sa musí doplniť postup so zdôvodnením, ktorý sa zaznamená.
- **Záznam zmien** (`audit_log`) sa len pridáva. Databáza zakazuje úpravu aj mazanie záznamov. Každá správcovská zmena sa zapíše v tej istej transakcii ako samotná zmena.
- **Účet je neaktívny = prístup končí okamžite** (kontrola pri každej požiadavke s krátkou pamäťou, najviac niekoľko sekúnd).

## Profil používateľa

Titul pred menom, meno, priezvisko, titul za menom, funkcia, telefón, pevná linka (voliteľne), oddelenie, pobočka (voliteľne), profilová fotografia. Oddelenia a pobočky sú zoznamy, ktoré spravuje admin. Fotografia sa ukazuje v aplikácii, do podpisu e-mailu nejde.

## Oprávnenia (prvý zoznam)

Prístup k modulom (pošta, podpora obchodu, obchod, servis, distribúcia, ekonomika, technické zabezpečenie, manažment), videnie úloh (vlastné, oddelenia, všetky), správa používateľov, správa rolí, záznam zmien, nastavenia, výnimočný prístup k schránke.

## Čo to nerieši (zatiaľ)

Vytváranie schránky a prihlasovacieho účtu v OIDC a Mailcow (krok U3), odchod zamestnanca (U4) a skutočné adaptéry (U5). Používateľ sa teraz vytvára len v adresári, schránka musí existovať.
