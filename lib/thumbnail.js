export function hqThumbnail(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
}

export function lowThumbnail(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/default.jpg` : "";
}

export function midThumbnail(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : "";
}
