import { redirect } from "next/navigation";
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const errorMessages: Record<string, string> = {
  invalid: "The email or password is incorrect.",
  missing: "Enter both your email and password."
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string; notice?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { error, next, notice } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (user) redirect(safeNext);

  const errorMessage = error ? errorMessages[error] : null;

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Admin access</p>
        <h1>Sign in to PropertyFlow</h1>
        <p className="muted">Access your isolated property seller workspaces.</p>
        {errorMessage ? (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {notice === "check-email" ? <p className="notice">Check your email to confirm the account, then sign in.</p> : null}
        <form action="/auth/sign-in" method="post" className="auth-form">
          <input type="hidden" name="next" value={safeNext} />
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
        <p className="muted">New to PropertyFlow? <Link href="/register">Create an account</Link></p>
      </div>
    </main>
  );
}
