# PropertyFlow

Multi-tenant WhatsApp property-seller acquisition SaaS built with Next.js, Supabase, Meta WhatsApp Cloud API, Stripe, and Vercel. The original Abhishree workspace remains fully supported as the first tenant.

## What is included

- Email/password registration, login, email confirmation callback, and workspace onboarding
- Active workspace switcher with tenant-scoped database access and RLS
- Owner, administrator, and agent roles; expiring email invitations; last-owner protection
- Per-workspace encrypted WhatsApp credentials and webhook URLs
- Validated nine-step seller intake: name, email, property type, BHK, area, location, price, documents, and media
- Atomic and idempotent conversation completion into seller leads and property media
- Free, Starter, and Pro limits with monthly message/lead usage tracking
- Stripe Checkout, Customer Portal, and signed/idempotent subscription webhooks
- Environment-gated super-admin dashboard

## Environment

Copy `.env.example` to `.env.local`. Never commit real secrets.

Core variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3001
WHATSAPP_CREDENTIALS_ENCRYPTION_KEY=
```

Keep `WHATSAPP_CREDENTIALS_ENCRYPTION_KEY` permanently. It must be a strong 32-byte value; replacing or losing it makes stored workspace credentials unreadable.

Abhishree’s legacy environment-backed integration additionally uses the `WHATSAPP_*` variables in `.env.example`. New tenants enter credentials in Settings.

Stripe is optional until billing is enabled:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
SUPER_ADMIN_EMAILS=owner@example.com
```

Without all Stripe values, Checkout is visibly disabled and the rest of the application continues working.

## Database and local development

```powershell
npm install
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
npm run dev -- -p 3001
```

Apply migrations in filename order. Never rerun or edit an already-applied migration; add a new migration for later changes.

## External configuration

For each client workspace, save its Meta credentials in Settings and configure the exact workspace webhook URL shown there. Subscribe Meta to `messages` events. Keep Abhishree’s legacy webhook configured until its workspace-specific URL has been live-tested.

For Stripe, create recurring Starter and Pro prices, set their IDs, enable the Customer Portal, and register this endpoint:

```text
https://YOUR_DOMAIN/api/billing/webhook
```

Subscribe it to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`, then store the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`.

## Release verification

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

After deploying, verify `/api/health`, registration/login, workspace creation and switching, invitations, per-workspace WhatsApp settings, both webhook verification URLs, one complete seller flow, tenant data isolation, Stripe test Checkout/Portal/webhooks, and super-admin access/non-access.

The disposable production tenancy check creates isolated test users/workspaces, validates RLS, invitations, roles, limits, owner protection, and the Supabase callback allowlist, then removes only those generated records:

```powershell
npm run verify:production-tenancy
```

Validate that the legacy Abhishree Meta token can still access its configured phone number without printing credentials:

```powershell
npm run verify:meta
```

The second-tenant live WhatsApp and Stripe tests require real external test credentials. Do not reuse Abhishree’s phone number or secrets for that validation.
