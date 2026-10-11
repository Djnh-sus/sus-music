import { jsonError, requireUser, youtubeGet, youtubeRequest } from "@/lib/youtube-server";
import { getUserAccessToken } from "@/lib/youtube-user-token";

const SCOPE_MESSAGE = "Cần cấp thêm quyền quản lý đăng ký kênh, hãy kết nối lại YouTube";

function mapYoutubeError(result) {
  if (result.status === 401) {
    return Response.json(
      { code: "youtube_reauth_required", error: "Quyền truy cập YouTube đã hết hạn, cần kết nối lại" },
      { status: 401 }
    );
  }
  if (
    result.status === 403 &&
    (result.reason === "insufficientPermissions" || /insufficient/i.test(result.message || ""))
  ) {
    return Response.json({ code: "youtube_scope_required", error: SCOPE_MESSAGE }, { status: 403 });
  }
  if (result.reason === "quotaExceeded") {
    return jsonError("Đã hết quota YouTube API của hôm nay, thử lại sau", 429);
  }
  return jsonError(result.message || "Lỗi gọi YouTube Data API", result.status || 502);
}

async function resolveChannelId(channelId, videoId) {
  if (channelId) return channelId;
  if (!/^[\w-]{11}$/.test(videoId || "")) return "";
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return "";
  const info = await youtubeGet("videos", { part: "snippet", id: videoId }, apiKey);
  return info.ok ? info.data.items?.[0]?.snippet?.channelId || "" : "";
}

async function lookup(channelId, accessToken) {
  const result = await youtubeRequest("subscriptions", {
    params: { part: "id", mine: "true", forChannelId: channelId },
    accessToken,
  });
  if (!result.ok) return { error: result };
  const first = result.data.items?.[0];
  return { subscribed: Boolean(first), subscriptionId: first?.id || null };
}

export async function GET(request) {
  const auth = await requireUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ", 401);

  const { searchParams } = new URL(request.url);
  const channelId = await resolveChannelId(
    (searchParams.get("channelId") || "").trim(),
    (searchParams.get("videoId") || "").trim()
  );
  if (!channelId) return jsonError("Không xác định được kênh của bài này", 400);

  const token = await getUserAccessToken(auth.admin, auth.user.id);
  if (token.response) return token.response;

  const found = await lookup(channelId, token.accessToken);
  if (found.error) return mapYoutubeError(found.error);
  return Response.json({ channelId, subscribed: found.subscribed, subscriptionId: found.subscriptionId });
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ", 401);

  const body = await request.json().catch(() => null);
  const channelId = await resolveChannelId(String(body?.channelId || "").trim(), String(body?.videoId || "").trim());
  if (!channelId) return jsonError("Không xác định được kênh của bài này", 400);

  const token = await getUserAccessToken(auth.admin, auth.user.id);
  if (token.response) return token.response;

  const created = await youtubeRequest("subscriptions", {
    method: "POST",
    params: { part: "snippet" },
    body: { snippet: { resourceId: { kind: "youtube#channel", channelId } } },
    accessToken: token.accessToken,
  });

  if (created.ok) {
    return Response.json({ channelId, subscribed: true, subscriptionId: created.data?.id || null });
  }
  if (created.reason === "subscriptionDuplicate") {
    const found = await lookup(channelId, token.accessToken);
    if (!found.error) {
      return Response.json({ channelId, subscribed: true, subscriptionId: found.subscriptionId });
    }
  }
  return mapYoutubeError(created);
}

export async function DELETE(request) {
  const auth = await requireUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ", 401);

  const { searchParams } = new URL(request.url);
  const subscriptionId = (searchParams.get("subscriptionId") || "").trim();
  if (!subscriptionId) return jsonError("Thiếu subscriptionId", 400);

  const token = await getUserAccessToken(auth.admin, auth.user.id);
  if (token.response) return token.response;

  const removed = await youtubeRequest("subscriptions", {
    method: "DELETE",
    params: { id: subscriptionId },
    accessToken: token.accessToken,
  });
  if (!removed.ok) return mapYoutubeError(removed);
  return Response.json({ subscribed: false, subscriptionId: null });
}
