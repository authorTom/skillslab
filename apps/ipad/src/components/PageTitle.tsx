interface PageTitleProps {
  title: string;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/** The large title that opens every screen; the nav bar echoes it on scroll. */
export default function PageTitle({ title, eyebrow, children, className = "" }: PageTitleProps) {
  return (
    <div className={className}>
      {eyebrow && (
        <p className="mb-2 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-accent-ink">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[2rem] font-bold leading-[1.12] tracking-[-0.025em] text-balance sm:text-[2.25rem]">
        {title}
      </h1>
      {children && (
        <div className="mt-2.5 max-w-3xl text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">{children}</div>
      )}
    </div>
  );
}
