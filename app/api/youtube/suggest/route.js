import { TtlCache, requireUser, jsonError } from "@/lib/youtube-server";

const cache = new TtlCache(10 * 60 * 1000, 300);
const MAX_QUERY_LENGTH = 80;
const MAX_SUGGESTIONS = 8;

export async function GET(request) {
  const auth = await requireUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ", 401);

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
  if (!q) return Response.json({ items: [] });

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached) return Response.json({ items: cached });

  try {
    const url = new URL("https://suggestqueries.google.com/complete/search");
    url.searchParams.set("client", "firefox");
    url.searchParams.set("ds", "yt");
    url.searchParams.set("hl", "vi");
    url.searchParams.set("q", q);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return Response.json({ items: [] });

    const data = await res.json();
    const items = Array.isArray(data?.[1])
      ? data[1].filter((entry) => typeof entry === "string" && entry.trim() !== "").slice(0, MAX_SUGGESTIONS)
      : [];
    cache.set(key, items);
    return Response.json({ items });
  } catch {
    return Response.json({ items: [] });
  }
}
