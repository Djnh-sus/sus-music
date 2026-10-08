const KEY_PREFIX = "yt-search-history:";
export const MAX_SEARCH_HISTORY = 10;

export function loadSearchHistory(userId) {
  if (!userId) return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY_PREFIX + userId));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => typeof item === "string" && item.trim() !== "")
      .slice(0, MAX_SEARCH_HISTORY);
  } catch {
    return [];
  }
}

export function addSearchHistory(userId, query) {
  const text = typeof query === "string" ? query.trim() : "";
  const current = loadSearchHistory(userId);
  if (!userId || !text) return current;

  const lower = text.toLowerCase();
  const next = [text, ...current.filter((item) => item.toLowerCase() !== lower)].slice(
    0,
    MAX_SEARCH_HISTORY
  );
  try {
    window.localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(next));
  } catch {
  }
  return next;
}

export function clearSearchHistory(userId) {
  if (!userId) return;
  try {
    window.localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
  }
}
