import { supabase } from "@/lib/supabase/client";
import { normalizeText } from "@/lib/text";
import { trackFromRow } from "@/lib/track";

const CACHE_MS = 60 * 1000;
const COLUMNS = "video_id, title, channel_title, thumbnail_url";

let cache = { userId: null, at: 0, items: [] };

export async function loadLibrary(userId) {
  if (cache.userId === userId && Date.now() - cache.at < CACHE_MS) return cache.items;

  const [favorites, history, playlistTracks] = await Promise.all([
    supabase.from("favorites").select(COLUMNS).limit(500),
    supabase.from("history").select(COLUMNS).order("played_at", { ascending: false }).limit(300),
    supabase.from("playlist_tracks").select(COLUMNS).limit(1000),
  ]);

  const rows = [
    ...(favorites.data || []),
    ...(playlistTracks.data || []),
    ...(history.data || []),
  ];
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    if (!row?.video_id || seen.has(row.video_id)) continue;
    seen.add(row.video_id);
    items.push({
      track: trackFromRow(row),
      title: normalizeText(row.title),
      haystack: normalizeText(`${row.title} ${row.channel_title || ""}`),
    });
  }

  cache = { userId, at: Date.now(), items };
  return items;
}

export function searchLibrary(items, query, limit = 4) {
  const needle = normalizeText(query);
  if (needle.length < 2) return [];
  const words = needle.split(/\s+/).filter(Boolean);

  return items
    .filter((item) => words.every((word) => item.haystack.includes(word)))
    .map((item) => ({
      item,
      score: item.title.startsWith(needle) ? 0 : item.title.includes(needle) ? 1 : 2,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ item }) => item.track);
}
