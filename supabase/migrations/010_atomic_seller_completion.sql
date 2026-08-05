-- Complete a seller conversation and create its lead/media records in one transaction.

begin;

create unique index seller_leads_conversation_state_uidx
on public.seller_leads(conversation_state_id)
where conversation_state_id is not null;

create or replace function public.complete_seller_conversation(
  target_workspace_id uuid,
  target_conversation_state_id uuid,
  target_whatsapp_message_id text,
  collected_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation public.conversation_state%rowtype;
  lead_id uuid;
  media_record jsonb;
  media_row_id uuid;
begin
  select * into conversation
  from public.conversation_state
  where id = target_conversation_state_id
    and workspace_id = target_workspace_id
    and flow_type = 'seller'
  for update;

  if conversation.id is null then
    raise exception 'Seller conversation not found in workspace';
  end if;

  media_record := collected_data -> 'property_media';
  if media_record is null
     or nullif(btrim(media_record ->> 'mediaId'), '') is null
     or (media_record ->> 'mediaType') not in ('image', 'video', 'document') then
    raise exception 'Completed seller media is invalid';
  end if;

  update public.conversation_state
  set current_step = 'completed',
      collected_data = complete_seller_conversation.collected_data,
      status = 'completed',
      completed_at = coalesce(completed_at, now())
  where id = conversation.id;

  insert into public.seller_leads (
    workspace_id, contact_id, whatsapp_contact_id, conversation_state_id,
    flow_type, status, seller_name, seller_email, property_type, bhk,
    area_sqft, location, expected_price, documents_available, raw_collected_data
  ) values (
    target_workspace_id, conversation.contact_id, conversation.whatsapp_contact_id, conversation.id,
    'seller', 'completed', collected_data ->> 'seller_name', collected_data ->> 'seller_email',
    collected_data ->> 'property_type', collected_data ->> 'bhk',
    (collected_data ->> 'area_sqft')::numeric, collected_data ->> 'location',
    (collected_data ->> 'expected_price')::numeric, (collected_data ->> 'documents_available')::boolean,
    collected_data
  )
  on conflict (conversation_state_id) where conversation_state_id is not null
  do update set
    status = excluded.status,
    seller_name = excluded.seller_name,
    seller_email = excluded.seller_email,
    property_type = excluded.property_type,
    bhk = excluded.bhk,
    area_sqft = excluded.area_sqft,
    location = excluded.location,
    expected_price = excluded.expected_price,
    documents_available = excluded.documents_available,
    raw_collected_data = excluded.raw_collected_data
  returning id into lead_id;

  insert into public.property_media (
    workspace_id, enquiry_id, seller_lead_id, conversation_state_id,
    whatsapp_message_id, media_id, media_type, storage_path,
    original_filename, mime_type, caption
  ) values (
    target_workspace_id, null, lead_id, conversation.id,
    target_whatsapp_message_id, media_record ->> 'mediaId', media_record ->> 'mediaType', null,
    media_record ->> 'filename', media_record ->> 'mimeType', media_record ->> 'caption'
  )
  on conflict (workspace_id, whatsapp_message_id) where whatsapp_message_id is not null
  do update set seller_lead_id = excluded.seller_lead_id
  returning id into media_row_id;

  return jsonb_build_object(
    'conversationStateId', conversation.id,
    'sellerLeadId', lead_id,
    'propertyMediaId', media_row_id
  );
end;
$$;

revoke all on function public.complete_seller_conversation(uuid, uuid, text, jsonb) from public;
grant execute on function public.complete_seller_conversation(uuid, uuid, text, jsonb) to service_role;

commit;
