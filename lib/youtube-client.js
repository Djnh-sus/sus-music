import { authedFetch } from "@/lib/authed-fetch";

const REAUTH_CODE = "youtube_reauth_required";
const PLAYLISTS_MAX_PAGES = 10;
const ITEMS_MAX_PAGES = 20;
const PLACEHOLDER_TITLES = new Set(["Deleted video", "Private video"]);

let cachedToken = null;

export class YoutubeReauthRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "YoutubeReauthRequiredError";
    this.code = REAUTH_CODE;
  }
}

export function isYoutubeReauthError(err) {
  return err?.code === REAUTH_CODE;
}

export function clearYoutubeTokenCache() {
  cachedToken = null;
}

export async function getYoutubeAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const res = await authedFetch("/api/youtube/refresh-token", { method: "POST" });
  const data = await res.json();

  if (!res.ok) {
    if (data.code === REAUTH_CODE) {
      cachedToken = null;
      throw new YoutubeReauthRequiredError(data.error);
    }
    throw new Error(data.error || "Không lấy được access token Google");
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

async function googleGet(url) {
  for (let attempt = 0; ; attempt++) {
    const accessToken = await getYoutubeAccessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 401 && attempt === 0) {
      clearYoutubeTokenCache();
      continue;
    }
    return { res, data: await res.json() };
  }
}

async function fetchAllPages(baseUrl, { maxPages, errorMessage }) {
  const items = [];
  let pageToken = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(baseUrl);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const { res, data } = await googleGet(url.toString());
    if (!res.ok) throw new Error(data.error?.message || errorMessage);

    items.push(...(data.items || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return items;
}

export async function fetchMyYoutubePlaylists() {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlists");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "50");

  const items = await fetchAllPages(url.toString(), {
    maxPages: PLAYLISTS_MAX_PAGES,
    errorMessage: "Không tải được playlist YouTube",
  });

  return items.map((item) => ({
    id: item.id,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.medium?.url,
    itemCount: item.contentDetails?.itemCount || 0,
  }));
}

export async function fetchYoutubePlaylistItems(playlistId) {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", "50");

  const items = await fetchAllPages(url.toString(), {
    maxPages: ITEMS_MAX_PAGES,
    errorMessage: "Không tải được nội dung playlist",
  });

  return items
    .filter(
      (item) => item.snippet?.resourceId?.videoId && !PLACEHOLDER_TITLES.has(item.snippet.title)
    )
    .map((item) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    }));
}
