interface PageTitleProps {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Visual size; the element is always the page's h1. */
  size?: "lg" | "xl";
}

/** The editorial large title that opens every screen. */
export default function PageTitle({ title, eyebrow, children, className = "", size = "lg" }: PageTitleProps) {
  return (
    <div className={className}>
      {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
      <h1
        className={`font-display font-normal tracking-[-0.022em] text-balance ${
          size === "xl"
            ? "text-[2.75rem] leading-[1.02] sm:text-[3.5rem]"
            : "text-[2.5rem] leading-[1.05] sm:text-[2.875rem]"
        }`}
      >
        {title}
      </h1>
      {children && (
        <div className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">{children}</div>
      )}
    </div>
  );
}

/** Small monospaced label used above titles and for metadata. */
export function Eyebrow({ children, className = "", tone = "accent" }: {
  children: React.ReactNode;
  className?: string;
  tone?: "accent" | "muted";
}) {
  return (
    <p
      className={`font-mono text-[0.75rem] font-medium uppercase tracking-[0.12em] ${
        tone === "accent" ? "text-accent-ink" : "text-ink-3"
      } ${className}`}
    >
      {children}
    </p>
  );
}
