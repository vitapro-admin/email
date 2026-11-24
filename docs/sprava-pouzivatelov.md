# Správa používateľov: ako to vyskúšať

Prihlasovanie ide cez adresár používateľov v databáze. Heslo je stále heslo poštovej schránky, adresár rozhoduje, či a čo človek v aplikácii smie.

## Prvé spustenie (vývoj)

Všetko z priečinka `~/email`:

```bash
pnpm mail:up
```

```bash
pnpm mail:seed
```

```bash
pnpm admin:demo
```

`admin:demo` vytvorí používateľov zodpovedajúcich testovacím schránkam. Prvý, `podpora`, je **superadmin**.

| Prihlasovacie meno | Heslo        | Rola            |
| ------------------ | ------------ | --------------- |
| `podpora`          | `podpora`    | superadmin      |
| `ivana`            | `ivana`      | podpora obchodu |
| `integracia`       | `integracia` | servis          |
| `prijemca`         | `prijemca`   | obchod          |

Potom v dvoch termináloch `pnpm dev:api` a `pnpm dev:web`, aplikácia je na `http://localhost:5173`.

Správa je v menu pri vašom mene (vpravo hore), ak má rola oprávnenie. Ivana ju nevidí, `podpora` áno.

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
