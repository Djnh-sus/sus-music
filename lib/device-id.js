const KEY = "yt-device-id";

export function getDeviceId() {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}
