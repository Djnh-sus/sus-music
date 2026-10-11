import { createAdminClient, getUserFromRequest } from "@/lib/supabase/admin";
import { getUserAccessToken } from "@/lib/youtube-user-token";

export async function POST(request) {
  const admin = createAdminClient();
  const user = await getUserFromRequest(request, admin);

  if (!user) {
    return Response.json({ error: "Phiên đăng nhập không hợp lệ" }, { status: 401 });
  }

  const result = await getUserAccessToken(admin, user.id);
  if (result.response) return result.response;

  return Response.json({ access_token: result.accessToken, expires_in: result.expiresIn });
}
