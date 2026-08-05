-- Multi-tenant SaaS foundation. Existing records and users are assigned to
-- Abhishree, the first workspace, without changing their business data.

begin;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner', 'admin', 'agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_id_idx
on public.workspace_members(user_id);

create table public.whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  credentials_mode text not null default 'encrypted'
    check (credentials_mode in ('environment', 'encrypted')),
  api_version text,
  phone_number_id text,
  business_account_id text,
  webhook_key uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_integration_secrets (
  integration_id uuid primary key references public.whatsapp_integrations(id) on delete cascade,
  access_token_ciphertext text not null,
  app_secret_ciphertext text not null,
  verify_token_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspaces (id, name, slug)
values ('00000000-0000-4000-8000-000000000001', 'Abhishree', 'abhishree');

insert into public.workspace_members (workspace_id, user_id, role)
select
  '00000000-0000-4000-8000-000000000001',
  ranked.id,
  case when ranked.member_number = 1 then 'owner' else 'admin' end
from (
  select id, row_number() over (order by created_at, id) as member_number
  from auth.users
) ranked;

insert into public.whatsapp_integrations (
  workspace_id,
  status,
  credentials_mode,
  webhook_key
)
values (
  '00000000-0000-4000-8000-000000000001',
  'active',
  'environment',
  '00000000-0000-4000-8000-000000000101'
);

alter table public.contacts add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.campaigns add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.messages add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.enquiries add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.property_media add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.webhook_events add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.whatsapp_webhook_events add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.whatsapp_contacts add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.conversation_state add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.seller_leads add column workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.properties add column workspace_id uuid references public.workspaces(id) on delete restrict;

update public.contacts set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.campaigns set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.messages set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.enquiries set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.property_media set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.webhook_events set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.whatsapp_webhook_events set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.whatsapp_contacts set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.conversation_state set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.seller_leads set workspace_id = '00000000-0000-4000-8000-000000000001';
update public.properties set workspace_id = '00000000-0000-4000-8000-000000000001';

alter table public.contacts alter column workspace_id set not null;
alter table public.campaigns alter column workspace_id set not null;
alter table public.messages alter column workspace_id set not null;
alter table public.enquiries alter column workspace_id set not null;
alter table public.property_media alter column workspace_id set not null;
alter table public.webhook_events alter column workspace_id set not null;
alter table public.whatsapp_webhook_events alter column workspace_id set not null;
alter table public.whatsapp_contacts alter column workspace_id set not null;
alter table public.conversation_state alter column workspace_id set not null;
alter table public.seller_leads alter column workspace_id set not null;
alter table public.properties alter column workspace_id set not null;

-- Temporary compatibility defaults keep the currently deployed Abhishree-only
-- application operational while the workspace-aware release is rolled out.
alter table public.contacts alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.campaigns alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.messages alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.enquiries alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.property_media alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.webhook_events alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.whatsapp_webhook_events alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.whatsapp_contacts alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.conversation_state alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.seller_leads alter column workspace_id set default '00000000-0000-4000-8000-000000000001';
alter table public.properties alter column workspace_id set default '00000000-0000-4000-8000-000000000001';

-- Legacy global unique indexes remain during rollout so the old webhook's
-- on-conflict targets keep working. A post-deploy cleanup migration removes
-- them after all writes send workspace_id explicitly.

create unique index contacts_workspace_normalized_phone_uidx
on public.contacts(workspace_id, normalized_phone)
where normalized_phone is not null;

create unique index whatsapp_contacts_workspace_wa_id_uidx
on public.whatsapp_contacts(workspace_id, wa_id);

create unique index messages_workspace_whatsapp_message_id_uidx
on public.messages(workspace_id, whatsapp_message_id);

create unique index whatsapp_webhook_events_workspace_event_key_uidx
on public.whatsapp_webhook_events(workspace_id, event_key);

create unique index conversation_state_workspace_active_contact_uidx
on public.conversation_state(workspace_id, whatsapp_contact_id)
where status = 'active';

create unique index property_media_workspace_whatsapp_message_id_uidx
on public.property_media(workspace_id, whatsapp_message_id)
where whatsapp_message_id is not null;

create index contacts_workspace_id_idx on public.contacts(workspace_id);
create index campaigns_workspace_id_idx on public.campaigns(workspace_id);
create index messages_workspace_id_idx on public.messages(workspace_id);
create index enquiries_workspace_id_idx on public.enquiries(workspace_id);
create index property_media_workspace_id_idx on public.property_media(workspace_id);
create index webhook_events_workspace_id_idx on public.webhook_events(workspace_id);
create index whatsapp_webhook_events_workspace_id_idx on public.whatsapp_webhook_events(workspace_id);
create index whatsapp_contacts_workspace_id_idx on public.whatsapp_contacts(workspace_id);
create index conversation_state_workspace_id_idx on public.conversation_state(workspace_id);
create index seller_leads_workspace_id_idx on public.seller_leads(workspace_id);
create index properties_workspace_id_idx on public.properties(workspace_id);

drop trigger if exists workspaces_updated_at on public.workspaces;
create trigger workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists workspace_members_updated_at on public.workspace_members;
create trigger workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_integrations_updated_at on public.whatsapp_integrations;
create trigger whatsapp_integrations_updated_at
before update on public.whatsapp_integrations
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_integration_secrets_updated_at on public.whatsapp_integration_secrets;
create trigger whatsapp_integration_secrets_updated_at
before update on public.whatsapp_integration_secrets
for each row execute function public.set_updated_at();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

create or replace function public.create_workspace(workspace_name text, workspace_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(btrim(workspace_name)) < 2
     or workspace_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid workspace name or slug';
  end if;

  insert into public.workspaces(name, slug)
  values (btrim(workspace_name), workspace_slug)
  returning id into new_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (new_workspace_id, auth.uid(), 'owner');

  insert into public.whatsapp_integrations(workspace_id, status, credentials_mode)
  values (new_workspace_id, 'disabled', 'encrypted');

  return new_workspace_id;
end;
$$;

revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'contacts', 'campaigns', 'messages', 'enquiries', 'property_media',
        'webhook_events', 'whatsapp_webhook_events', 'whatsapp_contacts',
        'conversation_state', 'seller_leads', 'properties', 'workspaces',
        'workspace_members', 'whatsapp_integrations', 'whatsapp_integration_secrets'
      ])
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.whatsapp_integrations enable row level security;
alter table public.whatsapp_integration_secrets enable row level security;
alter table public.contacts enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;
alter table public.enquiries enable row level security;
alter table public.property_media enable row level security;
alter table public.webhook_events enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.conversation_state enable row level security;
alter table public.seller_leads enable row level security;
alter table public.properties enable row level security;

