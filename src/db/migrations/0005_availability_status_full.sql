-- Mockup and facility-manager flows use "full" (at capacity, no waitlist).
-- Align Postgres enum with product source data in golden-years-mockup/data/facilities.json.

do $$
begin
  alter type availability_status add value 'full';
exception
  when duplicate_object then null;
end $$;
