// Supabase Edge Function: admin-users
//
// Creates and deletes staff Auth accounts on behalf of an administrator.
//
// Why a server function: creating an Auth user requires the Supabase service_role
// key, which must never be shipped to the web, APK or EXE bundle. The key lives in
// this function's environment (Supabase injects SUPABASE_SERVICE_ROLE_KEY), and the
// function first re-checks — server-side, from the caller's own JWT — that the caller
// is an active administrator before it does anything.
//
// Deploy (from a machine with the Supabase CLI):
//   supabase functions deploy admin-users --project-ref heqxvqgztkaixtgezbcw
// or through the Management API (see docs/PROGRESS.md).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PERMISSION_PATTERN = /^[a-z_]+:(view|add|edit|delete|\*)$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "The staff-account service is not configured." }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Identify the caller from their own token — never trust a body field for this.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not authenticated" }, 401);

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData?.user) return json({ error: "Not authenticated" }, 401);
  const caller = callerData.user;

  // 2. Re-check administrator status on the server.
  const { data: profile } = await admin.from("profiles").select("role, status").eq("id", caller.id).maybeSingle();
  if (!profile || profile.role !== "admin" || profile.status !== "active") {
    return json({ error: "Only an administrator may manage staff accounts" }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const audit = async (action: string, entityId: string | null, details: unknown, success = true) => {
    await admin.from("audit_logs").insert({
      actor_id: caller.id,
      actor_email: caller.email ?? null,
      action,
      module: "users",
      entity: "profiles",
      entity_id: entityId,
      details,
      success,
    });
  };

  const action = String(body.action || "");

  if (action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = typeof body.password === "string" && body.password ? String(body.password) : null;
    const fullName = body.fullName ? String(body.fullName) : null;
    const phone = body.phone ? String(body.phone) : null;
    const department = body.department ? String(body.department) : null;
    const role = body.role === "admin" ? "admin" : "user";
    const permissions = Array.isArray(body.permissions) ? (body.permissions as string[]).filter((p) => PERMISSION_PATTERN.test(p)) : [];

    if (!email || !email.includes("@")) return json({ error: "A valid email address is required" }, 400);
    if (password && password.length < 8) return json({ error: "The password must be at least 8 characters" }, 400);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: password ?? undefined,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError) {
      await audit("user_create_failed", null, { email, error: createError.message }, false);
      return json({ error: createError.message }, 400);
    }

    const userId = created.user!.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        phone,
        department,
        role,
        status: "active",
      },
      { onConflict: "id" }
    );
    if (profileError) {
      await audit("user_create_failed", userId, { email, error: profileError.message }, false);
      return json({ error: profileError.message }, 400);
    }

    if (permissions.length > 0) {
      const rows = permissions.map((permission) => ({
        user_id: userId,
        permission,
        granted: true,
        granted_by: caller.id,
        granted_at: new Date().toISOString(),
      }));
      const { error: permissionError } = await admin.from("user_permissions").upsert(rows, { onConflict: "user_id,permission" });
      if (permissionError) {
        await audit("user_create_failed", userId, { email, error: permissionError.message }, false);
        return json({ error: permissionError.message }, 400);
      }
    }

    await audit("user_created", userId, { email, role, department, permissions: permissions.length });
    return json({ userId, email });
  }

  if (action === "delete") {
    const userId = String(body.userId || "");
    if (!userId) return json({ error: "An account is required" }, 400);
    if (userId === caller.id) return json({ error: "You cannot delete your own account" }, 400);

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      await audit("user_delete_failed", userId, { error: error.message }, false);
      return json({ error: error.message }, 400);
    }
    await audit("user_deleted", userId, null);
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
