"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListMusic, Heart, History, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { subscribePlaylistsChanged } from "@/lib/playlist-events";
import Logo from "@/components/Logo";
import { Skeleton } from "@/components/Skeleton";

const NAV_ITEMS = [
  { href: "/", label: "Trang chủ", Icon: Home },
  { href: "/playlists", label: "Playlist", Icon: ListMusic },
  { href: "/favorites", label: "Yêu thích", Icon: Heart },
  { href: "/history", label: "Lịch sử", Icon: History },
];

function isActive(href, pathname) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PlaylistPanel({ userId, playlists, loading, pathname }) {
  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-2xl border-2 border-border bg-surface/60">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <h2 className="font-display text-base font-bold">Playlist của bạn</h2>
        <Link
          href="/playlists"
          aria-label="Tạo playlist mới"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-foreground"
        >
          <Plus size={16} />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!userId && <p className="px-2 py-3 text-sm text-muted">Đăng nhập để xem playlist.</p>}

        {userId && loading && (
          <div className="flex flex-col gap-2 px-1 py-2" aria-busy="true" aria-label="Đang tải">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        )}

        {userId && !loading && playlists.length === 0 && (
          <div className="px-2 py-3 text-sm text-muted">
            <p>Chưa có playlist nào.</p>
            <Link href="/playlists" className="mt-1 inline-block font-semibold text-accent">
              Tạo playlist đầu tiên
            </Link>
          </div>
        )}

        {userId && !loading && playlists.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {playlists.map((pl) => {
              const active = pathname === `/playlists/${pl.id}`;
              return (
                <li key={pl.id}>
                  <Link
                    href={`/playlists/${pl.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                      active
                        ? "bg-surface-2 font-semibold text-foreground"
                        : "text-muted hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    <ListMusic size={15} className="shrink-0" />
                    <span className="truncate">{pl.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { userId } = useAuth();
  const [loaded, setLoaded] = useState({ userId: null, items: [] });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => subscribePlaylistsChanged(() => setRefreshTick((n) => n + 1)), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    supabase
      .from("custom_playlists")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setLoaded({ userId, items: data || [] });
      });

    return () => {
      cancelled = true;
    };
  }, [userId, refreshTick]);

  const ready = loaded.userId === userId;
  const playlists = ready ? loaded.items : [];
  const activeIndex = NAV_ITEMS.findIndex(({ href }) => isActive(href, pathname));

  return (
    <>
      <aside className="fixed left-0 top-0 z-30 hidden h-full w-[var(--sidebar-w)] flex-col bg-sidebar px-4 pb-4 pt-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-3 px-1">
          <Logo size={44} />
          <span className="font-display text-2xl font-extrabold leading-none tracking-tight">
            SUS <span className="text-accent">Music</span>
          </span>
        </Link>

        <nav aria-label="Điều hướng chính" className="relative flex flex-col gap-1">
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 h-11 w-full rounded-xl bg-accent shadow-[0_3px_0_0_var(--accent-lip)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform: `translateY(${Math.max(activeIndex, 0) * 3}rem)`,
              opacity: activeIndex >= 0 ? 1 : 0,
            }}
          />
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative z-10 flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-bold transition-colors duration-200 ${
                  active ? "text-accent-ink" : "text-muted hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <Icon size={19} />
                {label}
              </Link>
            );
          })}
        </nav>

        <PlaylistPanel
          userId={userId}
          playlists={playlists}
          loading={Boolean(userId) && !ready}
          pathname={pathname}
        />
      </aside>

      <nav aria-label="Điều hướng chính" className="tab-bar md:hidden">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0 h-[3px] w-9 rounded-full bg-accent transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  active ? "scale-x-100" : "scale-x-0"
                }`}
              />
              <Icon size={21} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
