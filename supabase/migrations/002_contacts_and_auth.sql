create extension if not exists "pgcrypto";

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null,
  source text,
  do_not_contact boolean default false,
  created_at timestamptz not null default now()
);

alter table contacts add column if not exists project text;
alter table contacts add column if not exists sector text;
alter table contacts add column if not exists city text;
alter table contacts add column if not exists normalized_phone text;
alter table contacts add column if not exists status text;
alter table contacts add column if not exists notes text;
alter table contacts add column if not exists last_contacted_at timestamptz;
alter table contacts add column if not exists updated_at timestamptz;

DO $$
DECLARE
  invalid_count integer;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM contacts
  WHERE coalesce(btrim(phone), '') = ''
     OR (
       CASE
         WHEN regexp_replace(phone, '\D', '', 'g') ~ '^91[6-9][0-9]{9}$' THEN regexp_replace(phone, '\D', '', 'g')
         WHEN regexp_replace(phone, '\D', '', 'g') ~ '^[6-9][0-9]{9}$' THEN '91' || regexp_replace(phone, '\D', '', 'g')
         ELSE NULL
       END
     ) IS NULL;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot proceed: % row(s) with invalid phone numbers', invalid_count;
  END IF;
END $$;

update contacts
set normalized_phone = case
  when coalesce(btrim(normalized_phone), '') = '' then
    case
      when regexp_replace(phone, '\D', '', 'g') ~ '^91[6-9][0-9]{9}$' then regexp_replace(phone, '\D', '', 'g')
      when regexp_replace(phone, '\D', '', 'g') ~ '^[6-9][0-9]{9}$' then '91' || regexp_replace(phone, '\D', '', 'g')
      else null
    end
  else normalized_phone
end
where coalesce(btrim(normalized_phone), '') = '';

with ranked as (
  select
    id,
    normalized_phone,
    row_number() over (
      partition by normalized_phone
      order by created_at, id
    ) as rn
  from contacts
  where normalized_phone is not null
)
update contacts c
set
  name = coalesce(nullif(c.name, ''), (
    select nullif(d.name, '')
    from contacts d
    join ranked r on r.id = d.id
    where d.normalized_phone = c.normalized_phone
      and r.rn > 1
      and d.id <> c.id
      and nullif(d.name, '') is not null
    order by d.created_at, d.id
    limit 1
  )),
  project = coalesce(nullif(c.project, ''), (
    select nullif(d.project, '')
    from contacts d
    join ranked r on r.id = d.id
    where d.normalized_phone = c.normalized_phone
      and r.rn > 1
      and d.id <> c.id
      and nullif(d.project, '') is not null
    order by d.created_at, d.id
    limit 1
  )),
  sector = coalesce(nullif(c.sector, ''), (
    select nullif(d.sector, '')
    from contacts d
    join ranked r on r.id = d.id
    where d.normalized_phone = c.normalized_phone
      and r.rn > 1
      and d.id <> c.id
      and nullif(d.sector, '') is not null
    order by d.created_at, d.id
    limit 1
  )),
  city = coalesce(nullif(c.city, ''), (
    select nullif(d.city, '')
    from contacts d
    join ranked r on r.id = d.id
    where d.normalized_phone = c.normalized_phone
      and r.rn > 1
      and d.id <> c.id
      and nullif(d.city, '') is not null
    order by d.created_at, d.id
    limit 1
  )),
  source = coalesce(nullif(c.source, ''), (
    select nullif(d.source, '')
    from contacts d
    join ranked r on r.id = d.id
    where d.normalized_phone = c.normalized_phone
      and r.rn > 1
      and d.id <> c.id
      and nullif(d.source, '') is not null
    order by d.created_at, d.id
    limit 1
  )),
  notes = coalesce(nullif(c.notes, ''), (
    select nullif(d.notes, '')
    from contacts d
    join ranked r on r.id = d.id
    where d.normalized_phone = c.normalized_phone
      and r.rn > 1
      and d.id <> c.id
      and nullif(d.notes, '') is not null
    order by d.created_at, d.id
    limit 1
  )),
  do_not_contact = c.do_not_contact or exists (
    select 1
    from contacts d
    join ranked r on r.id = d.id
    where d.normalized_phone = c.normalized_phone
      and r.rn > 1
      and d.id <> c.id
      and coalesce(d.do_not_contact, false)
  ),
  status = coalesce(nullif(btrim(c.status), ''), (
    select nullif(btrim(d.status), '')
    from contacts d
    join ranked r on r.id = d.id
    where d.normalized_phone = c.normalized_phone
      and r.rn > 1
      and d.id <> c.id
      and nullif(btrim(d.status), '') is not null
    order by d.created_at, d.id
    limit 1
  ))
from ranked r
where c.id = r.id
  and r.rn = 1;

delete from contacts c
using (
  select
    id,
    normalized_phone,
    row_number() over (
      partition by normalized_phone
      order by created_at, id
    ) as rn
  from contacts
  where normalized_phone is not null
) ranked
where c.id = ranked.id
  and ranked.rn > 1;

alter table contacts alter column status set default 'new';
update contacts
set status = coalesce(nullif(btrim(status), ''), 'new')
where status is null or btrim(status) = '';

alter table contacts alter column do_not_contact set default false;
update contacts
set do_not_contact = coalesce(do_not_contact, false)
where do_not_contact is null;

alter table contacts alter column created_at set default now();
update contacts
set created_at = coalesce(created_at, now())
where created_at is null;

alter table contacts alter column updated_at set default now();
update contacts
set updated_at = coalesce(updated_at, now())
where updated_at is null;

alter table contacts alter column normalized_phone set not null;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_status_check'
  ) THEN
    ALTER TABLE contacts
    ADD CONSTRAINT contacts_status_check
    CHECK (status IN ('new', 'follow_up', 'qualified', 'won', 'lost', 'do_not_contact'));
  END IF;
END $$;

drop index if exists contacts_status_idx;
drop index if exists contacts_do_not_contact_idx;
drop index if exists contacts_created_at_idx;
drop index if exists contacts_normalized_phone_idx;

create index if not exists contacts_status_idx on contacts (status);
create index if not exists contacts_do_not_contact_idx on contacts (do_not_contact);
create index if not exists contacts_created_at_idx on contacts (created_at desc);
create unique index if not exists contacts_normalized_phone_idx on contacts (normalized_phone);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists contacts_updated_at_trigger on contacts;
create trigger contacts_updated_at_trigger
before update on contacts
for each row
execute function set_updated_at();

alter table contacts enable row level security;

drop policy if exists contacts_select_policy on contacts;
create policy contacts_select_policy on contacts
for select
to authenticated
using (true);

drop policy if exists contacts_insert_policy on contacts;
create policy contacts_insert_policy on contacts
for insert
to authenticated
with check (true);

drop policy if exists contacts_update_policy on contacts;
create policy contacts_update_policy on contacts
for update
to authenticated
using (true)
with check (true);

drop policy if exists contacts_delete_policy on contacts;
create policy contacts_delete_policy on contacts
for delete
to authenticated
using (true);

drop policy if exists contacts_no_anonymous_policy on contacts;
create policy contacts_no_anonymous_policy on contacts
for all
to anon
using (false)
with check (false);
