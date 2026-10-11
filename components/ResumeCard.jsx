"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { usePlayer } from "@/context/PlayerContext";
import { formatTime } from "@/lib/format-time";
import { getDeviceId } from "@/lib/device-id";
import { trackFromRow } from "@/lib/track";

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export default function ResumeCard({ userId }) {
  const { playTrackWithRadio, currentTrack } = usePlayer();
  const [state, setState] = useState({ userId: null, row: null });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    supabase
      .from("player_state")
      .select("video_id, title, channel_title, channel_id, thumbnail_url, position_seconds, device_id, updated_at")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const fresh = data && Date.now() - new Date(data.updated_at).getTime() <= MAX_AGE_MS;
        setState({ userId, row: fresh ? data : null });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const row = state.userId === userId ? state.row : null;
  if (!row) return null;
  if (row.device_id === getDeviceId()) return null;
  if (currentTrack?.videoId === row.video_id) return null;

  const track = trackFromRow(row);

  return (
    <section className="rise mb-10 flex items-center gap-4 rounded-3xl border-2 border-border bg-surface/70 p-3 pr-4">
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-2xl bg-surface-2 md:w-36">
        {row.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted">Tiếp tục nghe trên thiết bị khác</p>
        <p className="truncate font-display text-lg font-bold">{row.title}</p>
        <p className="truncate text-sm text-muted">
          {row.channel_title ? `${row.channel_title} · ` : ""}
          từ {formatTime(row.position_seconds)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => playTrackWithRadio(track, { startAt: row.position_seconds })}
        className="btn-primary shrink-0"
      >
        <Play size={18} fill="currentColor" />
        Phát tiếp
      </button>
    </section>
  );
}
