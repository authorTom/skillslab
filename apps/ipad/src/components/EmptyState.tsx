interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  /** Draw the dashed outline used when the state sits inside page content. */
  outlined?: boolean;
}

export default function EmptyState({ icon, title, children, action, outlined }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center px-8 py-14 text-center ${
        outlined ? "rounded-[1.75rem] border border-dashed border-line-strong" : ""
      }`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-3">
        {icon}
      </div>
      <p className="mt-5 font-display text-[1.625rem] leading-tight tracking-[-0.015em] text-ink">{title}</p>
      {children && (
        <div className="mt-1.5 max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">{children}</div>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
