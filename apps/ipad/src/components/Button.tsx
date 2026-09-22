import Spinner from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "tinted" | "danger" | "destructive" | "plain";
export type ButtonSize = "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent shadow-sm hover:bg-accent-hover",
  secondary: "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2",
  tinted: "bg-accent-soft text-accent-ink hover:brightness-95",
  danger: "bg-danger-soft text-danger-ink hover:brightness-95",
  destructive: "bg-danger text-white shadow-sm hover:brightness-110",
  plain: "text-accent-ink hover:bg-accent-soft",
};

// Both sizes clear Apple's 44pt minimum touch target.
const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 text-[0.9375rem] gap-2 rounded-full",
  lg: "min-h-13 px-7 text-base gap-2.5 rounded-full",
};

/** Class list for a button-styled element, for links that look like buttons. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `inline-flex shrink-0 items-center justify-center font-medium tracking-[-0.005em] transition duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]}`;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the icon and disables the button. */
  busy?: boolean;
  icon?: React.ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  busy = false,
  icon,
  className = "",
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClass(variant, size)} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}
