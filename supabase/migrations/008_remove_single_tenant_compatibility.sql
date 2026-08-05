-- The workspace-aware application is deployed. Remove rollout defaults and
-- global uniqueness rules that would otherwise couple separate tenants.

begin;

alter table public.contacts alter column workspace_id drop default;
alter table public.campaigns alter column workspace_id drop default;
alter table public.messages alter column workspace_id drop default;
alter table public.enquiries alter column workspace_id drop default;
alter table public.property_media alter column workspace_id drop default;
alter table public.webhook_events alter column workspace_id drop default;
alter table public.whatsapp_webhook_events alter column workspace_id drop default;
alter table public.whatsapp_contacts alter column workspace_id drop default;
alter table public.conversation_state alter column workspace_id drop default;
alter table public.seller_leads alter column workspace_id drop default;
alter table public.properties alter column workspace_id drop default;

alter table public.contacts drop constraint if exists contacts_phone_key;
alter table public.whatsapp_contacts drop constraint if exists whatsapp_contacts_wa_id_key;
alter table public.messages drop constraint if exists messages_whatsapp_message_id_key;
alter table public.whatsapp_webhook_events drop constraint if exists whatsapp_webhook_events_event_key_key;

drop index if exists public.contacts_normalized_phone_idx;
drop index if exists public.whatsapp_contacts_wa_id_uidx;
drop index if exists public.messages_whatsapp_message_id_uidx;
drop index if exists public.whatsapp_webhook_events_event_key_uidx;
drop index if exists public.conversation_state_active_contact_idx;
drop index if exists public.property_media_whatsapp_message_id_uidx;

commit;
