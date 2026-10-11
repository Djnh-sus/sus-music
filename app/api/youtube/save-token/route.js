import { createAdminClient, getUserFromRequest } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/token-crypto";

export async function POST(request) {
  const admin = createAdminClient();
  const user = await getUserFromRequest(request, admin);

  if (!user) {
    return Response.json({ error: "Phiên đăng nhập không hợp lệ" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const refreshToken = body?.refresh_token;

  if (!refreshToken) {
    return Response.json({ error: "Thiếu refresh_token" }, { status: 400 });
  }

  const { error } = await admin.from("google_tokens").upsert({
    user_id: user.id,
    provider_refresh_token: encryptToken(refreshToken),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
