create extension if not exists pgcrypto;

create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null unique,
  source text,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_name text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  whatsapp_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  body text,
  status text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table enquiries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  purpose text check (purpose in ('sale','rent','later','not_interested')),
  project_name text,
  sector text,
  city text,
  configuration text,
  area text,
  expected_amount numeric,
  status text not null default 'new',
  notes text,
  follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

create table property_media (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  media_type text not null,
  storage_path text not null,
  original_filename text,
  mime_type text,
  created_at timestamptz not null default now()
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  payload jsonb not null,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_contact_created_idx on messages(contact_id, created_at desc);
create index enquiries_status_idx on enquiries(status);
create index webhook_events_unprocessed_idx on webhook_events(processed, created_at);
