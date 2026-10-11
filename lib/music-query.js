import { normalizeText } from "./text.js";

const NOISE_WORDS =
  /\b(official|music video|mv|m\/v|lyrics?|lyric video|audio|video|visualizer|hd|4k|full|version|karaoke|ft|feat|prod|topic|vevo)\b\.?/gi;

export function cleanTitle(title) {
  return String(title ?? "")
    .replace(/[\[(【（].*?[\])】）]/g, " ")
    .replace(NOISE_WORDS, " ")
    .replace(/[|•·]+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

export function coreTitle(title) {
  return normalizeText(cleanTitle(title))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSameSong(a, b) {
  const x = coreTitle(a);
  const y = coreTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 8 && long.includes(short);
}

export function guessArtist(title, channelTitle) {
  const parts = cleanTitle(title).split(/\s[-–—]\s/);
  if (parts.length >= 2 && parts[0].length > 0 && parts[0].length <= 40) return parts[0].trim();
  return String(channelTitle ?? "")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\bVEVO\b/i, "")
    .trim();
}

export function buildRadioQuery(title, channelTitle) {
  const base = cleanTitle(title);
  const artist = guessArtist(title, channelTitle);
  const query =
    artist && !normalizeText(base).includes(normalizeText(artist)) ? `${artist} ${base}` : base;
  return (query || String(title ?? "")).slice(0, 90);
}

export function pickTopicChips(titles, query, limit = 6) {
  const STOP = new Set([
    "official", "music", "video", "audio", "lyrics", "lyric", "full", "version", "karaoke", "live",
    "the", "and", "for", "with", "from", "feat", "ft", "mv", "hd", "4k", "cho", "voi", "cua", "mot",
    "nhung", "cac", "khi", "nhac", "bai", "hat", "tren", "trong", "nguoi", "nay", "den", "roi", "ve",
  ]);
  const queryWords = new Set(normalizeText(query).split(/\s+/).filter(Boolean));
  const counts = new Map();

  for (const title of titles) {
    const seen = new Set();
    for (const word of cleanTitle(title).split(/\s+/)) {
      const key = normalizeText(word).replace(/[^a-z0-9]/g, "");
      if (key.length < 3 || STOP.has(key) || queryWords.has(key) || /^\d+$/.test(key) || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) || { count: 0, forms: new Map() };
      entry.count += 1;
      const form = word.replace(/[^\p{L}\p{N}]/gu, "");
      entry.forms.set(form, (entry.forms.get(form) || 0) + 1);
      counts.set(key, entry);
    }
  }

  return [...counts.values()]
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((entry) => [...entry.forms.entries()].sort((a, b) => b[1] - a[1])[0][0].toLowerCase());
}
