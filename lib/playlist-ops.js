import { supabase } from "@/lib/supabase/client";
import { trackToRow } from "@/lib/track";

export async function addTrackToPlaylist(playlistId, track) {
  const { data: existing, error: checkError } = await supabase
    .from("playlist_tracks")
    .select("id")
    .eq("playlist_id", playlistId)
    .eq("video_id", track.videoId)
    .limit(1);
  if (checkError) return { status: "error", message: checkError.message };
  if (existing && existing.length > 0) return { status: "exists" };

  const { data: last, error: lastError } = await supabase
    .from("playlist_tracks")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1);
  if (lastError) return { status: "error", message: lastError.message };

  const position = (last?.[0]?.position ?? -1) + 1;
  const { error } = await supabase
    .from("playlist_tracks")
    .insert({ playlist_id: playlistId, ...trackToRow(track), position });
  if (error) return { status: "error", message: error.message };

  return { status: "added" };
}
