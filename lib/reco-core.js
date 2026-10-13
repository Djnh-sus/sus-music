import { normalizeText } from "./text.js";
import { isSameSong } from "./music-query.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SECONDS = 60;
const MAX_SECONDS = 15 * 60;
const TOP_SEED_COUNT = 5;
const PLAYLIST_SEED_COUNT = 4;
const MIN_SHELF_ITEMS = 4;

export const HOME_REGIONS = ["VN", "US"];

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(list, rng = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function cleanArtistName(channelTitle) {
  return String(channelTitle ?? "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\bVEVO\b/i, "")
    .replace(/\s+Official$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function artistKey(channelTitle, channelId) {
  const key = normalizeText(cleanArtistName(channelTitle))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return key || (channelId ? `id:${channelId}` : "");
}

function ageMs(value, now, fallbackDays = 30) {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? Math.max(0, now - ts) : fallbackDays * DAY_MS;
}

function decay(age, halfLifeDays) {
  return Math.pow(0.5, age / (halfLifeDays * DAY_MS));
}

export function buildProfile({ history = [], favorites = [], playlistTracks = [] }, now = Date.now()) {
  const artists = new Map();

  const add = (row, weight) => {
    const key = artistKey(row?.channel_title, row?.channel_id);
    if (!key) return;
    let artist = artists.get(key);
    if (!artist) {
      artist = { key, name: cleanArtistName(row.channel_title), weight: 0, channels: new Map() };
      artists.set(key, artist);
    }
    artist.weight += weight;
    if (row.channel_id) {
      artist.channels.set(row.channel_id, (artist.channels.get(row.channel_id) || 0) + weight);
    }
  };

  for (const row of history) add(row, decay(ageMs(row.played_at, now), 14));
  for (const row of favorites) add(row, 2 * decay(ageMs(row.added_at, now), 60));
  for (const row of playlistTracks) add(row, 1.2 * decay(ageMs(row.added_at, now), 45));

  return [...artists.values()]
    .map((artist) => {
      const best = [...artist.channels.entries()].sort((a, b) => b[1] - a[1])[0];
      return { key: artist.key, name: artist.name, weight: artist.weight, channelId: best ? best[0] : "" };
    })
    .sort((a, b) => b.weight - a.weight);
}

export function sampleSeeds(profile, count, rng = Math.random, { exclude = new Set(), power = 0.75 } = {}) {
  const pool = profile.filter((artist) => artist.channelId && !exclude.has(artist.key));
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, artist) => sum + Math.pow(artist.weight, power), 0);
    let r = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.pow(pool[i].weight, power);
      if (r <= 0) {
        index = i;
        break;
      }
    }
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

function playable(track) {
  if (!track?.videoId || track.isLive) return false;
  const seconds = track.durationSeconds;
  return !(Number.isFinite(seconds) && (seconds < MIN_SECONDS || seconds > MAX_SECONDS));
}

export function capByArtist(items, { cap, limit, exclude = new Set(), counts = new Map(), avoidTitles = [] }) {
  const seen = new Set(exclude);
  const titles = [...avoidTitles];
  const result = [];
  for (const track of items) {
    if (result.length >= limit) break;
    if (!playable(track) || seen.has(track.videoId)) continue;
    const key = artistKey(track.channelTitle, track.channelId) || track.videoId;
    if ((counts.get(key) || 0) >= cap) continue;
    if (titles.some((title) => isSameSong(title, track.title))) continue;
    seen.add(track.videoId);
    titles.push(track.title);
    counts.set(key, (counts.get(key) || 0) + 1);
    result.push(track);
  }
  return result;
}

export function roundRobin(lists) {
  const result = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) result.push(list[i]);
  }
  return result;
}

export function pickMix({
  groups,
  discover = [],
  limit,
  cap,
  discoverShare = 0.25,
  exclude = new Set(),
  rng = Math.random,
}) {
  const discoverTarget = discover.length > 0 ? Math.round(limit * discoverShare) : 0;
  const mainTarget = limit - discoverTarget;
  const counts = new Map();

  const main = capByArtist(roundRobin(groups.map((items) => shuffled(items, rng))), {
    cap,
    limit: mainTarget,
    exclude,
    counts,
  });

  const taken = new Set([...exclude, ...main.map((track) => track.videoId)]);
  const extra = capByArtist(shuffled(discover, rng), {
    cap,
    limit: limit - main.length,
    exclude: taken,
    counts,
    avoidTitles: main.map((track) => track.title),
  });

  const result = [...main];
  extra.forEach((track, i) => {
    const position = Math.min(result.length, Math.round(((i + 1) * (result.length + 1)) / (extra.length + 1)));
    result.splice(position, 0, track);
  });
  return result;
}

function chartItems(charts) {
  return roundRobin((charts || []).map((chart) => chart.items || []));
}

function withoutArtists(items, keys) {
  return items.filter((track) => !keys.has(artistKey(track.channelTitle, track.channelId)));
}

