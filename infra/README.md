# Testovací mailserver

Lokálny mailserver (GreenMail) na vývoj. Obsahuje len vymyslené dáta a je dostupný iba z tvojho počítača. Vyžaduje spustený Docker.

## Spustenie

```bash
pnpm install
pnpm mail:up        # spustí testovací mailserver
pnpm mail:seed      # nahrá do schránky podpora@aquapro.test 8 vymyslených správ
```

Zastavenie (zmaže všetky správy): `pnpm mail:down`

## Pripojenie

| Služba | Adresa                   |
| ------ | ------------------------ |
| IMAP   | `127.0.0.1`, port `3143` |
| SMTP   | `127.0.0.1`, port `3025` |

Schránky (login = heslo): `podpora`, `ivana`, `integracia`, `prijemca`. Schránky `integracia` a `prijemca` slúžia len automatickým testom.

## Testy proti skutočnému serveru

```bash
pnpm mail:up
pnpm test:integration
```

Bez spusteného servera sa tieto testy preskočia a bežný `pnpm test` prejde aj tak.

## Poznámka

Server beží bez šifrovania a s jednoduchými heslami, preto je viazaný len na `127.0.0.1`. Nikdy ho nevystavuj do siete ani na internet.
