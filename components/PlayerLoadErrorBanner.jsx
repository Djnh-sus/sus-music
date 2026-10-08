"use client";

import { CircleAlert } from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";

export default function PlayerLoadErrorBanner() {
  const { playerLoadError, retryLoadPlayer } = usePlayer();
  if (!playerLoadError) return null;

  return (
    <div
      role="alert"
      className="menu-pop fixed left-3 right-3 z-[62] flex items-center gap-3 rounded-2xl border-2 border-danger/50 bg-surface-2 py-2.5 pl-4 pr-3 shadow-2xl md:left-[16.5rem] md:right-6"
      style={{ top: "calc(var(--topbar-h) + 0.5rem)", transformOrigin: "top center" }}
    >
      <CircleAlert size={20} className="shrink-0 text-danger" />
      <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-tight text-danger">{playerLoadError}</p>
      <button type="button" onClick={retryLoadPlayer} className="btn-primary shrink-0 px-4 py-1.5 text-sm">
        Thử lại
      </button>
    </div>
  );
}
