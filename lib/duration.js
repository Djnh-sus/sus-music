const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

export function parseIsoDuration(value) {
  if (typeof value !== "string") return null;
  const match = ISO_DURATION.exec(value);
  if (!match) return null;

  const parts = match.slice(1);
  if (parts.every((part) => part === undefined)) return null;

  const [days = 0, hours = 0, minutes = 0, seconds = 0] = parts.map((part) =>
    part === undefined ? undefined : Number(part)
  );
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