export function planHome({ profile, playlists = [], playlistTracks = [], rng = Math.random }) {
  const top = sampleSeeds(profile, TOP_SEED_COUNT, rng);
  const topKeys = new Set(top.map((seed) => seed.key));

  const byPlaylist = new Map();
  for (const row of playlistTracks) {
    if (!row.playlist_id) continue;
    if (!byPlaylist.has(row.playlist_id)) byPlaylist.set(row.playlist_id, []);
    byPlaylist.get(row.playlist_id).push(row);
  }

  const candidates = playlists
    .map((playlist) => ({ playlist, rows: byPlaylist.get(playlist.id) || [] }))
    .filter((entry) => entry.rows.length >= 3);

  let chosen = null;
  let playlistSeeds = [];
  if (candidates.length > 0) {
    const weights = candidates.map((entry) => Math.sqrt(entry.rows.length));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let index = candidates.length - 1;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        index = i;
        break;
      }
    }
    chosen = candidates[index];
    const local = buildProfile({ playlistTracks: chosen.rows });
    const fresh = sampleSeeds(local, PLAYLIST_SEED_COUNT, rng, { exclude: topKeys });
    playlistSeeds = fresh.length >= 2 ? fresh : sampleSeeds(local, PLAYLIST_SEED_COUNT, rng);
  }

  return {
    top,
    playlist: chosen ? { id: chosen.playlist.id, name: chosen.playlist.name } : null,
    playlistSeeds,
    regions: HOME_REGIONS,
  };
}

export function planSeeds(plan) {
  const seen = new Set();
  const seeds = [];
  for (const seed of [...plan.top, ...plan.playlistSeeds]) {
    if (!seed.channelId || seen.has(seed.channelId)) continue;
    seen.add(seed.channelId);
    seeds.push({ channelId: seed.channelId, channelTitle: seed.name });
  }
  return seeds;
}

export function composeHome({ plan, profile, pool, recentIds = new Set(), rng = Math.random }) {
  const used = new Set(recentIds);
  const topKeys = new Set(profile.slice(0, 8).map((artist) => artist.key));
  const charts = chartItems(pool.charts);
  const shelves = [];

  const take = (shelf) => {
    if (shelf.items.length < MIN_SHELF_ITEMS) return;
    shelf.items.forEach((track) => used.add(track.videoId));
    shelves.push(shelf);
  };

  const groupsFor = (seeds) =>
    seeds.map((seed) => pool.groups.get(seed.channelId) || []).filter((items) => items.length > 0);

  const itemsA = pickMix({
    groups: groupsFor(plan.top),
    discover: withoutArtists(charts, topKeys),
    limit: 20,
    cap: 2,
    discoverShare: 0.25,
    exclude: used,
    rng,
  });
  const namesA = plan.top.slice(0, 3).map((seed) => seed.name);
  take({
    id: "for-you",
    title: "Gợi ý cho bạn",
    subtitle: namesA.length > 0 ? `Vì bạn hay nghe ${namesA.join(", ")}` : null,
    items: itemsA,
  });

  if (plan.playlist && plan.playlistSeeds.length > 0) {
    take({
      id: `playlist-${plan.playlist.id}`,
      title: `Giống playlist “${plan.playlist.name}”`,
      subtitle: null,
      items: pickMix({
        groups: groupsFor(plan.playlistSeeds),
        discover: withoutArtists(charts, topKeys),
        limit: 15,
        cap: 2,
        discoverShare: 0.15,
        exclude: used,
        rng,
      }),
    });
  }

  take({
    id: "discover",
    title: "Khám phá",
    subtitle: "Đang thịnh hành ở Việt Nam và thế giới",
    items: pickMix({
      groups: [],
      discover: withoutArtists(charts, topKeys),
      limit: 20,
      cap: 2,
      discoverShare: 1,
      exclude: used,
      rng,
    }),
  });

  return shelves;
}

export function radioSeedPlan({ seed, profile, rng = Math.random }) {
  const seedKey = artistKey(seed.channelTitle, seed.channelId);
  const others = sampleSeeds(profile, 3, rng, { exclude: new Set([seedKey]) });
  const seeds = [];
  if (seed.channelId) {
    seeds.push({ channelId: seed.channelId, channelTitle: cleanArtistName(seed.channelTitle) });
  }
  for (const other of others) seeds.push({ channelId: other.channelId, channelTitle: other.name });
  return { seeds, regions: HOME_REGIONS };
}

export function composeRadio({ seed, seeds, pool, profile, excludeIds = new Set(), limit = 20, rng = Math.random }) {
  const topKeys = new Set(profile.slice(0, 8).map((artist) => artist.key));
  const exclude = new Set([...excludeIds, seed.videoId]);
  const groups = seeds
    .map((entry) => (pool.groups.get(entry.channelId) || []).filter((track) => !isSameSong(track.title, seed.title)))
    .filter((items) => items.length > 0);

  return pickMix({
    groups,
    discover: withoutArtists(chartItems(pool.charts), topKeys).filter((track) => !isSameSong(track.title, seed.title)),
    limit,
    cap: Math.max(2, Math.floor(limit * 0.3)),
    discoverShare: 0.25,
    exclude,
    rng,
  });
}
