import { createAdminClient, getUserFromRequest } from "@/lib/supabase/admin";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { parseIsoDuration } from "@/lib/duration";

export const MIN_TRACK_SECONDS = 60;
export const MAX_TRACK_SECONDS = 15 * 60;

export class TtlCache {
  constructor(ttlMs, maxEntries) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    if (this.map.size >= this.maxEntries) this.map.delete(this.map.keys().next().value);
    this.map.set(key, { expiresAt: Date.now() + this.ttlMs, value });
  }
}

export async function requireUser(request) {
  const admin = createAdminClient();
  const user = await getUserFromRequest(request, admin);
  return user ? { user, admin } : null;
}

export function jsonError(message, status, extra = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

export function quotaOrError(result) {
  if (result.reason === "quotaExceeded") {
    return jsonError("Đã hết quota YouTube API của hôm nay, thử lại sau", 429);
  }
  return jsonError(result.message || "Lỗi gọi YouTube Data API", result.status || 502);
}

export async function youtubeRequest(resource, { params = {}, apiKey, accessToken, method = "GET", body } = {}) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  if (!accessToken && apiKey) url.searchParams.set("key", apiKey);

  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  let data = null;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    data = res.status === 204 ? null : await res.json().catch(() => null);
  } catch {
    return { ok: false, status: 502, reason: "network", message: "Không kết nối được tới YouTube", data: null };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      reason: data?.error?.errors?.[0]?.reason || "error",
      message: data?.error?.message,
      data,
    };
  }
  return { ok: true, status: res.status, data };
}

export function youtubeGet(resource, params, apiKey) {
  return youtubeRequest(resource, { params, apiKey });
}

export async function fetchVideoDetails(videoIds, apiKey) {
  const ids = [...new Set(videoIds)].slice(0, 50);
  if (ids.length === 0) return new Map();
  const result = await youtubeGet(
    "videos",
    { part: "contentDetails,status", id: ids.join(","), maxResults: 50 },
    apiKey
  );
  if (!result.ok) return null;

  const details = new Map();
  for (const video of result.data.items || []) {
    details.set(video.id, {
      durationSeconds: parseIsoDuration(video.contentDetails?.duration),
      playable: video.status?.embeddable !== false && video.status?.privacyStatus !== "private",
    });
  }
  return details;
}

export function searchItemToTrack(item) {
  return {
    videoId: item.id.videoId,
    title: decodeHtmlEntities(item.snippet?.title),
    channelTitle: decodeHtmlEntities(item.snippet?.channelTitle),
    channelId: item.snippet?.channelId || "",
    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
    durationSeconds: null,
    isLive: item.snippet?.liveBroadcastContent === "live",
  };
}

export function uploadsPlaylistId(channelId) {
  return typeof channelId === "string" && channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : null;
}

export function playlistItemToTrack(item) {
  const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
  const title = item.snippet?.title;
  if (!videoId || !title || title === "Private video" || title === "Deleted video") return null;
  return {
    videoId,
    title: decodeHtmlEntities(title),
    channelTitle: decodeHtmlEntities(item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle),
    channelId: item.snippet?.videoOwnerChannelId || item.snippet?.channelId || "",
    thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
    durationSeconds: null,
    isLive: false,
    publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || "",
  };
}

export async function keepPlayable(tracks, apiKey) {
  const details = await fetchVideoDetails(tracks.map((track) => track.videoId), apiKey);
  if (details === null) return tracks.filter((track) => !track.isLive);

  const result = [];
  for (const track of tracks) {
    const info = details.get(track.videoId);
    if (!info || !info.playable || track.isLive) continue;
    const seconds = info.durationSeconds > 0 ? info.durationSeconds : null;
    if (seconds !== null && (seconds < MIN_TRACK_SECONDS || seconds > MAX_TRACK_SECONDS)) continue;
    result.push({ ...track, durationSeconds: seconds });
  }
  return result;
}

export function interleave(...lists) {
  const result = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) result.push(list[i]);
  }
  return result;
}

export function dedupeTracks(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    if (seen.has(track.videoId)) return false;
    seen.add(track.videoId);
    return true;
  });
}
