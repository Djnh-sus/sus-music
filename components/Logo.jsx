export default function Logo({ size = 40, className = "" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/logo-256.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-[26%] ${className}`}
    />
  );
}
