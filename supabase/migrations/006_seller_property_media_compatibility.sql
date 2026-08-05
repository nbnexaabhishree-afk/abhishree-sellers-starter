-- Allow WhatsApp seller media introduced by migration 005 to exist without
-- fabricating a legacy enquiry or a local storage path.

begin;

alter table public.property_media
  alter column enquiry_id drop not null,
  alter column storage_path drop not null;

alter table public.property_media
  drop constraint if exists property_media_parent_required;

alter table public.property_media
  add constraint property_media_parent_required
  check (num_nonnulls(enquiry_id, property_id, seller_lead_id) >= 1)
  not valid;

alter table public.property_media
  validate constraint property_media_parent_required;

alter table public.property_media
  drop constraint if exists property_media_location_required;

alter table public.property_media
  add constraint property_media_location_required
  check (
    nullif(btrim(storage_path), '') is not null
    or nullif(btrim(media_id), '') is not null
  )
  not valid;

alter table public.property_media
  validate constraint property_media_location_required;

create unique index if not exists property_media_whatsapp_message_id_uidx
on public.property_media(whatsapp_message_id)
where whatsapp_message_id is not null;

commit;
