# Abhishree Sellers

Cloud-only WhatsApp property seller enquiry collector.

## Stack

- Next.js
- Vercel
- Supabase PostgreSQL
- Supabase Storage
- Meta WhatsApp Cloud API

## Supabase setup

1. Create a new Supabase project.
2. Open the SQL editor and run [supabase/migrations/002_contacts_and_auth.sql](supabase/migrations/002_contacts_and_auth.sql) and [supabase/migrations/003_whatsapp_foundation.sql](supabase/migrations/003_whatsapp_foundation.sql).
3. Create your first admin user from the Supabase Auth UI.
4. Copy [.env.example](.env.example) to .env.local and fill in the values below.

### Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_API_VERSION=v23.0
WHATSAPP_SIGNATURE_BYPASS=false
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Meta WhatsApp Cloud API setup

1. Create or select a Meta developer app and add the WhatsApp product.
2. Connect a WhatsApp Business Account and phone number.
3. Copy the phone number ID and business account ID from the Meta dashboard.
4. Generate a webhook verify token locally and set it in the environment.
5. Set the WhatsApp app secret from Meta.
6. Configure the webhook URL to your local development host or the Vercel production URL.
7. Subscribe to webhook fields that include messages and statuses.
8. Create an approved WhatsApp template and use the single-recipient test page only for safe testing.

## Local development

```powershell
cd "D:\AI\Projects\Abhishree Sellers\abhishree-sellers-starter"
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000 and sign in at /login.

## Verification checklist

- Visit /api/health to verify environment validation.
- Sign in with your Supabase admin user.
- Open /dashboard and /contacts to confirm protected routes and persisted contacts data.
- Use the import endpoint to verify contact persistence in Supabase.

## Initial scope

- Store contacts
- Create campaigns
- Send approved WhatsApp templates
- Receive webhook replies
- Categorise sale/rent/later/not interested
- Save text and media enquiries
- Respect STOP / do-not-contact
