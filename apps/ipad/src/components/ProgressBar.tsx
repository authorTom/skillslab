import { useId } from "react";

interface ProgressBarProps {
  label: string;
  /** 0 to 1, or null while the length of the work isn't known. */
  value: number | null;
  /** Smaller text under the bar, such as bytes copied. */
  detail?: string;
}

export default function ProgressBar({ label, value, detail }: ProgressBarProps) {
  const labelId = useId();
  const pct = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-4 text-[0.9375rem]">
        <span id={labelId} className="text-ink">
          {label}
        </span>
        {pct !== null && <span className="tabular-nums text-ink-2">{pct}%</span>}
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={`h-full rounded-full bg-accent transition-[width] duration-300 ${pct === null ? "animate-pulse" : ""}`}
          style={{ width: `${pct ?? 100}%` }}
        />
      </div>
      {detail && <p className="mt-1.5 text-[0.8125rem] tabular-nums text-ink-3">{detail}</p>}
    </div>
  );
}
