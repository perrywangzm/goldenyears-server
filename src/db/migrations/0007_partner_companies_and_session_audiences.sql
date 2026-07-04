do $$
begin
  create type company_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type session_audience as enum ('user', 'partner', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists companies (
  id text primary key default ('co_' || replace(gen_random_uuid()::text, '-', '')),
  name text not null,
  status company_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_users (
  company_id text not null references companies(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

alter table sessions add column if not exists audience session_audience;
update sessions set audience = 'user' where audience is null;
alter table sessions alter column audience set default 'user';
alter table sessions alter column audience set not null;

alter table facilities add column if not exists company_id text;
alter table listing_submissions add column if not exists company_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facilities_company_id_fkey') then
    alter table facilities
      add constraint facilities_company_id_fkey
      foreign key (company_id) references companies(id) on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listing_submissions_company_id_fkey') then
    alter table listing_submissions
      add constraint listing_submissions_company_id_fkey
      foreign key (company_id) references companies(id) on delete restrict;
  end if;
end $$;

create index if not exists company_users_user_status_idx on company_users (user_id, status);
create index if not exists company_users_company_status_idx on company_users (company_id, status);
create index if not exists facilities_company_id_idx on facilities (company_id);
create index if not exists listing_submissions_company_id_idx on listing_submissions (company_id);
create index if not exists sessions_token_hash_audience_idx on sessions (token_hash, audience);
