-- Adresár používateľov, roly, oprávnenia, zoznamy (oddelenia, pobočky) a záznam zmien.

create table departments (
  id     serial primary key,
  name   text not null,
  active boolean not null default true
);
create unique index departments_name_idx on departments (lower(name));

create table branches (
  id     serial primary key,
  name   text not null,
  active boolean not null default true
);
create unique index branches_name_idx on branches (lower(name));

create table roles (
  id          serial primary key,
  key         text not null unique,
  name        text not null,
  description text not null default '',
  builtin     boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index roles_name_idx on roles (lower(name));

create table role_permissions (
  role_id    integer not null references roles (id) on delete cascade,
  permission text    not null,
  primary key (role_id, permission)
);

create table users (
  id            bigserial primary key,
  login         text not null unique check (login = lower(login) and length(login) between 1 and 100),
  email         text not null,
  title_before  text,
  first_name    text not null,
  last_name     text not null,
  title_after   text,
  position      text,
  phone         text,
  landline      text,
  department_id integer references departments (id),
  branch_id     integer references branches (id),
  status        text not null default 'active' check (status in ('active', 'disabled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  disabled_at   timestamptz
);
create unique index users_email_idx on users (lower(email));

create table user_roles (
  user_id bigint  not null references users (id) on delete cascade,
  role_id integer not null references roles (id),
  primary key (user_id, role_id)
);
create index user_roles_role_idx on user_roles (role_id);

create table user_photos (
  user_id      bigint primary key references users (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data         bytea not null check (octet_length(data) <= 1048576),
  updated_at   timestamptz not null default now()
);

-- Záznam zmien: len pridávanie. Úprava aj mazanie sú v databáze zakázané.
create table audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    bigint,
  actor_login text not null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on audit_log (id desc);

create function audit_log_block_change() returns trigger as $$
begin
  raise exception 'audit_log je len na pridávanie';
end;
$$ language plpgsql;

create trigger audit_log_no_change before update or delete on audit_log
  for each row execute function audit_log_block_change();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function audit_log_block_change();

-- Vstavané roly a ich predvolené oprávnenia (upraviteľné okrem superadmina).
insert into roles (key, name, description, builtin) values
  ('superadmin', 'Superadmin', 'Nadradený všetkým, vie všetko v systéme. Nedá sa upraviť.', true),
  ('admin', 'Admin', 'Spravuje používateľov nižších rolí a vidí záznam zmien.', true),
  ('podpora_obchodu', 'Podpora obchodu', 'Úlohy a komunikácia podpory obchodu.', true),
  ('obchod', 'Obchod', 'Obchodníci: leady a ponuky.', true),
  ('ekonomika', 'Ekonomika', 'Ekonomické oddelenie.', true),
  ('servis', 'Servis', 'Servis a sanitácia.', true),
  ('distribucia', 'Distribúcia', 'Distribúcia a trasy.', true),
  ('technicke_zabezpecenie', 'Technické zabezpečenie', 'Technické zabezpečenie.', true);

insert into role_permissions (role_id, permission)
select r.id, p.permission from roles r
join (values
  ('admin', 'module:mail'), ('admin', 'module:management'), ('admin', 'users:view'), ('admin', 'users:manage'),
  ('admin', 'audit:view'), ('admin', 'tasks:view:all'),
  ('podpora_obchodu', 'module:mail'), ('podpora_obchodu', 'module:support'), ('podpora_obchodu', 'tasks:view:department'),
  ('obchod', 'module:mail'), ('obchod', 'module:sales'), ('obchod', 'tasks:view:own'),
  ('ekonomika', 'module:mail'), ('ekonomika', 'module:finance'), ('ekonomika', 'tasks:view:own'),
  ('servis', 'module:mail'), ('servis', 'module:service'), ('servis', 'tasks:view:own'),
  ('distribucia', 'module:mail'), ('distribucia', 'module:distribution'), ('distribucia', 'tasks:view:own'),
  ('technicke_zabezpecenie', 'module:mail'), ('technicke_zabezpecenie', 'module:technical'), ('technicke_zabezpecenie', 'tasks:view:own')
) as p (role_key, permission) on p.role_key = r.key;
