import {
  TtlCache,
  jsonError,
  keepPlayable,
  playlistItemToTrack,
  requireUser,
  uploadsPlaylistId,
  youtubeGet,
  youtubeRequest,
} from "@/lib/youtube-server";
import { getUserAccessToken } from "@/lib/youtube-user-token";

const cache = new TtlCache(30 * 60 * 1000, 100);
const CHANNELS_USED = 6;
const RESULT_LIMIT = 24;

export async function GET(request) {
  const auth = await requireUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ", 401);

  const cached = cache.get(auth.user.id);
  if (cached) return Response.json(cached);

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return jsonError("Server chưa cấu hình YOUTUBE_API_KEY", 500);

  const token = await getUserAccessToken(auth.admin, auth.user.id);
  if (token.response) return Response.json({ items: [], reason: "reauth" });

  const subs = await youtubeRequest("subscriptions", {
    params: { part: "snippet", mine: "true", maxResults: 20, order: "relevance" },
    accessToken: token.accessToken,
  });
  if (!subs.ok) return Response.json({ items: [], reason: subs.reason || "error" });

  const channelIds = (subs.data.items || [])
    .map((item) => item.snippet?.resourceId?.channelId)
    .filter(Boolean)
    .slice(0, CHANNELS_USED);

  const uploads = await Promise.all(
    channelIds.map((channelId) =>
      youtubeGet(
        "playlistItems",
        { part: "snippet,contentDetails", playlistId: uploadsPlaylistId(channelId), maxResults: 5 },
        apiKey
      )
    )
  );

  const tracks = uploads
    .filter((result) => result.ok)
    .flatMap((result) => (result.data.items || []).map(playlistItemToTrack))
    .filter(Boolean)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

  const playable = await keepPlayable(tracks.slice(0, 40), apiKey);
  const payload = { items: playable.slice(0, RESULT_LIMIT), channels: channelIds.length };
  cache.set(auth.user.id, payload);
  return Response.json(payload);
}
