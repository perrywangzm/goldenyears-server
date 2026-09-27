do $$
begin
  create type review_response_status as enum ('published', 'removed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type review_flag_status as enum ('pending', 'accepted', 'rejected', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type review_flag_reason as enum (
    'inaccurate_info',
    'inappropriate_content',
    'privacy_concern',
    'spam',
    'other'
  );
exception when duplicate_object then null;
end $$;

alter table facilities
  add column if not exists tour_availability jsonb not null default '{}'::jsonb,
  add column if not exists tour_availability_updated_at timestamptz;

create table if not exists review_responses (
  id text primary key default ('rresp_' || replace(gen_random_uuid()::text, '-', '')),
  review_id text not null references reviews(id) on delete cascade,
  facility_id text not null references facilities(id) on delete cascade,
  responder_user_id text references users(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  status review_response_status not null default 'published',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id)
);

create table if not exists review_flags (
  id text primary key default ('rflag_' || replace(gen_random_uuid()::text, '-', '')),
  review_id text not null references reviews(id) on delete cascade,
  facility_id text not null references facilities(id) on delete cascade,
  flagged_by_user_id text references users(id) on delete set null,
  reason review_flag_reason not null,
  details text,
  status review_flag_status not null default 'pending',
  resolver_user_id text references users(id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists review_flags_pending_actor_idx
  on review_flags (review_id, flagged_by_user_id)
  where status = 'pending' and flagged_by_user_id is not null;

create index if not exists review_responses_facility_status_updated_idx
  on review_responses (facility_id, status, updated_at desc);

create index if not exists review_flags_facility_status_created_idx
  on review_flags (facility_id, status, created_at desc);

create index if not exists review_flags_review_status_idx
  on review_flags (review_id, status);

create index if not exists tour_requests_facility_status_created_idx
  on tour_requests (facility_id, status, created_at desc);

create index if not exists audit_events_facility_recent_idx
  on audit_events (resource_id, created_at desc)
  where resource_type = 'facility';
