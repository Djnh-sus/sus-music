"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { trackToRow } from "@/lib/track";

const UNIQUE_VIOLATION = "23505";

export function useFavorite(track) {
  const { userId } = useAuth();
  const [loaded, setLoaded] = useState({ key: null, isFavorite: false });
  const [busy, setBusy] = useState(false);

  const videoId = track?.videoId ?? null;
  const key = userId && videoId ? `${userId}:${videoId}` : null;
  const isFavorite = key !== null && loaded.key === key && loaded.isFavorite;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    supabase
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("video_id", videoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLoaded({ key, isFavorite: !!data });
      });

    return () => {
      cancelled = true;
    };
  }, [key, userId, videoId]);

  const toggle = async () => {
    if (!key || busy) return null;
    setBusy(true);

    const wantFavorite = !isFavorite;
    const { error } = wantFavorite
      ? await supabase.from("favorites").insert({ user_id: userId, ...trackToRow(track) })
      : await supabase.from("favorites").delete().eq("user_id", userId).eq("video_id", videoId);

    setBusy(false);

    if (error && !(wantFavorite && error.code === UNIQUE_VIOLATION)) {
      console.error("Không cập nhật được yêu thích:", error.message);
      return null;
    }
    setLoaded({ key, isFavorite: wantFavorite });
    return wantFavorite;
  };

  return { isFavorite, busy, toggle };
}
