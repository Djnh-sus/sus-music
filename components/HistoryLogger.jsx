"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { trackToRow } from "@/lib/track";

export default function HistoryLogger() {
  const { currentTrack, isPlaying } = usePlayer();
  const { userId } = useAuth();
  const loggedTrackRef = useRef(null);

  useEffect(() => {
    if (!currentTrack) {
      loggedTrackRef.current = null;
      return;
    }
    if (!isPlaying || !userId || loggedTrackRef.current === currentTrack) return;

    loggedTrackRef.current = currentTrack;
    supabase
      .from("history")
      .insert({ user_id: userId, ...trackToRow(currentTrack) })
      .then(({ error }) => {
        if (error) console.error("Không ghi được lịch sử:", error.message);
      });
  }, [currentTrack, isPlaying, userId]);

  return null;
}
