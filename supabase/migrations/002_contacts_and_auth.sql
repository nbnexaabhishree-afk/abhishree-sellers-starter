create extension if not exists "pgcrypto";

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null,
  normalized_phone text not null unique,
  project text,
  sector text,
  city text,
  source text,
  status text not null check (status in ('new', 'follow_up', 'qualified', 'won', 'lost', 'do_not_contact')),
  do_not_contact boolean not null default false,
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_status_idx on contacts (status);
create index if not exists contacts_do_not_contact_idx on contacts (do_not_contact);
create index if not exists contacts_created_at_idx on contacts (created_at desc);

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

create policy if not exists contacts_select_policy on contacts
for select
to authenticated
using (true);

create policy if not exists contacts_insert_policy on contacts
for insert
to authenticated
with check (true);

create policy if not exists contacts_update_policy on contacts
for update
to authenticated
using (true)
with check (true);

create policy if not exists contacts_delete_policy on contacts
for delete
to authenticated
using (true);

create policy if not exists contacts_no_anonymous_policy on contacts
for all
to anon
using (false)
with check (false);
