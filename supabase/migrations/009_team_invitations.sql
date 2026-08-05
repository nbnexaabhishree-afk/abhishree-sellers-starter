-- Team invitations, role management, and owner safety for multi-tenant workspaces.

begin;

alter table public.workspace_members add column email text;

update public.workspace_members member
set email = lower(users.email)
from auth.users users
where users.id = member.user_id;

create or replace function public.populate_workspace_member_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email is null then
    select lower(email) into new.email from auth.users where id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger workspace_members_populate_email
before insert or update of user_id on public.workspace_members
for each row execute function public.populate_workspace_member_email();

create or replace function public.protect_last_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_count integer;
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    perform pg_advisory_xact_lock(hashtextextended(old.workspace_id::text, 0));
    select count(*) into owner_count from public.workspace_members
    where workspace_id = old.workspace_id and role = 'owner';
    if owner_count <= 1 then raise exception 'A workspace must retain at least one owner'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger workspace_members_protect_last_owner
before update of role or delete on public.workspace_members
for each row execute function public.protect_last_workspace_owner();

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  role text not null default 'agent' check (role in ('admin', 'agent')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workspace_invitations_pending_email_key
on public.workspace_invitations(workspace_id, email)
where status = 'pending';

create index workspace_invitations_workspace_id_idx
on public.workspace_invitations(workspace_id, created_at desc);

create trigger workspace_invitations_updated_at
before update on public.workspace_invitations
for each row execute function public.set_updated_at();

alter table public.workspace_invitations enable row level security;

create policy workspace_invitations_member_select on public.workspace_invitations
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy workspace_invitations_manager_insert on public.workspace_invitations
for insert to authenticated
with check (
  invited_by = auth.uid()
  and (
    (role = 'admin' and public.has_workspace_role(workspace_id, array['owner']))
    or (role = 'agent' and public.has_workspace_role(workspace_id, array['owner', 'admin']))
  )
);

create policy workspace_invitations_manager_update on public.workspace_invitations
for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create or replace function public.accept_workspace_invitation(invitation_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.workspace_invitations%rowtype;
  user_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select * into invitation
  from public.workspace_invitations
  where token_hash = invitation_token_hash
  for update;

  if invitation.id is null or invitation.status <> 'pending' then
    raise exception 'Invitation is invalid or no longer pending';
  end if;
  if invitation.expires_at <= now() then
    update public.workspace_invitations set status = 'expired' where id = invitation.id;
    raise exception 'Invitation has expired';
  end if;
  if invitation.email <> user_email then
    raise exception 'Invitation email does not match authenticated user';
  end if;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (invitation.workspace_id, auth.uid(), invitation.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = invitation.id;

  return invitation.workspace_id;
end;
$$;

create or replace function public.manage_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid,
  new_role text default null,
  remove_member boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  target_role text;
  owner_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text, 0));
  select role into actor_role from public.workspace_members
  where workspace_id = target_workspace_id and user_id = auth.uid();
  select role into target_role from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id
  for update;

  if actor_role is null or target_role is null then
    raise exception 'Workspace membership required';
  end if;
  if actor_role <> 'owner' and not (actor_role = 'admin' and target_role = 'agent') then
    raise exception 'Insufficient permission';
  end if;
  if not remove_member and (new_role is null or new_role not in ('owner', 'admin', 'agent')) then
    raise exception 'Invalid role';
  end if;
  if actor_role = 'admin' and (remove_member = false and new_role <> 'agent') then
    raise exception 'Administrators can only manage agents';
  end if;

  if target_role = 'owner' and (remove_member or new_role <> 'owner') then
    select count(*) into owner_count from public.workspace_members
    where workspace_id = target_workspace_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'A workspace must retain at least one owner';
    end if;
  end if;

  if remove_member then
    delete from public.workspace_members
    where workspace_id = target_workspace_id and user_id = target_user_id;
  else
    update public.workspace_members set role = new_role
    where workspace_id = target_workspace_id and user_id = target_user_id;
  end if;
end;
$$;

revoke all on function public.accept_workspace_invitation(text) from public;
revoke all on function public.manage_workspace_member(uuid, uuid, text, boolean) from public;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.manage_workspace_member(uuid, uuid, text, boolean) to authenticated;
grant select, insert, update on public.workspace_invitations to authenticated;

commit;
