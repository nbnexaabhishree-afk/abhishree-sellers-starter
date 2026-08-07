-- A Razorpay customer can own subscriptions for more than one SaaS workspace.

begin;

drop index if exists public.workspace_subscriptions_razorpay_customer_uidx;

create index workspace_subscriptions_razorpay_customer_idx
on public.workspace_subscriptions(razorpay_customer_id)
where razorpay_customer_id is not null;

commit;
