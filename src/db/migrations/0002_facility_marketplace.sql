do $$
begin
  create type facility_status as enum ('draft', 'approved', 'rejected', 'disabled', 'removed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type price_unit as enum ('month', 'day');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type availability_status as enum ('available', 'limited', 'waitlist', 'unavailable');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type review_status as enum ('published', 'hidden');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type tour_request_status as enum (
    'pending_review',
    'confirmed',
    'declined',
    'attended',
    'no_show',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type listing_submission_status as enum ('draft', 'submitted', 'approved', 'rejected', 'withdrawn');
exception when duplicate_object then null;
end $$;

create table if not exists facilities (
  id text primary key default ('fac_' || replace(gen_random_uuid()::text, '-', '')),
  slug text not null unique,
  name text not null,
  tagline text not null default '',
  status facility_status not null default 'draft',
  is_enabled boolean not null default false,
  care_types text[] not null default '{}',
  region_id text not null,
  district text not null default '',
  address text not null default '',
  postal_code text not null default '',
  price_from integer not null check (price_from >= 0),
  price_unit price_unit not null default 'month',
  rating numeric(3, 2) not null default 0 check (rating >= 0 and rating <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  image_url text not null default '',
  gallery_urls text[] not null default '{}',
  features text[] not null default '{}',
  languages text[] not null default '{}',
  capacity integer check (capacity is null or capacity >= 0),
  year_opened integer check (year_opened is null or year_opened >= 1800),
  licence text,
  about text not null default '',
  highlights text[] not null default '{}',
  right_for_you_if text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  availability_status availability_status not null default 'unavailable',
  beds_available integer check (beds_available is null or beds_available >= 0),
  availability_note text,
  availability_updated_at timestamptz,
  provider_contact_email citext,
  admin_notes text,
  moderation_state text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tagline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(district, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(about, '')), 'D')
  ) stored
);

create table if not exists facility_memberships (
  id text primary key default ('fmem_' || replace(gen_random_uuid()::text, '-', '')),
  facility_id text not null references facilities(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique (facility_id, user_id, role)
);

create table if not exists listing_submissions (
  id text primary key default ('sub_' || replace(gen_random_uuid()::text, '-', '')),
  facility_id text references facilities(id) on delete set null,
  submitter_user_id text references users(id) on delete set null,
  status listing_submission_status not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id text primary key default ('rev_' || replace(gen_random_uuid()::text, '-', '')),
  facility_id text not null references facilities(id) on delete cascade,
  author_name text not null,
  relationship text not null default '',
  rating integer not null check (rating >= 1 and rating <= 5),
  title text not null default '',
  body text not null default '',
  review_date date not null,
  verified boolean not null default false,
  status review_status not null default 'published',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists saved_facilities (
  id text primary key default ('save_' || replace(gen_random_uuid()::text, '-', '')),
  user_id text not null references users(id) on delete cascade,
  facility_id text not null references facilities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, facility_id)
);

create table if not exists tour_requests (
  id text primary key default ('tour_' || replace(gen_random_uuid()::text, '-', '')),
  user_id text not null references users(id) on delete cascade,
  facility_id text not null references facilities(id) on delete cascade,
  status tour_request_status not null default 'pending_review',
  contact_name text not null,
  contact_phone text not null,
  contact_email citext not null,
  preferred_date date not null,
  preferred_time text not null,
  care_notes text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists facilities_public_idx
  on facilities (status, is_enabled, region_id, price_from);

create index if not exists facilities_care_types_gin_idx on facilities using gin (care_types);
create index if not exists facilities_features_gin_idx on facilities using gin (features);
create index if not exists facilities_languages_gin_idx on facilities using gin (languages);
create index if not exists reviews_facility_published_idx on reviews (facility_id, review_date desc) where status = 'published';
create index if not exists saved_facilities_user_idx on saved_facilities (user_id, created_at desc);
create index if not exists tour_requests_user_idx on tour_requests (user_id, created_at desc);
create index if not exists facility_memberships_user_idx on facility_memberships (user_id, status);
