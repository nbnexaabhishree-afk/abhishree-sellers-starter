-- ==========================================
-- Migration 005: Seller Acquisition Schema
-- Phase 1: Conversation State
-- ==========================================

create table if not exists conversation_state (
    id uuid primary key default gen_random_uuid(),

    whatsapp_contact_id uuid
        references whatsapp_contacts(id)
        on delete cascade,

    contact_id uuid
        references contacts(id)
        on delete set null,

    flow_type text
        check (flow_type in ('seller', 'renter') or flow_type is null),

    current_step text not null default 'init',

    collected_data jsonb not null default '{}'::jsonb,

    status text not null default 'active'
        check (status in ('active', 'completed', 'abandoned', 'paused')),

    started_at timestamptz not null default now(),

    completed_at timestamptz,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);


-- One active conversation per WhatsApp contact

create unique index if not exists conversation_state_active_contact_idx
on conversation_state(whatsapp_contact_id)
where status = 'active';


create index if not exists conversation_state_status_idx
on conversation_state(status);


-- Updated timestamp trigger

drop trigger if exists conversation_state_updated_at on conversation_state;

create trigger conversation_state_updated_at
before update on conversation_state
for each row
execute function set_updated_at();


-- RLS

alter table conversation_state enable row level security;


create policy "authenticated users can view conversation states"
on conversation_state
for select
to authenticated
using (true);


create policy "authenticated users can modify conversation states"
on conversation_state
for all
to authenticated
using (true)
with check (true);
-- ==========================================
-- Seller Leads
-- ==========================================

create table if not exists seller_leads (

    id uuid primary key default gen_random_uuid(),

    contact_id uuid
        references contacts(id)
        on delete set null,

    whatsapp_contact_id uuid
        references whatsapp_contacts(id)
        on delete set null,

    conversation_state_id uuid
        references conversation_state(id)
        on delete set null,


    -- Flow

    flow_type text not null
        check (flow_type in ('seller','renter')),

    status text not null default 'in_progress'
        check (status in ('in_progress','completed','abandoned')),


    -- Seller Details

    seller_name text,

    seller_whatsapp_number text,

    seller_email text,


    -- Property Details

    property_type text,

    bhk text,

    area_sqft numeric,

    location text,

    floor text,

    total_floors text,

    facing text,

    entrance_direction text,

    property_age text,

    bedrooms integer,

    bathrooms integer,

    balcony_count integer,

    balcony_area text,


    furnishing_status text
        check (
            furnishing_status in
            ('raw','semi_furnished','fully_furnished')
            or furnishing_status is null
        ),

    included_items jsonb,


    -- Practical Details

    parking text,

    society_name text,


    -- Financial Details

    expected_price numeric,

    maintenance_charges text,


    -- Legal Details

    ownership_history text
        check (
            ownership_history in
            (
                'first_owner',
                'second_owner',
                'third_owner_or_more',
                'investor_owned'
            )
            or ownership_history is null
        ),

    documents_available boolean,

    document_types jsonb,

    loan_status text,


    -- Raw conversation backup

    raw_collected_data jsonb,


    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);


-- Indexes

create index if not exists seller_leads_contact_id_idx
on seller_leads(contact_id);


create index if not exists seller_leads_whatsapp_contact_id_idx
on seller_leads(whatsapp_contact_id);


create index if not exists seller_leads_status_idx
on seller_leads(status);


create index if not exists seller_leads_created_at_idx
on seller_leads(created_at desc);


-- Updated timestamp

drop trigger if exists seller_leads_updated_at on seller_leads;

create trigger seller_leads_updated_at
before update on seller_leads
for each row
execute function set_updated_at();


-- RLS

alter table seller_leads enable row level security;


create policy "authenticated users can view seller leads"
on seller_leads
for select
to authenticated
using (true);


create policy "authenticated users can modify seller leads"
on seller_leads
for all
to authenticated
using (true)
with check (true);

-- ==========================================
-- Properties
-- ==========================================

create table if not exists properties (

    id uuid primary key default gen_random_uuid(),

    seller_lead_id uuid
        references seller_leads(id)
        on delete cascade,

    contact_id uuid
        references contacts(id)
        on delete set null,


    property_type text,

    bhk text,

    area_sqft numeric,

    location text,

    floor text,

    total_floors text,

    facing text,

    entrance_direction text,

    property_age text,

    bedrooms integer,

    bathrooms integer,

    balcony_count integer,

    balcony_area text,


    furnishing_status text
        check (
            furnishing_status in
            ('raw','semi_furnished','fully_furnished')
            or furnishing_status is null
        ),


    included_items jsonb,


    parking text,

    society_name text,


    expected_price numeric,

    maintenance_charges text,


    ownership_history text
        check (
            ownership_history in
            (
                'first_owner',
                'second_owner',
                'third_owner_or_more',
                'investor_owned'
            )
            or ownership_history is null
        ),


    documents_available boolean,

    document_types jsonb,

    loan_status text,


    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now()
);


-- Indexes

create index if not exists properties_seller_lead_id_idx
on properties(seller_lead_id);


create index if not exists properties_contact_id_idx
on properties(contact_id);


create index if not exists properties_location_idx
on properties(location);


-- Updated timestamp

drop trigger if exists properties_updated_at on properties;

create trigger properties_updated_at
before update on properties
for each row
execute function set_updated_at();


-- RLS

alter table properties enable row level security;


create policy "authenticated users can view properties"
on properties
for select
to authenticated
using (true);


create policy "authenticated users can modify properties"
on properties
for all
to authenticated
using (true)
with check (true);

-- ==========================================
-- Property Media Extensions
-- Keep existing enquiry_id for backward compatibility
-- ==========================================

alter table property_media
add column if not exists property_id uuid
references properties(id)
on delete cascade;


alter table property_media
add column if not exists seller_lead_id uuid
references seller_leads(id)
on delete cascade;


alter table property_media
add column if not exists conversation_state_id uuid
references conversation_state(id)
on delete set null;


alter table property_media
add column if not exists whatsapp_message_id text;


alter table property_media
add column if not exists media_id text;


alter table property_media
add column if not exists caption text;


alter table property_media
add column if not exists file_size bigint;


alter table property_media
add column if not exists updated_at timestamptz default now();



-- Indexes

create index if not exists property_media_property_id_idx
on property_media(property_id);


create index if not exists property_media_seller_lead_id_idx
on property_media(seller_lead_id);


create index if not exists property_media_conversation_state_id_idx
on property_media(conversation_state_id);



-- Updated timestamp

drop trigger if exists property_media_updated_at on property_media;

create trigger property_media_updated_at
before update on property_media
for each row
execute function set_updated_at();



-- RLS

alter table property_media enable row level security;


create policy "authenticated users can view property media"
on property_media
for select
to authenticated
using (true);


create policy "authenticated users can modify property media"
on property_media
for all
to authenticated
using (true)
with check (true);