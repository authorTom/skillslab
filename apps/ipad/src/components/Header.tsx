import { useScrolled } from "@/hooks/useScrolled";
import BrandMark from "./BrandMark";
import { ChevronLeftIcon, SettingsIcon } from "./icons";

interface HeaderProps {
  /** Shown in the bar once the page's own large title scrolls under it. */
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  onSettings?: () => void;
  /** Show the SkillsLab lockup on the leading edge (home screen). */
  brand?: boolean;
  children?: React.ReactNode;
}

/**
 * iPadOS-style navigation bar. It sits flush with the page until content
 * scrolls beneath it, then turns translucent with a hairline and shows the
 * page title, the way UIKit's large-title navigation bars behave.
 */
export default function Header({ title, onBack, backLabel = "Back", onSettings, brand, children }: HeaderProps) {
  const raised = useScrolled(4);
  const showTitle = useScrolled(56);

  return (
    <header
      className={`safe-top sticky top-0 z-30 border-b transition-[background-color,border-color] duration-200 ${
        raised
          ? "border-line bg-canvas/80 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-canvas"
      }`}
    >
      <div className="relative mx-auto flex h-14 max-w-6xl items-center px-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 flex min-h-11 items-center gap-0.5 rounded-lg pl-0.5 pr-3 text-[1.0625rem] text-accent-ink transition-opacity active:opacity-50"
            >
              <ChevronLeftIcon className="h-6 w-6" />
              {backLabel}
            </button>
          ) : brand ? (
            <div className="flex items-center gap-2.5 pl-1.5">
              <BrandMark className="h-8 w-8 drop-shadow-sm" />
              <span className="text-[1.0625rem] font-semibold tracking-[-0.01em]">SkillsLab</span>
            </div>
          ) : null}
        </div>

        {title && (
          // Decorative: every page repeats its title as a visible h1.
          <p
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-36 truncate text-center text-[1.0625rem] font-semibold tracking-[-0.01em] transition-[opacity,transform] duration-200 ${
              showTitle ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
          >
            {title}
          </p>
        )}

        <div className="flex flex-1 items-center justify-end gap-1">
          {children}
          {onSettings && (
            <button
              type="button"
              onClick={onSettings}
              aria-label="Settings"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 active:bg-surface-3"
            >
              <SettingsIcon className="h-[22px] w-[22px]" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
