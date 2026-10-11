"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { usePlayer, usePlayerTime } from "@/context/PlayerContext";
import { getDeviceId } from "@/lib/device-id";

const SYNC_INTERVAL_MS = 20000;

export default function PlayerSync() {
  const { userId } = useAuth();
  const { currentTrack, isPlaying } = usePlayer();
  const { currentTime } = usePlayerTime();
  const lastSyncRef = useRef(0);
  const latestRef = useRef({ track: null, time: 0, userId: null });

  useEffect(() => {
    latestRef.current = { track: currentTrack, time: currentTime, userId };
  });

  const push = async () => {
    const { track, time, userId: uid } = latestRef.current;
    if (!uid || !track) return;
    lastSyncRef.current = Date.now();
    await supabase.from("player_state").upsert({
      user_id: uid,
      video_id: track.videoId,
      title: track.title,
      channel_title: track.channelTitle || null,
      channel_id: track.channelId || null,
      thumbnail_url: track.thumbnail || null,
      position_seconds: Math.max(0, Math.floor(time)),
      device_id: getDeviceId(),
      updated_at: new Date().toISOString(),
    });
  };

  useEffect(() => {
    if (!isPlaying || !userId || !currentTrack) return;
    if (Date.now() - lastSyncRef.current < SYNC_INTERVAL_MS) return;
    push();
  }, [isPlaying, userId, currentTrack, currentTime]);

  useEffect(() => {
    if (isPlaying || !userId || !currentTrack) return;
    push();
  }, [isPlaying, userId, currentTrack]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") push();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  return null;
}
