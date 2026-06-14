create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  create type user_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

create table if not exists users (
  id text primary key default ('usr_' || replace(gen_random_uuid()::text, '-', '')),
  email citext not null unique,
  display_name text not null,
  password_hash text not null,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key default ('sess_' || replace(gen_random_uuid()::text, '-', '')),
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists roles (
  id text primary key,
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists user_roles (
  user_id text not null references users(id) on delete cascade,
  role_id text not null references roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists reference_items (
  id text not null,
  kind text not null check (kind in ('care_type', 'feature', 'language', 'region')),
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

create index if not exists sessions_user_active_idx
  on sessions (user_id, expires_at)
  where revoked_at is null;

create index if not exists reference_items_kind_sort_idx
  on reference_items (kind, sort_order, name);
