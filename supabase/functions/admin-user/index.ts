import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ADMIN_KEY =
  Deno.env.get("SUPABASE_SECRET_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  "";

const ALLOWED_ROLES = new Set(["User", "SuperUser", "Admin", "SuperAdmin"]);
const PROTECTED_SYSTEM_USER_IDS = new Set(["USER-002", "USER-004"]);
const SAFE_PROFILE_COLUMNS =
  "id, auth_user_id, username, employee_id, fullname, avatar_url, agency, department, role, status";

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (origin === "https://smetaltech25.github.io") return true;

  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://smetaltech25.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeText(value: unknown, maxLength = 200) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeUsername(value: unknown) {
  return normalizeText(value, 120).toLowerCase();
}

async function usernameToAuthEmail(username: string) {
  const normalized = normalizeUsername(username);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return normalized;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `oms-${hash.slice(0, 40)}@auth.smetaltech.test`;
}

function validatePassword(password: unknown, required: boolean) {
  const value = String(password ?? "");
  if (!value && !required) return "";
  const byteLength = new TextEncoder().encode(value).length;
  if (Array.from(value).length < 6) throw new Error("Password ต้องมีอย่างน้อย 6 ตัวอักษร");
  if (byteLength > 72) throw new Error("Password ต้องมีความยาวไม่เกิน 72 bytes");
  return value;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed" }, 405);
  }
  if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
    return jsonResponse(request, { error: "Edge Function secrets are not configured" }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) {
    return jsonResponse(request, { error: "Authentication required" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_ADMIN_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return jsonResponse(request, { error: "Invalid session" }, 401);
  }

  const { data: caller, error: callerError } = await admin
    .from("users")
    .select("id, role, status")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (callerError || !caller || caller.status !== true || caller.role !== "SuperAdmin") {
    return jsonResponse(request, { error: "SuperAdmin permission required" }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: "Invalid JSON body" }, 400);
  }

  const action = normalizeText(body?.action, 30);
  const profile = body?.profile || {};

  if (action === "delete") {
    const id = normalizeText(profile.id, 100);
    if (!id) return jsonResponse(request, { error: "User id is required" }, 400);
    if (id === caller.id) {
      return jsonResponse(request, { error: "ไม่สามารถลบบัญชีที่กำลังเข้าสู่ระบบอยู่ได้" }, 409);
    }
    if (PROTECTED_SYSTEM_USER_IDS.has(id)) {
      return jsonResponse(request, { error: "บัญชีผู้ดูแลระบบหลักไม่สามารถลบได้" }, 409);
    }

    try {
      const { data: existingProfile, error: existingError } = await admin
        .from("users")
        .select("*")
        .eq("id", id)
        .single();
      if (existingError || !existingProfile) throw existingError || new Error("ไม่พบผู้ใช้งาน");

      const { data: deletedAuthUserId, error: deleteProfileError } = await admin
        .rpc("oms_delete_user_profile", { target_user_id: id });
      if (deleteProfileError) throw deleteProfileError;

      if (deletedAuthUserId) {
        const { error: deleteAuthError } = await admin.auth.admin.deleteUser(deletedAuthUserId);
        if (deleteAuthError) {
          const { error: restoreError } = await admin.from("users").insert(existingProfile);
          if (restoreError) {
            throw new Error(`ลบ Auth ไม่สำเร็จและคืน Profile ไม่สำเร็จ: ${restoreError.message}`);
          }
          throw deleteAuthError;
        }
      }

      return jsonResponse(request, { deleted: true, id });
    } catch (error) {
      console.error("admin-user delete error", error);
      const message = error instanceof Error ? error.message : String(error || "Delete user failed");
      return jsonResponse(request, { error: message }, 409);
    }
  }

  const username = normalizeUsername(profile.username);
  const fullname = normalizeText(profile.fullname, 200);
  const role = normalizeText(profile.role, 30) || "User";

  if (!username || !fullname || !ALLOWED_ROLES.has(role)) {
    return jsonResponse(request, { error: "Username, fullname or role is invalid" }, 400);
  }

  const profilePayload = {
    username,
    employee_id: normalizeText(profile.employee_id, 100) || null,
    fullname,
    avatar_url: normalizeText(profile.avatar_url, 2000) || null,
    agency: normalizeText(profile.agency, 100) || null,
    department: normalizeText(profile.department, 100) || null,
    role,
    status: profile.status !== false,
  };

  try {
    if (action === "create") {
      const password = validatePassword(body?.password, true);
      const authEmail = await usernameToAuthEmail(username);

      const { data: createdAuth, error: createAuthError } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { username, fullname },
      });
      if (createAuthError || !createdAuth.user) throw createAuthError || new Error("สร้าง Auth user ไม่สำเร็จ");

      const { data: nextId, error: nextIdError } = await admin.rpc("oms_next_user_id");
      if (nextIdError || !nextId) {
        await admin.auth.admin.deleteUser(createdAuth.user.id);
        throw nextIdError || new Error("สร้างรหัสผู้ใช้ไม่สำเร็จ");
      }

      const { data: createdProfile, error: createProfileError } = await admin
        .from("users")
        .insert({
          ...profilePayload,
          id: nextId,
          auth_user_id: createdAuth.user.id,
        })
        .select(SAFE_PROFILE_COLUMNS)
        .single();

      if (createProfileError) {
        await admin.auth.admin.deleteUser(createdAuth.user.id);
        throw createProfileError;
      }
      return jsonResponse(request, { user: createdProfile }, 201);
    }

    if (action === "update") {
      const id = normalizeText(profile.id, 100);
      if (!id) return jsonResponse(request, { error: "User id is required" }, 400);

      const { data: existingProfile, error: existingError } = await admin
        .from("users")
        .select(SAFE_PROFILE_COLUMNS)
        .eq("id", id)
        .single();
      if (existingError || !existingProfile) throw existingError || new Error("ไม่พบผู้ใช้งาน");
      if (!existingProfile.auth_user_id) {
        return jsonResponse(request, { error: "บัญชีนี้ยังไม่ได้เชื่อมกับ Supabase Auth" }, 409);
      }

      const password = validatePassword(body?.password, false);
      const { data: updatedProfile, error: profileError } = await admin
        .from("users")
        .update(profilePayload)
        .eq("id", id)
        .select(SAFE_PROFILE_COLUMNS)
        .single();
      if (profileError) throw profileError;

      const authEmail = await usernameToAuthEmail(username);
      const authAttributes = password
        ? { email: authEmail, email_confirm: true, user_metadata: { username, fullname }, password }
        : { email: authEmail, email_confirm: true, user_metadata: { username, fullname } };

      const { error: updateAuthError } = await admin.auth.admin.updateUserById(
        existingProfile.auth_user_id,
        authAttributes,
      );
      if (updateAuthError) {
        await admin.from("users").update({
          username: existingProfile.username,
          employee_id: existingProfile.employee_id,
          fullname: existingProfile.fullname,
          avatar_url: existingProfile.avatar_url,
          agency: existingProfile.agency,
          department: existingProfile.department,
          role: existingProfile.role,
          status: existingProfile.status,
        }).eq("id", id);
        throw updateAuthError;
      }

      return jsonResponse(request, { user: updatedProfile });
    }

    return jsonResponse(request, { error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("admin-user error", error);
    const message = error instanceof Error ? error.message : String(error || "User management failed");
    return jsonResponse(request, { error: message }, 400);
  }
});
