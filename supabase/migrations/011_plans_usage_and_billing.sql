-- SaaS plans, subscription state, idempotent usage metering, and Stripe event ledger.

begin;

create table public.subscription_plans (
  key text primary key check (key in ('free', 'starter', 'pro')),
  name text not null,
  monthly_message_limit integer not null check (monthly_message_limit > 0),
  monthly_lead_limit integer not null check (monthly_lead_limit > 0),
  member_limit integer not null check (member_limit > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans(key, name, monthly_message_limit, monthly_lead_limit, member_limit)
values
  ('free', 'Free', 100, 10, 1),
  ('starter', 'Starter', 2000, 500, 5),
  ('pro', 'Pro', 20000, 5000, 25);

create table public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan_key text not null default 'free' references public.subscription_plans(key),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspace_subscriptions(workspace_id)
select id from public.workspaces
on conflict (workspace_id) do nothing;

create or replace function public.create_default_workspace_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_subscriptions(workspace_id) values (new.id);
  return new;
end;
$$;

create trigger workspaces_create_default_subscription
after insert on public.workspaces
for each row execute function public.create_default_workspace_subscription();

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric text not null check (metric in ('whatsapp_message', 'seller_lead')),
  quantity integer not null default 1 check (quantity > 0),
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (workspace_id, idempotency_key)
);

create index usage_events_workspace_period_idx
on public.usage_events(workspace_id, occurred_at desc, metric);

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create trigger subscription_plans_updated_at before update on public.subscription_plans
for each row execute function public.set_updated_at();
create trigger workspace_subscriptions_updated_at before update on public.workspace_subscriptions
for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.workspace_subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy subscription_plans_authenticated_select on public.subscription_plans
for select to authenticated using (active = true);
create policy workspace_subscriptions_member_select on public.workspace_subscriptions
for select to authenticated using (public.is_workspace_member(workspace_id));
create policy usage_events_member_select on public.usage_events
for select to authenticated using (public.is_workspace_member(workspace_id));

grant select on public.subscription_plans, public.workspace_subscriptions, public.usage_events to authenticated;

create or replace function public.record_workspace_usage(
  target_workspace_id uuid,
  usage_metric text,
  usage_idempotency_key text,
  usage_quantity integer default 1,
  usage_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_record public.subscription_plans%rowtype;
  current_usage bigint;
  usage_limit integer;
  existing_event uuid;
begin
  if usage_metric not in ('whatsapp_message', 'seller_lead') or usage_quantity <= 0 then
    raise exception 'Invalid usage event';
  end if;

  select id into existing_event from public.usage_events
  where workspace_id = target_workspace_id and idempotency_key = usage_idempotency_key;
  if existing_event is not null then
    return jsonb_build_object('allowed', true, 'duplicate', true);
  end if;

  select plan.* into plan_record
  from public.subscription_plans plan
  join public.workspace_subscriptions subscription on subscription.plan_key = plan.key
  where subscription.workspace_id = target_workspace_id
    and subscription.status in ('active', 'trialing');
  if plan_record.key is null then
    select * into plan_record from public.subscription_plans where key = 'free';
  end if;

  usage_limit := case when usage_metric = 'whatsapp_message'
    then plan_record.monthly_message_limit else plan_record.monthly_lead_limit end;
  select coalesce(sum(quantity), 0) into current_usage
  from public.usage_events
  where workspace_id = target_workspace_id
    and metric = usage_metric
    and occurred_at >= date_trunc('month', now());

  if current_usage + usage_quantity > usage_limit then
    return jsonb_build_object('allowed', false, 'used', current_usage, 'limit', usage_limit, 'plan', plan_record.key);
  end if;

  insert into public.usage_events(workspace_id, metric, quantity, idempotency_key, metadata)
  values (target_workspace_id, usage_metric, usage_quantity, usage_idempotency_key, usage_metadata);
  return jsonb_build_object('allowed', true, 'used', current_usage + usage_quantity, 'limit', usage_limit, 'plan', plan_record.key);
end;
$$;

revoke all on function public.record_workspace_usage(uuid, text, text, integer, jsonb) from public;
grant execute on function public.record_workspace_usage(uuid, text, text, integer, jsonb) to service_role;

create or replace function public.track_seller_lead_usage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_events(workspace_id, metric, quantity, idempotency_key, metadata)
  values (new.workspace_id, 'seller_lead', 1, 'seller-lead:' || new.id::text, jsonb_build_object('sellerLeadId', new.id))
  on conflict (workspace_id, idempotency_key) do nothing;
  return new;
end;
$$;

create trigger seller_leads_track_usage
after insert on public.seller_leads
for each row execute function public.track_seller_lead_usage();

create or replace function public.enforce_workspace_member_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed_members integer;
  current_members integer;
begin
  select plan.member_limit into allowed_members
  from public.workspace_subscriptions subscription
  join public.subscription_plans plan on plan.key = subscription.plan_key
  where subscription.workspace_id = new.workspace_id
    and subscription.status in ('active', 'trialing');
  if allowed_members is null then allowed_members := 1; end if;
  select count(*) into current_members from public.workspace_members where workspace_id = new.workspace_id;
  if current_members >= allowed_members then raise exception 'Workspace member limit reached'; end if;
  return new;
end;
$$;

create trigger workspace_members_enforce_plan_limit
before insert on public.workspace_members
for each row execute function public.enforce_workspace_member_limit();

commit;
