do $$
begin
  create type outbox_status as enum ('pending', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists audit_events (
  id text primary key default ('aud_' || replace(gen_random_uuid()::text, '-', '')),
  actor_user_id text references users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists outbox_events (
  id text primary key default ('out_' || replace(gen_random_uuid()::text, '-', '')),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status outbox_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists idempotency_keys (
  key text not null,
  user_id text references users(id) on delete cascade,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (key, user_id)
);

create index if not exists audit_events_resource_idx
  on audit_events (resource_type, resource_id, created_at desc);

create index if not exists audit_events_actor_idx
  on audit_events (actor_user_id, created_at desc);

create index if not exists outbox_events_pending_idx
  on outbox_events (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create index if not exists idempotency_keys_expiry_idx
  on idempotency_keys (expires_at);
