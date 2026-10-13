import { supabase } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/authed-fetch";
import {
  buildProfile,
  composeHome,
  composeRadio,
  hashString,
  mulberry32,
  planHome,
  planSeeds,
  radioSeedPlan,
} from "@/lib/reco-core";

const CHANNEL_KEY = "yt-reco2c:";
const CHART_KEY = "yt-reco2r:";
const CHANNEL_TTL_MS = 6 * 60 * 60 * 1000;
const CHART_TTL_MS = 3 * 60 * 60 * 1000;
const LIBRARY_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_CHANNELS = 60;
const RECENT_PLAYS_FOR_EXCLUDE = 40;
const SESSION_SEED_KEY = "yt-reco-session";

let libraryCache = null;
let libraryPending = null;
let refreshCounter = 0;

function readCache(key, ttlMs) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key));
    if (!raw || !Array.isArray(raw.items) || Date.now() - raw.at > ttlMs) return null;
    return raw.items;
  } catch {
    return null;
  }
}

function writeCache(key, items) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), items }));
  } catch {
  }
}

function pruneChannelCache() {
  try {
    const entries = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(CHANNEL_KEY)) continue;
      const at = JSON.parse(window.localStorage.getItem(key))?.at || 0;
      entries.push([key, at]);
    }
    if (entries.length <= MAX_CACHED_CHANNELS) return;
    entries
      .sort((a, b) => a[1] - b[1])
      .slice(0, entries.length - MAX_CACHED_CHANNELS)
      .forEach(([key]) => window.localStorage.removeItem(key));
  } catch {
  }
}

function sessionSeed() {
  try {
    const saved = Number(window.sessionStorage.getItem(SESSION_SEED_KEY));
    if (Number.isFinite(saved) && saved > 0) return saved;
    const fresh = Math.floor(Math.random() * 4294967295) + 1;
    window.sessionStorage.setItem(SESSION_SEED_KEY, String(fresh));
    return fresh;
  } catch {
    return Math.floor(Math.random() * 4294967295) + 1;
  }
}

export function bumpRefresh() {
  refreshCounter += 1;
  libraryCache = null;
}

export async function loadLibrary(userId) {
  if (libraryCache && libraryCache.userId === userId && Date.now() - libraryCache.at < LIBRARY_TTL_MS) {
    return libraryCache.data;
  }
  if (libraryPending && libraryPending.userId === userId) return libraryPending.promise;

  const promise = Promise.all([
    supabase
      .from("history")
      .select("video_id, title, channel_title, channel_id, thumbnail_url, played_at")
      .order("played_at", { ascending: false })
      .limit(300),
    supabase
      .from("favorites")
      .select("video_id, title, channel_title, channel_id, thumbnail_url, added_at")
      .order("added_at", { ascending: false })
      .limit(200),
    supabase
      .from("playlist_tracks")
      .select("playlist_id, video_id, title, channel_title, channel_id, thumbnail_url, added_at")
      .order("added_at", { ascending: false })
      .limit(500),
    supabase.from("custom_playlists").select("id, name").order("created_at", { ascending: false }).limit(30),
  ])
    .then(([history, favorites, playlistTracks, playlists]) => {
      const data = {
        history: history.data || [],
        favorites: favorites.data || [],
        playlistTracks: playlistTracks.data || [],
        playlists: playlists.data || [],
      };
      libraryCache = { userId, at: Date.now(), data };
      return data;
    })
    .finally(() => {
      libraryPending = null;
    });

  libraryPending = { userId, promise };
  return promise;
}

async function loadPool(seeds, regions) {
  const groups = new Map();
  const charts = new Map();
  const missingSeeds = [];
  const missingRegions = [];

  for (const seed of seeds) {
    const cached = readCache(CHANNEL_KEY + seed.channelId, CHANNEL_TTL_MS);
    if (cached) groups.set(seed.channelId, cached);
    else missingSeeds.push(seed);
  }
  for (const region of regions) {
    const cached = readCache(CHART_KEY + region, CHART_TTL_MS);
    if (cached) charts.set(region, cached);
    else missingRegions.push(region);
  }

  if (missingSeeds.length > 0 || missingRegions.length > 0) {
    const res = await authedFetch("/api/youtube/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seeds: missingSeeds, regions: missingRegions }),
    });
    const data = await res.json();
    if (!res.ok) {
      const stale = missingSeeds.length === seeds.length && groups.size === 0 && charts.size === 0;
      if (stale) throw new Error(data.error || "Không tải được gợi ý");
    } else {
      for (const group of data.groups || []) {
        groups.set(group.channelId, group.items || []);
        if ((group.items || []).length > 0) writeCache(CHANNEL_KEY + group.channelId, group.items);
      }
      for (const chart of data.charts || []) {
        charts.set(chart.region, chart.items || []);
        if ((chart.items || []).length > 0) writeCache(CHART_KEY + chart.region, chart.items);
      }
      pruneChannelCache();
    }
  }

  return { groups, charts: regions.map((region) => ({ region, items: charts.get(region) || [] })) };
}

export async function buildHomeShelves(userId) {
  const library = await loadLibrary(userId);
  const profile = buildProfile(library);
  if (profile.length === 0) return [];

  const rng = mulberry32((sessionSeed() ^ Math.imul(refreshCounter + 1, 0x9e3779b1)) >>> 0);
  const plan = planHome({
    profile,
    playlists: library.playlists,
    playlistTracks: library.playlistTracks,
    rng,
  });
  const pool = await loadPool(planSeeds(plan), plan.regions);
  const recentIds = new Set(library.history.slice(0, RECENT_PLAYS_FOR_EXCLUDE).map((row) => row.video_id));
  return composeHome({ plan, profile, pool, recentIds, rng });
}

export async function fetchRadioBatch({ userId, seed, excludeIds = [], limit = 20 }) {
  const library = await loadLibrary(userId);
  const profile = buildProfile(library);
  const rng = mulberry32(hashString(`${seed.videoId}:${Date.now()}:${Math.random()}`));
  const plan = radioSeedPlan({ seed, profile, rng });
  const pool = await loadPool(plan.seeds, plan.regions);
  const exclude = new Set([
    ...excludeIds,
    ...library.history.slice(0, RECENT_PLAYS_FOR_EXCLUDE).map((row) => row.video_id),
  ]);
  return composeRadio({ seed, seeds: plan.seeds, pool, profile, excludeIds: exclude, limit, rng });
}
