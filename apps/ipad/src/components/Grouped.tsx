import { useId } from "react";
import { ChevronRightIcon } from "./icons";

/** An inset grouped section, in the style of iPadOS Settings. */
export function GroupedSection({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-2.5 px-4 font-mono text-[0.75rem] font-medium uppercase tracking-[0.12em] text-ink-3">
        {title}
      </h2>
      <div className="overflow-hidden rounded-[1.25rem] bg-surface shadow-card ring-1 ring-line">{children}</div>
      {footer && <div className="mt-2 px-4 text-[0.8125rem] leading-relaxed text-ink-3">{footer}</div>}
    </section>
  );
}

export function InfoList({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-line">{children}</dl>;
}

export function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 px-4 py-3">
      <dt className="shrink-0 text-[0.9375rem] text-ink-2">{label}</dt>
      <dd
        className={`min-w-0 select-text break-all text-right text-[0.9375rem] font-medium text-ink ${
          mono ? "font-mono text-[0.8125rem] font-normal" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function NavRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-surface-2 active:bg-surface-3"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.6rem] bg-accent text-on-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium text-ink">{title}</span>
        {subtitle && <span className="block text-[0.8125rem] text-ink-3">{subtitle}</span>}
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-3" />
    </button>
  );
}

/** Padded body for a grouped section that holds a form or actions. */
export function GroupedBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

type Tone = "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  info: "bg-accent-soft text-accent-ink",
};

/** Inline message about the result of an action. Errors are announced
 *  assertively; everything else politely. */
export function Notice({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={`flex animate-fade-in gap-3 rounded-xl p-4 ${TONES[tone]}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-[0.9375rem] leading-relaxed opacity-90">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
