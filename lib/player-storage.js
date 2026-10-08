const KEY_PREFIX = "yt-player-state:";
const VERSION = 1;
const REPEAT_MODES = ["off", "all", "one"];

export const MAX_PERSISTED_ENTRIES = 500;
const WINDOW_BEFORE = 50;

const isText = (value) => typeof value === "string";
const isInt = (value) => Number.isInteger(value);

export function windowQueue(queue, currentIndex, max = MAX_PERSISTED_ENTRIES) {
  if (queue.length <= max) return { queue, currentIndex };
  const start = Math.min(Math.max(0, currentIndex - WINDOW_BEFORE), queue.length - max);
  return { queue: queue.slice(start, start + max), currentIndex: currentIndex - start };
}

export function sanitizeState(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== VERSION || !Array.isArray(raw.queue)) {
    return null;
  }

  const savedIndex = isInt(raw.currentIndex) ? raw.currentIndex : -1;
  const kept = [];
  let currentIndex = -1;

  raw.queue.forEach((entry, i) => {
    if (!entry || !isText(entry.videoId) || !entry.videoId || !isText(entry.title)) return;
    if (i === savedIndex) currentIndex = kept.length;
    kept.push({
      videoId: entry.videoId,
      title: entry.title,
      channelTitle: isText(entry.channelTitle) ? entry.channelTitle : "",
      thumbnail: isText(entry.thumbnail) ? entry.thumbnail : "",
      queueId: isInt(entry.queueId) ? entry.queueId : null,
    });
  });

  if (kept.length === 0) return null;
  if (currentIndex === -1) currentIndex = Math.min(Math.max(savedIndex, 0), kept.length - 1);

  const used = new Set();
  let maxId = kept.reduce((max, entry) => Math.max(max, entry.queueId ?? 0), 0);
  for (const entry of kept) {
    if (entry.queueId === null || used.has(entry.queueId)) entry.queueId = ++maxId;
    used.add(entry.queueId);
  }

  const volume = Number.isFinite(raw.volume) ? Math.min(100, Math.max(0, Math.round(raw.volume))) : 100;

  return {
    queue: kept,
    currentIndex,
    position: Number.isFinite(raw.position) && raw.position > 0 ? raw.position : 0,
    shuffle: raw.shuffle === true,
    repeat: REPEAT_MODES.includes(raw.repeat) ? raw.repeat : "off",
    volume,
    muted: raw.muted === true,
    shuffleOriginal: Array.isArray(raw.shuffleOriginal) ? raw.shuffleOriginal.filter(isInt) : [],
  };
}

export function loadPlayerState(userId) {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId);
    return raw ? sanitizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function savePlayerState(userId, state) {
  try {
    const { queue, currentIndex } = windowQueue(state.queue, state.currentIndex);
    window.localStorage.setItem(
      KEY_PREFIX + userId,
      JSON.stringify({
        version: VERSION,
        queue: queue.map((e) => ({
          videoId: e.videoId,
          title: e.title,
          channelTitle: e.channelTitle || "",
          thumbnail: e.thumbnail || "",
          queueId: e.queueId,
        })),
        currentIndex,
        position: state.position,
        shuffle: state.shuffle,
        repeat: state.repeat,
        volume: state.volume,
        muted: state.muted,
        shuffleOriginal: state.shuffleOriginal,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearPlayerState(userId) {
  try {
    window.localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
  }
}
