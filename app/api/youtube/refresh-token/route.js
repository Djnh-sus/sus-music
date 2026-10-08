import { createAdminClient, getUserFromRequest } from "@/lib/supabase/admin";

const REAUTH_MESSAGE = "Quyền truy cập YouTube đã hết hạn hoặc bị thu hồi, cần kết nối lại";

function reauthRequired() {
  return Response.json(
    { code: "youtube_reauth_required", error: REAUTH_MESSAGE },
    { status: 401 }
  );
}

export async function POST(request) {
  const admin = createAdminClient();
  const user = await getUserFromRequest(request, admin);

  if (!user) {
    return Response.json({ error: "Phiên đăng nhập không hợp lệ" }, { status: 401 });
  }

  const { data: tokenRow, error: tokenError } = await admin
    .from("google_tokens")
    .select("provider_refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (tokenError) {
    return Response.json({ error: "Không đọc được token từ database" }, { status: 500 });
  }
  if (!tokenRow?.provider_refresh_token) {
    return reauthRequired();
  }

  let googleRes;
  let googleData;
  try {
    googleRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: tokenRow.provider_refresh_token,
        grant_type: "refresh_token",
      }),
    });
    googleData = await googleRes.json();
  } catch {
    return Response.json({ error: "Không kết nối được tới Google" }, { status: 502 });
  }

  if (!googleRes.ok) {
    if (googleData?.error === "invalid_grant") {
      await admin.from("google_tokens").delete().eq("user_id", user.id);
      return reauthRequired();
    }
    return Response.json(
      { error: googleData?.error_description || "Google từ chối refresh token" },
      { status: 502 }
    );
  }

  return Response.json({
    access_token: googleData.access_token,
    expires_in: googleData.expires_in,
  });
}
