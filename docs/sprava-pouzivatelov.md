# Správa používateľov: ako to vyskúšať

Prihlasovanie ide cez adresár používateľov v databáze. Heslo je stále heslo poštovej schránky, adresár rozhoduje, či a čo človek v aplikácii smie.

## Spustenie (vývoj): jeden príkaz

Pred prvým použitím sa musí bežať Docker Desktop. Potom z priečinka `~/email`:

```bash
pnpm dev
```

Príkaz sám spustí poštový server a databázu, naplní testovaciu poštu a používateľov, spustí server aj web a vypíše adresu `http://localhost:5173`. Vypnete ho stlačením `Ctrl + C` v tom istom okne, všetko sa vypne a upratá samo.

Po `git pull` ešte jednorazovo `pnpm install`.

| Prihlasovacie meno | Heslo        | Rola            |
| ------------------ | ------------ | --------------- |
| `podpora`          | `podpora`    | superadmin      |
| `ivana`            | `ivana`      | podpora obchodu |
| `integracia`       | `integracia` | servis          |
| `prijemca`         | `prijemca`   | obchod          |

Správa je v menu pri vašom mene (vpravo hore), ak má rola oprávnenie. Ivana ju nevidí, `podpora` áno.

Ak príkaz napíše, že na porte 3000 alebo 5173 už niečo beží, zostalo otvorené staré okno. Zatvorte ho (alebo v ňom stlačte `Ctrl + C`) a skúste znova.

## Pravidlá

- Rolu admin a superadmin prideľuje len superadmin. Admin ich nemôže upravovať ani blokovať.
- Nikto nezablokuje sám seba ani posledného aktívneho superadmina.
- Zablokovaný človek stratí prístup do niekoľkých sekúnd, aj keď je práve prihlásený.
- Každá zmena je v záznamu zmien, ktorý sa nedá upraviť ani zmazať.
- Superadmin nevidí obsah cudzích schránok (pozri `docs/decisions/0008-pouzivatelia-a-roly.md`).

## Prvý superadmin na novom serveri

```bash
DATABASE_URL=postgres://... pnpm --filter @aquapro/directory admin first-superadmin --login meno --email meno@firma.sk --first Meno --last Priezvisko
```

Príkaz funguje len dovtedy, kým žiadny superadmin neexistuje.
