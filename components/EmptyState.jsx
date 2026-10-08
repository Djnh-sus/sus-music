export default function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="fade-in mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-14 text-center">
      {Icon && (
        <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface text-accent">
          <Icon size={28} />
        </span>
      )}
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {description && <p className="text-sm text-muted">{description}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
