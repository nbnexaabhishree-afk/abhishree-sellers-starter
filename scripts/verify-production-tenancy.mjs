import { createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
assert(url && anonKey && serviceKey && siteUrl, "Core production environment is required");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const password = `T!${randomBytes(24).toString("base64url")}`;
const createdUserIds = [];
const createdWorkspaceIds = [];

function userClient() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createTestUser(label) {
  const email = `propertyflow-${label}-${suffix}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  assert(data.user, "Test user was not created");
  createdUserIds.push(data.user.id);
  const client = userClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signIn.error);
  return { client, email, id: data.user.id };
}

async function createWorkspace(client, label) {
  const { data, error } = await client.rpc("create_workspace", {
    workspace_name: `Isolation ${label} ${suffix}`,
    workspace_slug: `isolation-${label}-${suffix}`
  });
  assert.ifError(error);
  assert(data, "Workspace was not created");
  createdWorkspaceIds.push(data);
  return data;
}

try {
  const ownerA = await createTestUser("owner-a");
  const ownerB = await createTestUser("owner-b");
  const workspaceA = await createWorkspace(ownerA.client, "a");
  const workspaceB = await createWorkspace(ownerB.client, "b");
  assert.notEqual(workspaceA, workspaceB, "Test workspaces were not independent");

  const contactA = await ownerA.client.from("contacts").insert({
    workspace_id: workspaceA, name: "Tenant A", phone: `9198${Date.now().toString().slice(-8)}`,
    normalized_phone: `9198${Date.now().toString().slice(-8)}`, status: "new", do_not_contact: false
  }).select("id").single();
  assert.ifError(contactA.error);

  const visibleToB = await ownerB.client.from("contacts").select("id").eq("workspace_id", workspaceA);
  assert.ifError(visibleToB.error);
  assert.equal(visibleToB.data.length, 0, "Tenant B could read Tenant A contacts");
  const crossTenantInsert = await ownerB.client.from("contacts").insert({
    workspace_id: workspaceA, name: "Forbidden", phone: "919876543219", normalized_phone: "919876543219", status: "new"
  });
  assert(crossTenantInsert.error, "Tenant B could write Tenant A contacts");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await ownerA.client.from("workspace_invitations").insert({
    workspace_id: workspaceA, email: ownerB.email, role: "agent", token_hash: tokenHash, invited_by: ownerA.id
  });
  assert.ifError(invitation.error);

  const limitedAcceptance = await ownerB.client.rpc("accept_workspace_invitation", { invitation_token_hash: tokenHash });
  assert(limitedAcceptance.error, "Free-plan member limit was not enforced");
  const upgrade = await admin.from("workspace_subscriptions").update({ plan_key: "starter" }).eq("workspace_id", workspaceA);
  assert.ifError(upgrade.error);
  const accepted = await ownerB.client.rpc("accept_workspace_invitation", { invitation_token_hash: tokenHash });
  assert.ifError(accepted.error);
  assert.equal(accepted.data, workspaceA);

  const agentInvite = await ownerB.client.from("workspace_invitations").insert({
    workspace_id: workspaceA, email: `forbidden-${suffix}@example.com`, role: "agent",
    token_hash: createHash("sha256").update(randomUUID()).digest("hex"), invited_by: ownerB.id
  });
  assert(agentInvite.error, "An agent could create a workspace invitation");

  const removeOnlyOwner = await ownerA.client.from("workspace_members").delete()
    .eq("workspace_id", workspaceA).eq("user_id", ownerA.id);
  assert(removeOnlyOwner.error, "The final workspace owner could be removed");

  const redirectEmail = `propertyflow-redirect-${suffix}@example.com`;
  const redirectResult = await admin.auth.admin.generateLink({
    type: "signup", email: redirectEmail, password,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/onboarding` }
  });
  assert.ifError(redirectResult.error);
  if (redirectResult.data.user?.id) createdUserIds.push(redirectResult.data.user.id);
  const actionUrl = new URL(redirectResult.data.properties.action_link);
  const redirectTarget = actionUrl.searchParams.get("redirect_to") ?? "";
  assert(redirectTarget.startsWith(`${siteUrl}/auth/callback`), "Production auth callback is not allowed by Supabase");

  console.log("PASS tenant reads/writes are isolated");
  console.log("PASS invitation email binding and acceptance");
  console.log("PASS free-plan member limit and role permissions");
  console.log("PASS final-owner safeguard");
  console.log("PASS production Supabase auth redirect");
} finally {
  for (const workspaceId of createdWorkspaceIds) {
    const contactsCleanup = await admin.from("contacts").delete().eq("workspace_id", workspaceId);
    assert.ifError(contactsCleanup.error);
    const workspaceCleanup = await admin.from("workspaces").delete().eq("id", workspaceId);
    assert.ifError(workspaceCleanup.error);
  }
  for (const userId of createdUserIds) {
    const userCleanup = await admin.auth.admin.deleteUser(userId);
    assert.ifError(userCleanup.error);
  }
}

process.exit(0);
