export function trackFromRow(row) {
  return {
    videoId: row.video_id,
    title: row.title,
    channelTitle: row.channel_title || "",
    thumbnail: row.thumbnail_url || "",
    channelId: row.channel_id || "",
  };
}

export function trackToRow(track) {
  return {
    video_id: track.videoId,
    title: track.title,
    channel_title: track.channelTitle || null,
    thumbnail_url: track.thumbnail || null,
    channel_id: track.channelId || null,
  };
}

export function uniqueByVideoId(rows, limit = Infinity) {
  const seen = new Set();
  const result = [];
  for (const row of rows || []) {
    if (seen.has(row.video_id)) continue;
    seen.add(row.video_id);
    result.push(row);
    if (result.length >= limit) break;
  }
  return result;
}
