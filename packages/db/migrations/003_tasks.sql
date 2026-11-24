-- Tasks of the add-on. A task is either an event mirrored from the CRM (crm_event_id set; its
-- content is read from crm_records and never changed here) or a local draft (title set).
-- Ownership and activity live only in our database.
create table tasks (
  id               bigserial primary key,
  crm_event_id     text unique,
  title            text,
  owner_user_id    bigint references users (id),
  created_by       bigint references users (id),
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  check (crm_event_id is not null or title is not null)
);
create index tasks_owner_idx on tasks (owner_user_id);
create index tasks_activity_idx on tasks (last_activity_at desc, id desc);

-- Creating and assigning tasks: support and admins.
insert into role_permissions (role_id, permission)
select r.id, 'tasks:manage' from roles r where r.key in ('admin', 'podpora_obchodu')
on conflict do nothing;
