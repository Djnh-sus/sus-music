"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import LoginButton from "@/components/LoginButton";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/context/ToastContext";
import { authedFetch } from "@/lib/authed-fetch";

export default function FollowButton({ track }) {
  const { showToast } = useToast();
  const key = track.channelId || `video:${track.videoId}`;
  const [state, setState] = useState({ key: null, status: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const query = track.channelId
      ? `channelId=${encodeURIComponent(track.channelId)}`
      : `videoId=${encodeURIComponent(track.videoId)}`;

    authedFetch(`/api/youtube/subscription?${query}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setState({
            key,
            status: "ready",
            channelId: data.channelId,
            subscribed: data.subscribed,
            subscriptionId: data.subscriptionId,
          });
        } else if (data.code === "youtube_scope_required" || data.code === "youtube_reauth_required") {
          setState({ key, status: "reconnect" });
        } else {
          setState({ key, status: "hidden" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ key, status: "hidden" });
      });

    return () => {
      cancelled = true;
    };
  }, [key, track.channelId, track.videoId]);

  const current = state.key === key ? state : { status: "loading" };

  const toggle = async () => {
    if (busy || current.status !== "ready") return;
    setBusy(true);
    try {
      const res = current.subscribed
        ? await authedFetch(
            `/api/youtube/subscription?subscriptionId=${encodeURIComponent(current.subscriptionId)}`,
            { method: "DELETE" }
          )
        : await authedFetch("/api/youtube/subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId: current.channelId, videoId: track.videoId }),
          });
      const data = await res.json();

      if (res.ok) {
        setState({
          key,
          status: "ready",
          channelId: current.channelId,
          subscribed: data.subscribed,
          subscriptionId: data.subscriptionId,
        });
        showToast(data.subscribed ? "Đã đăng ký kênh trên YouTube" : "Đã huỷ đăng ký kênh");
      } else if (data.code === "youtube_scope_required" || data.code === "youtube_reauth_required") {
        setState({ key, status: "reconnect" });
      } else {
        showToast(data.error || "Không cập nhật được đăng ký", { type: "error" });
      }
    } catch (err) {
      showToast(err.message || "Không cập nhật được đăng ký", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (current.status === "hidden") return null;
  if (current.status === "loading") return <Skeleton className="h-8 w-24 rounded-full" />;
  if (current.status === "reconnect") {
    return <LoginButton label="Cấp quyền để theo dõi" className="px-4 py-1.5 text-sm" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={current.subscribed}
      className={`flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1 text-sm font-bold transition disabled:opacity-60 ${
        current.subscribed
          ? "border-accent text-accent"
          : "border-border text-foreground hover:border-accent"
      }`}
    >
      {current.subscribed ? <Check size={15} strokeWidth={3} /> : <Plus size={15} strokeWidth={3} />}
      {current.subscribed ? "Đã theo dõi" : "Theo dõi"}
    </button>
  );
}
