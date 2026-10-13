"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { midThumbnail } from "@/lib/thumbnail";

const CANVAS_W = 48;
const CANVAS_H = 27;

function BackdropLayer({ id, src, onFadeEnd, onFailed }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();

    img.onload = () => {
      if (cancelled) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) {
        onFailed(id);
        return;
      }
      ctx.filter = "blur(2px)";
      ctx.drawImage(img, -4, -4, CANVAS_W + 8, CANVAS_H + 8);
      setReady(true);
    };
    img.onerror = () => {
      if (!cancelled) onFailed(id);
    };
    img.src = src;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [id, src, onFailed]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className="np-backdrop-canvas"
      data-ready={ready}
      onAnimationEnd={() => onFadeEnd(id)}
    />
  );
}

export default function NowPlayingBackdrop({ videoId }) {
  const src = midThumbnail(videoId);
  const [state, setState] = useState(() => ({
    seq: src ? 1 : 0,
    layers: src ? [{ id: 1, src }] : [],
  }));

  const newest = state.layers[state.layers.length - 1];
  if (src && src !== newest?.src) {
    const id = state.seq + 1;
    setState({ seq: id, layers: [...state.layers.slice(-1), { id, src }] });
  }

  const handleFadeEnd = useCallback((id) => {
    setState((prev) =>
      prev.layers[prev.layers.length - 1]?.id === id
        ? { ...prev, layers: prev.layers.slice(-1) }
        : prev
    );
  }, []);

  const handleFailed = useCallback((id) => {
    setState((prev) => ({ ...prev, layers: prev.layers.filter((layer) => layer.id !== id) }));
  }, []);

  return (
    <div aria-hidden="true" className="np-backdrop">
      {state.layers.map((layer) => (
        <BackdropLayer
          key={layer.id}
          id={layer.id}
          src={layer.src}
          onFadeEnd={handleFadeEnd}
          onFailed={handleFailed}
        />
      ))}
      <div className="np-backdrop-tint" />
    </div>
  );
}
