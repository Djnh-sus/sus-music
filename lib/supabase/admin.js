import { createClient } from "@supabase/supabase-js";

// CHỈ dùng trong API Routes (chạy trên server, không bao giờ import vào
// component client). service_role key bỏ qua toàn bộ RLS, nên nếu lỡ lọt
// ra browser thì coi như mất luôn quyền kiểm soát dữ liệu.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

// Xác thực access_token (JWT) mà client gửi lên qua header Authorization,
// trả về user tương ứng hoặc null nếu token không hợp lệ/hết hạn.
export async function getUserFromRequest(request, adminClient) {
  const authHeader = request.headers.get("authorization") || "";
  const accessToken = authHeader.replace("Bearer ", "").trim();
  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(accessToken);

  if (error || !user) return null;
  return user;
}
