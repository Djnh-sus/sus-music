import { createClient } from "@supabase/supabase-js";

// Client này chạy trên trình duyệt, dùng anon key (public, an toàn để lộ ra).
// Mọi quyền hạn thực sự nằm ở RLS policy trong Postgres, không nằm ở key này.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
