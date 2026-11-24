# AQUA PRO · e-mailový klient

Webový e-mailový klient ako modul nadstavby CRM. Pravidlá projektu a architektúra: [CLAUDE.md](CLAUDE.md).

## Spustenie kontrol

```bash
pnpm install
pnpm check
```

Vyžaduje Node.js 22 a pnpm 10.

## Spustenie aplikácie (vývoj)

V troch termináloch, v priečinku projektu:

```bash
pnpm mail:up && pnpm mail:seed   # testovací mailserver s vymyslenými správami
pnpm dev:api                     # API na http://127.0.0.1:3000
pnpm dev:web                     # rozhranie na http://localhost:5173
```

Prihlásenie: meno `ivana`, heslo `ivana` (ďalšie schránky: `podpora`, `prijemca`). Vývojové prihlásenie používa údaje schránky, v produkcii ho nahradí prihlásenie cez OIDC.

Test v skutočnom prehliadači (celý postup od prihlásenia po odoslanie):

```bash
pnpm exec playwright install chromium   # raz
pnpm e2e
```

Galéria dizajnu e-mailov: `pnpm gallery`.

## Databáza a zrkadlo CRM

`pnpm mail:up` spustí okrem mailservera aj PostgreSQL. Bez skutočného CRM si zrkadlo vyskúšaš s falošným Actiwhere:

```bash
pnpm mail:up
pnpm crm:demo        # spustí falošný Actiwhere, skopíruje jeho údaje do databázy a vypíše výsledok
```

S testovacím CRM (až bude prístup): skopíruj `.env.example` do `.env`, doplň údaje a spusti `pnpm crm:sync`. Pravidlá ochrany živých údajov: `docs/decisions/0006-bezpecnost-crm.md`.
