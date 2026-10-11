import { createAdminClient, getUserFromRequest } from "@/lib/supabase/admin";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { parseIsoDuration } from "@/lib/duration";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const MAX_QUERY_LENGTH = 100;
const REGION_CODE = "VN";
const RELEVANCE_LANGUAGE = "vi";

const searchCache = new Map();

function getCached(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return entry.items;
}

function setCached(key, items) {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, items });
}

async function fetchDurations(videoIds, apiKey) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const durations = new Map();
    for (const video of data.items || []) {
      durations.set(video.id, parseIsoDuration(video.contentDetails?.duration));
    }
    return durations;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const admin = createAdminClient();
  const user = await getUserFromRequest(request, admin);
  if (!user) {
    return Response.json({ error: "Phiên đăng nhập không hợp lệ" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().replace(/\s+/g, " ");

  if (!q) {
    return Response.json({ error: "Thiếu từ khóa tìm kiếm (query param 'q')" }, { status: 400 });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return Response.json(
      { error: `Từ khóa quá dài (tối đa ${MAX_QUERY_LENGTH} ký tự)` },
      { status: 400 }
    );
  }

  const cacheKey = q.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) return Response.json({ items: cached });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Server chưa cấu hình YOUTUBE_API_KEY" }, { status: 500 });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("regionCode", REGION_CODE);
  url.searchParams.set("relevanceLanguage", RELEVANCE_LANGUAGE);
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("q", q);
  url.searchParams.set("key", apiKey);

  let ytRes;
  let ytData;
  try {
    ytRes = await fetch(url.toString());
    ytData = await ytRes.json();
  } catch {
    return Response.json({ error: "Không kết nối được tới YouTube" }, { status: 502 });
  }

  if (!ytRes.ok) {
    const reason = ytData?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") {
      return Response.json(
        { error: "Đã hết quota YouTube API của hôm nay, thử lại sau" },
        { status: 429 }
      );
    }
    return Response.json(
      { error: ytData?.error?.message || "Lỗi gọi YouTube Data API" },
      { status: ytRes.status }
    );
  }

  const found = (ytData.items || []).filter((item) => item?.id?.videoId);
  const durations =
    found.length > 0 ? await fetchDurations(found.map((item) => item.id.videoId), apiKey) : new Map();

  const items = found.map((item) => {
    const seconds = durations?.get(item.id.videoId);
    return {
      videoId: item.id.videoId,
      title: decodeHtmlEntities(item.snippet?.title),
      channelTitle: decodeHtmlEntities(item.snippet?.channelTitle),
      channelId: item.snippet?.channelId || "",
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
      durationSeconds: seconds > 0 ? seconds : null,
      isLive: item.snippet?.liveBroadcastContent === "live",
    };
  });

  if (durations !== null) setCached(cacheKey, items);
  return Response.json({ items });
}
