import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/onboarding");
  const { error } = await searchParams;
  return (
    <main className="auth-page"><div className="auth-card">
      <p className="eyebrow">Start free</p><h1>Create your PropertyFlow account</h1>
      <p className="muted">Your first workspace starts on the Free plan. No payment details are required.</p>
      {error ? <p className="error-message" role="alert">Unable to create that account. The email may already be registered.</p> : null}
      <form action="/auth/sign-up" method="post" className="auth-form">
        <label>Email<input name="email" type="email" required /></label>
        <label>Password<input name="password" type="password" minLength={8} required /></label>
        <button type="submit">Create account</button>
      </form>
      <p className="muted">Already registered? <Link href="/login">Sign in</Link></p>
    </div></main>
  );
}
