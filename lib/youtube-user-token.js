import { decryptToken, encryptToken, isEncrypted } from "@/lib/token-crypto";

export const REAUTH_MESSAGE = "Quyền truy cập YouTube đã hết hạn hoặc bị thu hồi, cần kết nối lại";

export function reauthResponse() {
  return Response.json({ code: "youtube_reauth_required", error: REAUTH_MESSAGE }, { status: 401 });
}

export async function getUserAccessToken(admin, userId) {
  const { data: row, error } = await admin
    .from("google_tokens")
    .select("provider_refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { response: Response.json({ error: "Không đọc được token từ database" }, { status: 500 }) };
  if (!row?.provider_refresh_token) return { response: reauthResponse() };

  let refreshToken;
  try {
    refreshToken = decryptToken(row.provider_refresh_token);
  } catch {
    return { response: Response.json({ error: "Không giải mã được token đã lưu" }, { status: 500 }) };
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
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(8000),
    });
    googleData = await googleRes.json();
  } catch {
    return { response: Response.json({ error: "Không kết nối được tới Google" }, { status: 502 }) };
  }

  if (!googleRes.ok) {
    if (googleData?.error === "invalid_grant") {
      await admin.from("google_tokens").delete().eq("user_id", userId);
      return { response: reauthResponse() };
    }
    return {
      response: Response.json(
        { error: googleData?.error_description || "Google từ chối refresh token" },
        { status: 502 }
      ),
    };
  }

  if (!isEncrypted(row.provider_refresh_token)) {
    const upgraded = encryptToken(refreshToken);
    if (isEncrypted(upgraded)) {
      await admin
        .from("google_tokens")
        .update({ provider_refresh_token: upgraded })
        .eq("user_id", userId);
    }
  }

  return { accessToken: googleData.access_token, expiresIn: googleData.expires_in };
}
