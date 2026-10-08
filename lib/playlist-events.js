const EVENT_NAME = "playlists:changed";

export function notifyPlaylistsChanged() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribePlaylistsChanged(callback) {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
