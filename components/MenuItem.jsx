export const menuItemClass =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-foreground/8 disabled:opacity-50";

export default function MenuItem({ icon: Icon, danger = false, children, ...props }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`${menuItemClass} ${danger ? "text-danger" : ""}`}
      {...props}
    >
      <Icon size={16} className={danger ? "shrink-0" : "shrink-0 text-muted"} />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
