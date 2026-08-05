-- Preserve final-owner protection while allowing intentional whole-workspace deletion.

begin;

create or replace function public.protect_last_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_count integer;
begin
  -- A parent workspace deletion cascades into memberships. At that point the
  -- parent row is no longer visible, so blocking the membership delete would
  -- make workspace/account cleanup impossible.
  if not exists (select 1 from public.workspaces where id = old.workspace_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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

commit;
