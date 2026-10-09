const KEY = "yt-bg-log";
const MAX_ENTRIES = 120;

function read() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function logBg(event, detail = "") {
  if (typeof window === "undefined") return;
  try {
    const entries = read();
    entries.push({ t: Date.now(), e: event, d: String(detail).slice(0, 120) });
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
  }
}

export function readBgLog() {
  return typeof window === "undefined" ? [] : read();
}

export function clearBgLog() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
  }
}

export function formatBgLog(entries) {
  return entries
    .map(({ t, e, d }) => {
      const date = new Date(t);
      const clock = date.toLocaleTimeString("vi-VN", { hour12: false });
      const ms = String(date.getMilliseconds()).padStart(3, "0");
      return `${clock}.${ms} ${e}${d ? ` ${d}` : ""}`;
    })
    .join("\n");
}
