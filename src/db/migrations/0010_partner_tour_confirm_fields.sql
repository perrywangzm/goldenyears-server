alter table tour_requests add column if not exists scheduled_date date;
alter table tour_requests add column if not exists scheduled_time text;
alter table tour_requests add column if not exists partner_message text;
