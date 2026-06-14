create extension if not exists postgis;
create extension if not exists pg_trgm;

alter table facilities
  add column if not exists location geography(point, 4326)
  generated always as (
    case
      when latitude is not null and longitude is not null
      then st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
      else null
    end
  ) stored;

create or replace view public_facility_cards as
select
  id,
  slug,
  name,
  tagline,
  care_types,
  region_id,
  district,
  price_from,
  price_unit,
  rating,
  review_count,
  image_url,
  features,
  languages,
  availability_status,
  beds_available,
  availability_updated_at,
  latitude,
  longitude,
  created_at,
  updated_at
from facilities
where status = 'approved'
  and is_enabled = true;

create or replace view public_facility_details as
select
  id,
  slug,
  name,
  tagline,
  care_types,
  region_id,
  district,
  address,
  postal_code,
  price_from,
  price_unit,
  rating,
  review_count,
  image_url,
  gallery_urls,
  features,
  languages,
  capacity,
  year_opened,
  licence,
  about,
  highlights,
  right_for_you_if,
  availability_status,
  beds_available,
  availability_note,
  availability_updated_at,
  latitude,
  longitude,
  created_at,
  updated_at
from facilities
where status = 'approved'
  and is_enabled = true;

create index if not exists facilities_search_document_gin_idx
  on facilities using gin (search_document);

create index if not exists facilities_name_trgm_idx
  on facilities using gin (name gin_trgm_ops);

create index if not exists facilities_district_trgm_idx
  on facilities using gin (district gin_trgm_ops);

create index if not exists facilities_location_gist_idx
  on facilities using gist (location);
