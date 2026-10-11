import {
  TtlCache,
  jsonError,
  keepPlayable,
  quotaOrError,
  requireUser,
  searchItemToTrack,
  youtubeGet,
} from "@/lib/youtube-server";
import { buildRadioQuery, isSameSong } from "@/lib/music-query";

const cache = new TtlCache(12 * 60 * 60 * 1000, 200);

export async function GET(request) {
  const auth = await requireUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ", 401);

  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("videoId") || "").trim();
  const title = (searchParams.get("title") || "").trim().slice(0, 200);
  const channel = (searchParams.get("channel") || "").trim().slice(0, 120);
  const duration = Number(searchParams.get("duration")) || 0;
  if (!/^[\w-]{11}$/.test(videoId) || !title) return jsonError("Thiếu videoId hoặc title", 400);

  const cached = cache.get(videoId);
  if (cached) return Response.json(cached);

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return jsonError("Server chưa cấu hình YOUTUBE_API_KEY", 500);

  const result = await youtubeGet(
    "search",
    {
      part: "snippet",
      type: "video",
      videoEmbeddable: "true",
      regionCode: "VN",
      relevanceLanguage: "vi",
      maxResults: 10,
      q: buildRadioQuery(title, channel),
    },
    apiKey
  );
  if (!result.ok) return quotaOrError(result);

  const candidates = (result.data.items || [])
    .filter((item) => item?.id?.videoId && item.id.videoId !== videoId)
    .map(searchItemToTrack)
    .filter((track) => isSameSong(track.title, title));

  const playable = await keepPlayable(candidates, apiKey);
  const tolerance = duration > 0 ? Math.max(20, duration * 0.15) : Infinity;
  const item =
    playable.find(
      (track) => duration <= 0 || track.durationSeconds === null || Math.abs(track.durationSeconds - duration) <= tolerance
    ) || null;

  const payload = { item };
  if (item) cache.set(videoId, payload);
  return Response.json(payload);
}
