-- Zrkadlo CRM (Actiwhere). Záznamy sa ukladajú ako surový JSON presne tak, ako ich vrátilo API,
-- aby sa mapovanie na vlastné stĺpce dalo urobiť až podľa skutočných ukážok a nič sa nehádalo.

create table app_settings (
  key   text primary key,
  value text not null
);

create table crm_records (
  entity        text        not null,
  crm_id        text        not null,
  data          jsonb       not null,
  content_hash  text        not null,
  first_seen_at timestamptz not null default now(),
  -- kedy sa obsah naposledy zmenil
  updated_at    timestamptz not null default now(),
  -- kedy ho naposledy vrátila úspešná synchronizácia
  last_seen_at  timestamptz not null default now(),
  -- ak ho CRM prestalo vracať, zostáva v databáze označený (nemaže sa)
  removed_at    timestamptz,
  primary key (entity, crm_id)
);

create index crm_records_active_idx on crm_records (entity) where removed_at is null;
create index crm_records_data_idx on crm_records using gin (data jsonb_path_ops);

create table crm_sync_runs (
  id          bigserial   primary key,
  entity      text        not null,
  environment text        not null check (environment in ('test', 'production')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text        not null check (status in ('ok', 'failed')),
  fetched     integer     not null default 0,
  inserted    integer     not null default 0,
  updated     integer     not null default 0,
  unchanged   integer     not null default 0,
  removed     integer     not null default 0,
  error       text
);

create index crm_sync_runs_entity_idx on crm_sync_runs (entity, started_at desc);

-- Záznam volaní do CRM: bez hesiel, kľúčov, relácií a obsahu.
create table crm_request_log (
  id          bigserial   primary key,
  at          timestamptz not null default now(),
  method      text        not null,
  endpoint    text        not null,
  status      integer     not null,
  duration_ms integer     not null,
  preview     boolean     not null,
  environment text        not null check (environment in ('test', 'production'))
);
