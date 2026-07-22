type AuthErrorLike = { code?: string; message?: string; status?: number };

function sanitize(value: string | undefined, fallback: string) {
  return (value ?? fallback)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/(?:eyJ|sb_(?:publishable|secret)_)[A-Za-z0-9._-]+/g, "[redacted-token]")
    .slice(0, 240);
}

export function logAuthError(context: string, error: AuthErrorLike | null) {
  if (process.env.NODE_ENV !== "development") return;

  console.error(context, {
    code: sanitize(error?.code, "unknown"),
    message: sanitize(error?.message, "Authentication request failed"),
    status: error?.status ?? null
  });
}
