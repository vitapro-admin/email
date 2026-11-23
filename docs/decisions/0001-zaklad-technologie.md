# 0001 · Základné technológie

Stav: prijaté (23. 11. 2026)

- TypeScript (strict) na Node.js LTS, monorepo (pnpm workspaces).
- Poštový server Mailcow (IMAP a SMTP); aplikácia pristupuje k pošte len cez `packages/mail-gateway`, aby sa dal neskôr zmeniť protokol.
- Postgres pre metadáta, väzby na CRM, šablóny, audit a záznam AI.
- Identita cez OIDC (Keycloak alebo Authentik).
- Testy: Vitest; kontrola: ESLint, Prettier, `tsc`; CI v GitHub Actions.

Podrobnosti a dôvody: dokument „AQUA PRO · Návrh riešenia“ (sekcia 8) a `CLAUDE.md`.
