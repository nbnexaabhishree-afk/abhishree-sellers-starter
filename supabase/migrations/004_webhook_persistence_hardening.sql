-- Repair installations where an earlier partial table existed before migration 003.
-- CREATE TABLE IF NOT EXISTS does not add missing columns to an existing table.

alter table public.whatsapp_webhook_events add column if not exists id uuid default gen_random_uuid();
alter table public.whatsapp_webhook_events add column if not exists event_key text;
alter table public.whatsapp_webhook_events add column if not exists provider text default 'whatsapp';
alter table public.whatsapp_webhook_events add column if not exists payload jsonb;
alter table public.whatsapp_webhook_events add column if not exists processing_status text default 'queued';
alter table public.whatsapp_webhook_events add column if not exists attempts integer default 0;
alter table public.whatsapp_webhook_events add column if not exists error_message text;
alter table public.whatsapp_webhook_events add column if not exists received_at timestamptz default now();
alter table public.whatsapp_webhook_events add column if not exists processed_at timestamptz;

update public.whatsapp_webhook_events
set id = gen_random_uuid()
where id is null;

update public.whatsapp_webhook_events
set
  id = coalesce(id, gen_random_uuid()),
  event_key = coalesce(event_key, 'legacy:' || id::text),
  provider = coalesce(provider, 'whatsapp'),
  payload = coalesce(payload, '{}'::jsonb),
  processing_status = case
    when processing_status in ('queued', 'processed', 'failed') then processing_status
    else 'failed'
  end,
  attempts = coalesce(attempts, 0),
  received_at = coalesce(received_at, now())
where id is null
   or event_key is null
   or provider is null
   or payload is null
   or processing_status is null
   or processing_status not in ('queued', 'processed', 'failed')
   or attempts is null
   or received_at is null;

alter table public.whatsapp_webhook_events alter column id set default gen_random_uuid();
alter table public.whatsapp_webhook_events alter column id set not null;
alter table public.whatsapp_webhook_events alter column event_key set not null;
alter table public.whatsapp_webhook_events alter column provider set default 'whatsapp';
alter table public.whatsapp_webhook_events alter column provider set not null;
alter table public.whatsapp_webhook_events alter column payload set not null;
alter table public.whatsapp_webhook_events alter column processing_status set default 'queued';
alter table public.whatsapp_webhook_events alter column processing_status set not null;
alter table public.whatsapp_webhook_events alter column attempts set default 0;
alter table public.whatsapp_webhook_events alter column attempts set not null;
alter table public.whatsapp_webhook_events alter column received_at set default now();
alter table public.whatsapp_webhook_events alter column received_at set not null;

create unique index if not exists whatsapp_webhook_events_id_uidx
on public.whatsapp_webhook_events (id);

with ranked as (
  select id, row_number() over (partition by event_key order by received_at, id) as duplicate_number
  from public.whatsapp_webhook_events
)
update public.whatsapp_webhook_events target
set event_key = target.event_key || ':legacy-duplicate:' || target.id::text
from ranked
where target.id = ranked.id and ranked.duplicate_number > 1;

create unique index if not exists whatsapp_webhook_events_event_key_uidx
on public.whatsapp_webhook_events (event_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_webhook_events_processing_status_check'
      and conrelid = 'public.whatsapp_webhook_events'::regclass
  ) then
    alter table public.whatsapp_webhook_events
      add constraint whatsapp_webhook_events_processing_status_check
      check (processing_status in ('queued', 'processed', 'failed'));
  end if;
end $$;

alter table public.messages add column if not exists id uuid default gen_random_uuid();
alter table public.messages add column if not exists contact_id uuid;
alter table public.messages add column if not exists whatsapp_message_id text;
alter table public.messages add column if not exists direction text;
alter table public.messages add column if not exists message_type text;
alter table public.messages add column if not exists body text;
alter table public.messages add column if not exists status text default 'pending';
alter table public.messages add column if not exists raw_payload jsonb;
alter table public.messages add column if not exists created_at timestamptz default now();
alter table public.messages add column if not exists updated_at timestamptz default now();

update public.messages
set
  id = coalesce(id, gen_random_uuid()),
  direction = coalesce(direction, 'inbound'),
  message_type = coalesce(message_type, 'unsupported'),
  status = coalesce(status, 'pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where id is null
   or direction is null
   or message_type is null
   or status is null
   or created_at is null
   or updated_at is null;

alter table public.messages alter column id set default gen_random_uuid();
alter table public.messages alter column id set not null;
alter table public.messages alter column direction set not null;
alter table public.messages alter column message_type set not null;
alter table public.messages alter column status set default 'pending';
alter table public.messages alter column status set not null;
alter table public.messages alter column created_at set default now();
alter table public.messages alter column created_at set not null;
alter table public.messages alter column updated_at set default now();
alter table public.messages alter column updated_at set not null;

create unique index if not exists messages_id_uidx on public.messages (id);

with ranked as (
  select id, row_number() over (partition by whatsapp_message_id order by created_at, id) as duplicate_number
  from public.messages
  where whatsapp_message_id is not null
)
update public.messages target
set whatsapp_message_id = target.whatsapp_message_id || ':legacy-duplicate:' || target.id::text
from ranked
where target.id = ranked.id and ranked.duplicate_number > 1;

create unique index if not exists messages_whatsapp_message_id_uidx
on public.messages (whatsapp_message_id);

alter table public.whatsapp_contacts add column if not exists id uuid default gen_random_uuid();
alter table public.whatsapp_contacts add column if not exists contact_id uuid;
alter table public.whatsapp_contacts add column if not exists wa_id text;
alter table public.whatsapp_contacts add column if not exists profile_name text;
alter table public.whatsapp_contacts add column if not exists last_inbound_at timestamptz;
alter table public.whatsapp_contacts add column if not exists created_at timestamptz default now();
alter table public.whatsapp_contacts add column if not exists updated_at timestamptz default now();

update public.whatsapp_contacts
set id = gen_random_uuid()
where id is null;

update public.whatsapp_contacts
set
  id = coalesce(id, gen_random_uuid()),
  wa_id = coalesce(wa_id, 'legacy:' || id::text),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where id is null or wa_id is null or created_at is null or updated_at is null;

alter table public.whatsapp_contacts alter column id set default gen_random_uuid();
alter table public.whatsapp_contacts alter column id set not null;
alter table public.whatsapp_contacts alter column wa_id set not null;
alter table public.whatsapp_contacts alter column created_at set default now();
alter table public.whatsapp_contacts alter column created_at set not null;
alter table public.whatsapp_contacts alter column updated_at set default now();
alter table public.whatsapp_contacts alter column updated_at set not null;

create unique index if not exists whatsapp_contacts_id_uidx on public.whatsapp_contacts (id);

with ranked as (
  select id, row_number() over (partition by wa_id order by created_at, id) as duplicate_number
  from public.whatsapp_contacts
)
update public.whatsapp_contacts target
set wa_id = target.wa_id || ':legacy-duplicate:' || target.id::text
from ranked
where target.id = ranked.id and ranked.duplicate_number > 1;

create unique index if not exists whatsapp_contacts_wa_id_uidx
on public.whatsapp_contacts (wa_id);
