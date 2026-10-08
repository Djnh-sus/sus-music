export default function Equalizer({ playing = true, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 items-end gap-[3px] ${playing ? "" : "eq-paused"} ${className}`}
    >
      <span className="eq-bar" style={{ "--d": "0ms" }} />
      <span className="eq-bar" style={{ "--d": "240ms" }} />
      <span className="eq-bar" style={{ "--d": "480ms" }} />
    </span>
  );
}
