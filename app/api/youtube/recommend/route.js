import {
  MAX_TRACK_SECONDS,
  MIN_TRACK_SECONDS,
  TtlCache,
  jsonError,
  keepPlayable,
  playlistItemToTrack,
  quotaOrError,
  requireUser,
  uploadsPlaylistId,
  youtubeGet,
} from "@/lib/youtube-server";
import { decodeHtmlEntities } from "@/lib/html-entities";
import { parseIsoDuration } from "@/lib/duration";

const CHANNEL_TTL_MS = 6 * 60 * 60 * 1000;
const CHART_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_SEEDS = 10;
const MAX_REGIONS = 3;
const UPLOADS_PER_CHANNEL = 20;
const CHART_SIZE = 40;

const channelCache = new TtlCache(CHANNEL_TTL_MS, 300);
const chartCache = new TtlCache(CHART_TTL_MS, 12);

async function loadChannel(channelId, apiKey) {
  const cached = channelCache.get(channelId);
  if (cached) return { items: cached };

  const playlistId = uploadsPlaylistId(channelId);
  if (!playlistId) return { items: [] };

  const res = await youtubeGet(
    "playlistItems",
    { part: "snippet,contentDetails", playlistId, maxResults: UPLOADS_PER_CHANNEL },
    apiKey
  );
  if (!res.ok) return { error: res };

  const tracks = (res.data.items || []).map(playlistItemToTrack).filter(Boolean);
  const items = await keepPlayable(tracks, apiKey);
  channelCache.set(channelId, items);
  return { items };
}

async function loadChart(region, apiKey) {
  const cached = chartCache.get(region);
  if (cached) return { items: cached };

  const res = await youtubeGet(
    "videos",
    {
      part: "snippet,contentDetails,status",
      chart: "mostPopular",
      videoCategoryId: "10",
      regionCode: region,
      maxResults: CHART_SIZE,
    },
    apiKey
  );
  if (!res.ok) return { error: res };

  const items = [];
  for (const video of res.data.items || []) {
    if (video.status?.embeddable === false) continue;
    if (video.snippet?.liveBroadcastContent === "live") continue;
    const seconds = parseIsoDuration(video.contentDetails?.duration);
    if (seconds > 0 && (seconds < MIN_TRACK_SECONDS || seconds > MAX_TRACK_SECONDS)) continue;
    items.push({
      videoId: video.id,
      title: decodeHtmlEntities(video.snippet?.title),
      channelTitle: decodeHtmlEntities(video.snippet?.channelTitle),
      channelId: video.snippet?.channelId || "",
      thumbnail:
        video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || "",
      durationSeconds: seconds > 0 ? seconds : null,
      isLive: false,
    });
  }
  chartCache.set(region, items);
  return { items };
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ", 401);

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return jsonError("Server chưa cấu hình YOUTUBE_API_KEY", 500);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Dữ liệu gửi lên không hợp lệ", 400);

  const seeds = [];
  const seenChannels = new Set();
  for (const seed of Array.isArray(body.seeds) ? body.seeds : []) {
    const channelId = typeof seed?.channelId === "string" ? seed.channelId.trim() : "";
    if (!/^UC[\w-]{22}$/.test(channelId) || seenChannels.has(channelId)) continue;
    seenChannels.add(channelId);
    seeds.push({ channelId, channelTitle: String(seed.channelTitle || "").slice(0, 120) });
    if (seeds.length >= MAX_SEEDS) break;
  }

  const regions = [];
  for (const region of Array.isArray(body.regions) ? body.regions : []) {
    if (typeof region === "string" && /^[A-Z]{2}$/.test(region) && !regions.includes(region)) {
      regions.push(region);
    }
    if (regions.length >= MAX_REGIONS) break;
  }

  const [channelResults, chartResults] = await Promise.all([
    Promise.all(seeds.map((seed) => loadChannel(seed.channelId, apiKey))),
    Promise.all(regions.map((region) => loadChart(region, apiKey))),
  ]);

  const all = [...channelResults, ...chartResults];
  const failed = all.filter((result) => result.error);
  if (all.length > 0 && failed.length === all.length) return quotaOrError(failed[0].error);

  return Response.json({
    groups: seeds.map((seed, i) => ({ ...seed, items: channelResults[i].items || [] })),
    charts: regions.map((region, i) => ({ region, items: chartResults[i].items || [] })),
  });
}
