-- Replace the unused Stripe integration with Razorpay Subscriptions.

begin;

alter table public.workspace_subscriptions
  add column razorpay_customer_id text,
  add column razorpay_subscription_id text,
  add column razorpay_plan_id text;

create unique index workspace_subscriptions_razorpay_customer_uidx
on public.workspace_subscriptions(razorpay_customer_id)
where razorpay_customer_id is not null;

create unique index workspace_subscriptions_razorpay_subscription_uidx
on public.workspace_subscriptions(razorpay_subscription_id)
where razorpay_subscription_id is not null;

alter table public.workspace_subscriptions
  drop constraint if exists workspace_subscriptions_status_check;

alter table public.workspace_subscriptions
  add constraint workspace_subscriptions_status_check
  check (status in (
    'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete',
    'paused', 'completed', 'expired'
  ));

create table public.razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.razorpay_webhook_events enable row level security;

comment on column public.workspace_subscriptions.stripe_customer_id
  is 'Legacy unused Stripe field retained for migration compatibility.';
comment on column public.workspace_subscriptions.stripe_subscription_id
  is 'Legacy unused Stripe field retained for migration compatibility.';

commit;
