import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const errorMessages: Record<string, string> = {
  invalid: "The email or password is incorrect.",
  missing: "Enter both your email and password."
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : null;

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Admin access</p>
        <h1>Sign in to Abhishree Sellers</h1>
        <p className="muted">Use your Supabase-authenticated admin account to continue.</p>
        {errorMessage ? (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        ) : null}
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
