"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, LogOut, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { usePwaInstall } from "@/lib/pwa-install";

export default function AccountMenu() {
  const { user } = useAuth();
  const { canPrompt, isIOS, isStandalone, install } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email;
  const initial = displayName?.[0]?.toUpperCase() || "?";

  const showInstall = !isStandalone && (canPrompt || isIOS);

  const handleInstall = async () => {
    setOpen(false);
    if (canPrompt) await install();
    else router.push("/settings");
  };

  const handleLogout = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Tài khoản"
        aria-haspopup="menu"
        aria-expanded={open}
        className="block h-11 w-11 overflow-hidden rounded-full border-2 border-border transition duration-200 hover:border-accent aria-expanded:border-accent aria-expanded:shadow-[0_0_0_4px_rgb(254_222_41/0.2)]"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-surface-2 font-display text-lg font-bold text-accent">
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Tài khoản"
          className="menu-pop absolute right-0 top-full z-[60] mt-2 w-64 rounded-2xl border-2 border-border bg-surface-2 p-2 shadow-2xl"
        >
          <div className="px-3 pb-2 pt-1.5">
            <p className="truncate font-display text-base font-bold">{displayName}</p>
            {displayName !== user.email && (
              <p className="truncate text-xs text-muted">{user.email}</p>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-white/8"
          >
            <Settings size={17} className="text-muted" />
            Cài đặt tài khoản
          </Link>
          {showInstall && (
            <button
              type="button"
              role="menuitem"
              onClick={handleInstall}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/8"
            >
              <Download size={17} className="text-muted" />
              Cài ứng dụng
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-danger transition hover:bg-white/8"
          >
            <LogOut size={17} />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
