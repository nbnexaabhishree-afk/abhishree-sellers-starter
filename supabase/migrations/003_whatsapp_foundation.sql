create table if not exists whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  provider text not null default 'whatsapp',
  payload jsonb not null,
  processing_status text not null default 'queued',
  attempts integer not null default 0,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists whatsapp_webhook_events_received_at_idx on whatsapp_webhook_events (received_at desc);
create index if not exists whatsapp_webhook_events_processing_status_idx on whatsapp_webhook_events (processing_status);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  whatsapp_message_id text unique,
  conversation_id text,
  direction text not null,
  message_type text not null,
  body text,
  status text not null default 'pending',
  reply_to_message_id uuid,
  template_name text,
  media_id text,
  raw_payload jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_direction_idx on messages (direction);
create index if not exists messages_status_idx on messages (status);
create index if not exists messages_created_at_idx on messages (created_at desc);
create index if not exists messages_contact_id_idx on messages (contact_id);

create table if not exists whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  wa_id text not null unique,
  profile_name text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  service_window_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_contacts_contact_id_idx on whatsapp_contacts (contact_id);
create index if not exists whatsapp_contacts_last_inbound_idx on whatsapp_contacts (last_inbound_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists messages_updated_at_trigger on messages;
create trigger messages_updated_at_trigger
before update on messages
for each row
execute function set_updated_at();

drop trigger if exists whatsapp_contacts_updated_at_trigger on whatsapp_contacts;
create trigger whatsapp_contacts_updated_at_trigger
before update on whatsapp_contacts
for each row
execute function set_updated_at();

alter table whatsapp_webhook_events enable row level security;
alter table messages enable row level security;
alter table whatsapp_contacts enable row level security;

create policy if not exists whatsapp_webhook_events_select_policy on whatsapp_webhook_events
for select to authenticated using (true);
create policy if not exists whatsapp_webhook_events_insert_policy on whatsapp_webhook_events
for insert to authenticated with check (true);
create policy if not exists whatsapp_webhook_events_update_policy on whatsapp_webhook_events
for update to authenticated using (true) with check (true);
create policy if not exists whatsapp_webhook_events_no_anonymous_policy on whatsapp_webhook_events
for all to anon using (false) with check (false);

create policy if not exists messages_select_policy on messages
for select to authenticated using (true);
create policy if not exists messages_insert_policy on messages
for insert to authenticated with check (true);
create policy if not exists messages_update_policy on messages
for update to authenticated using (true) with check (true);
create policy if not exists messages_no_anonymous_policy on messages
for all to anon using (false) with check (false);

create policy if not exists whatsapp_contacts_select_policy on whatsapp_contacts
for select to authenticated using (true);
create policy if not exists whatsapp_contacts_insert_policy on whatsapp_contacts
for insert to authenticated with check (true);
create policy if not exists whatsapp_contacts_update_policy on whatsapp_contacts
for update to authenticated using (true) with check (true);
create policy if not exists whatsapp_contacts_no_anonymous_policy on whatsapp_contacts
for all to anon using (false) with check (false);