create policy workspaces_member_select on public.workspaces
for select to authenticated
using (public.is_workspace_member(id));

create policy workspaces_admin_update on public.workspaces
for update to authenticated
using (public.has_workspace_role(id, array['owner', 'admin']))
with check (public.has_workspace_role(id, array['owner', 'admin']));

create policy workspace_members_member_select on public.workspace_members
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy workspace_members_owner_insert on public.workspace_members
for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner']));

create policy workspace_members_owner_update on public.workspace_members
for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

create policy workspace_members_owner_delete on public.workspace_members
for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner']));

create policy whatsapp_integrations_member_select on public.whatsapp_integrations
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy whatsapp_integrations_admin_write on public.whatsapp_integrations
for all to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy contacts_workspace_access on public.contacts for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy campaigns_workspace_access on public.campaigns for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy messages_workspace_access on public.messages for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy enquiries_workspace_access on public.enquiries for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy property_media_workspace_access on public.property_media for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy webhook_events_workspace_access on public.webhook_events for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy whatsapp_webhook_events_workspace_access on public.whatsapp_webhook_events for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy whatsapp_contacts_workspace_access on public.whatsapp_contacts for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy conversation_state_workspace_access on public.conversation_state for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy seller_leads_workspace_access on public.seller_leads for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy properties_workspace_access on public.properties for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

grant select on public.workspaces, public.workspace_members, public.whatsapp_integrations to authenticated;
grant update on public.workspaces to authenticated;
grant insert, update, delete on public.workspace_members, public.whatsapp_integrations to authenticated;

revoke all on public.whatsapp_integration_secrets from anon, authenticated;

commit;
