import { logBg } from "@/lib/bg-log";

let audio = null;

function buildSilentWavUrl() {
  const sampleRate = 8000;
  const samples = sampleRate;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true);

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.src = buildSilentWavUrl();
  audio.loop = true;
  audio.volume = 0.01;
  audio.preload = "auto";
  audio.addEventListener("play", () => logBg("keepalive.play"));
  audio.addEventListener("pause", () => logBg("keepalive.pause"));
  return audio;
}

export function startKeepAlive() {
  if (typeof window === "undefined") return;
  const element = ensureAudio();
  if (!element.paused) return;
  element.play().catch((err) => logBg("keepalive.blocked", err?.name || "error"));
}

export function stopKeepAlive() {
  if (audio && !audio.paused) audio.pause();
}

export function isKeepAliveActive() {
  return audio !== null && !audio.paused;
}