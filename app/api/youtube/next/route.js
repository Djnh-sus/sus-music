import {
  TtlCache,
  dedupeTracks,
  interleave,
  jsonError,
  keepPlayable,
  playlistItemToTrack,
  quotaOrError,
  requireUser,
  searchItemToTrack,
  uploadsPlaylistId,
  youtubeGet,
} from "@/lib/youtube-server";
import { buildRadioQuery, isSameSong } from "@/lib/music-query";

const cache = new TtlCache(6 * 60 * 60 * 1000, 200);
const RESULT_LIMIT = 30;

export async function GET(request) {
  const auth = await requireUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ", 401);

  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") || "").trim();
  if (!/^[\w-]{11}$/.test(videoId)) return jsonError("videoId không hợp lệ", 400);

  const cached = cache.get(videoId);
  if (cached) return Response.json(cached);

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return jsonError("Server chưa cấu hình YOUTUBE_API_KEY", 500);

  let title = (searchParams.get("title") || "").slice(0, 200);
  let channel = (searchParams.get("channel") || "").slice(0, 120);
  let channelId = (searchParams.get("channelId") || "").trim();

  if (!channelId || !title) {
    const info = await youtubeGet("videos", { part: "snippet", id: videoId }, apiKey);
    const snippet = info.ok ? info.data.items?.[0]?.snippet : null;
    if (snippet) {
      channelId = channelId || snippet.channelId || "";
      title = title || snippet.title || "";
      channel = channel || snippet.channelTitle || "";
    }
  }

  const uploadsId = uploadsPlaylistId(channelId);
  const [uploadsRes, searchRes] = await Promise.all([
    uploadsId
      ? youtubeGet("playlistItems", { part: "snippet,contentDetails", playlistId: uploadsId, maxResults: 30 }, apiKey)
      : null,
    title
      ? youtubeGet(
          "search",
          {
            part: "snippet",
            type: "video",
            videoEmbeddable: "true",
            videoCategoryId: "10",
            regionCode: "VN",
            relevanceLanguage: "vi",
            maxResults: 25,
            q: buildRadioQuery(title, channel),
          },
          apiKey
        )
      : null,
  ]);

  const failures = [uploadsRes, searchRes].filter((result) => result && !result.ok);
  const successes = [uploadsRes, searchRes].filter((result) => result && result.ok);
  if (successes.length === 0 && failures.length > 0) return quotaOrError(failures[0]);

  const fromUploads = (uploadsRes?.ok ? uploadsRes.data.items || [] : [])
    .map(playlistItemToTrack)
    .filter(Boolean);
  const fromSearch = (searchRes?.ok ? searchRes.data.items || [] : [])
    .filter((item) => item?.id?.videoId)
    .map(searchItemToTrack);

  const candidates = dedupeTracks(interleave(fromSearch, fromUploads)).filter(
    (track) => track.videoId !== videoId && !isSameSong(track.title, title)
  );

  const playable = await keepPlayable(candidates.slice(0, 50), apiKey);
  const payload = { items: playable.slice(0, RESULT_LIMIT), channelId };
  if (payload.items.length > 0) cache.set(videoId, payload);
  return Response.json(payload);
}
