import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-user";

export function getSuperAdminEmails() {
  return new Set((process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export async function requireSuperAdmin() {
  const result = await requireUser();
  if (!result.user.email || !getSuperAdminEmails().has(result.user.email.toLowerCase())) redirect("/dashboard");
  return result;
}
