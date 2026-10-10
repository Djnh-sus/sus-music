export function hqThumbnail(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
}

export function lowThumbnail(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/default.jpg` : "";
}
