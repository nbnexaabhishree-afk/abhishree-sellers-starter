type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
  status?: number;
  statusText?: string;
};

export type PersistenceResult<T> =
  | { ok: true; data: T | null }
  | { ok: false; duplicate: boolean; code: string; message: string };

function sanitizeDatabaseMessage(message: string | undefined) {
  if (!message) return "Supabase operation failed";

  const normalized = message.toLowerCase();
  if (normalized.includes("duplicate key") || normalized.includes("unique constraint")) {
    return "Database uniqueness conflict";
  }
  if (normalized.includes("null value") || normalized.includes("not-null constraint")) {
    return "Required database value is missing";
  }
  if (normalized.includes("schema cache") || normalized.includes("column") && normalized.includes("does not exist")) {
    return "Required database column is missing or unavailable";
  }
  if (normalized.includes("row-level security") || normalized.includes("permission denied")) {
    return "Database authorization policy rejected the operation";
  }

  return message
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/(?:eyJ|sb_(?:publishable|secret)_)[A-Za-z0-9._-]+/g, "[redacted-token]")
    .replace(/\b\d{7,}\b/g, "[redacted-number]")
    .replace(/\{[\s\S]*\}/g, "[redacted-details]")
    .replace(/\([^)]{20,}\)/g, "([redacted-details])")
    .slice(0, 240);
}

function isUniqueConflict(error: SupabaseErrorLike | null) {
  return error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message ?? "");
}

export function logSupabasePersistenceIssue(
  operation: string,
  eventKey: string,
  error: SupabaseErrorLike | null,
  fallbackCode = "unknown"
) {
  console.error("WhatsApp Supabase persistence issue", {
    operation,
    code: error?.code ?? fallbackCode,
    message: sanitizeDatabaseMessage(error?.message),
    eventKey
  });
}

export async function runSupabaseOperation<T>(
  operation: string,
  eventKey: string,
  execute: () => PromiseLike<SupabaseResult<T>>,
  options: { requireData?: boolean; logUniqueConflict?: boolean } = {}
): Promise<PersistenceResult<T>> {
  try {
    const result = await execute();
    const duplicate = isUniqueConflict(result.error);

    if (result.error || (result.status !== undefined && result.status >= 400)) {
      if (!duplicate || options.logUniqueConflict) {
        logSupabasePersistenceIssue(operation, eventKey, result.error, `http_${result.status ?? "failure"}`);
      }
      return {
        ok: false,
        duplicate,
        code: result.error?.code ?? `http_${result.status ?? "failure"}`,
        message: sanitizeDatabaseMessage(result.error?.message ?? result.statusText)
      };
    }

    if (options.requireData !== false && result.data === null) {
      logSupabasePersistenceIssue(operation, eventKey, null, "missing_data");
      return {
        ok: false,
        duplicate: false,
        code: "missing_data",
        message: "Supabase operation returned no persisted row"
      };
    }

    return { ok: true, data: result.data };
  } catch {
    logSupabasePersistenceIssue(operation, eventKey, null, "network_failure");
    return {
      ok: false,
      duplicate: false,
      code: "network_failure",
      message: "Supabase request failed before receiving a database response"
    };
  }
}
