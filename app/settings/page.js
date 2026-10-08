"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import LoginButton from "@/components/LoginButton";
import PageHeader from "@/components/PageHeader";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";

function Card({ title, children }) {
  return (
    <section className="rounded-2xl border-2 border-border bg-surface/60 p-5">
      <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function SettingsContent() {
  const { user } = useAuth();
  const router = useRouter();

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 md:px-8">
      <PageHeader title="Cài đặt tài khoản" />

      <Card title="Tài khoản">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-border bg-surface-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-accent">
                {displayName?.[0]?.toUpperCase() || "?"}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold">{displayName}</p>
            <p className="truncate text-sm text-muted">{user?.email}</p>
          </div>
        </div>
      </Card>

      <Card title="Kết nối YouTube">
        <p className="mb-4 text-sm text-muted">
          SUS Music dùng quyền chỉ đọc để lấy danh sách playlist trên YouTube của bạn. Nếu playlist
          không tải được hoặc quyền đã hết hạn, hãy kết nối lại.
        </p>
        <LoginButton label="Kết nối lại YouTube" />
      </Card>

      <Card title="Phiên đăng nhập">
        <button type="button" onClick={handleLogout} className="btn-ghost text-danger">
          <LogOut size={17} />
          Đăng xuất
        </button>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}
