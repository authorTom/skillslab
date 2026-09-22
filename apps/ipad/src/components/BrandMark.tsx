import { useId } from "react";

/** The app icon artwork (branding/app-icon.svg) as a rounded tile. */
export default function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  const gradient = useId();

  return (
    <svg className={className} viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="230" fill={`url(#${gradient})`} />
      <path
        d="M 164 512 L 288 512 L 352 330 L 424 694 L 490 512 L 556 512"
        fill="none" stroke="#fff" strokeWidth="64" strokeLinecap="round" strokeLinejoin="round" opacity="0.92"
      />
      <path
        d="M 624 596 L 722 700 L 880 432"
        fill="none" stroke="#fff" strokeWidth="72" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
