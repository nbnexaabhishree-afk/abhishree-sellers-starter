import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Already signed in</h1>
          <p>You are already authenticated. Continue to the dashboard.</p>
          <Link href="/dashboard" className="button-link">
            Open dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Admin access</p>
        <h1>Sign in to Abhishree Sellers</h1>
        <p className="muted">Use your Supabase-authenticated admin account to continue.</p>
        <form action="/auth/sign-in" method="post" className="auth-form">
          <label>
            Email
            <input name="email" type="email" placeholder="admin@example.com" required />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="••••••••" required />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </div>
    </main>
  );
}
