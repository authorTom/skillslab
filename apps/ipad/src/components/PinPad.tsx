import { useEffect, useRef, useState } from "react";
import { PIN_LENGTH } from "@/data/adminLock";
import { BackspaceIcon } from "./icons";

interface PinPadProps {
  /** What the PIN is for, read out and shown above the dots. */
  label: string;
  /**
   * Called once all digits are entered. Return an error message to clear the
   * entry and shake, or null when the PIN is accepted.
   */
  onComplete: (pin: string) => Promise<string | null> | string | null;
  /** Shown under the dots when there is no error, such as a lockout. */
  hint?: string;
  disabled?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

/**
 * A lock-screen style keypad. A hardware keyboard works too: digits type,
 * Backspace deletes. Give each step of a flow its own `key` so the entry
 * starts empty.
 */
export default function PinPad({ label, onComplete, hint, disabled }: PinPadProps) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakes, setShakes] = useState(0);
  const [busy, setBusy] = useState(false);
  const complete = useRef(onComplete);
  const locked = disabled || busy;

  useEffect(() => {
    complete.current = onComplete;
  }, [onComplete]);

  async function press(key: string) {
    if (locked) return;
    if (key === "back") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    const next = digits + key;
    if (next.length > PIN_LENGTH) return;
    setDigits(next);
    setError(null);
    if (next.length < PIN_LENGTH) return;

    setBusy(true);
    const problem = await complete.current(next);
    setBusy(false);
    setDigits("");
    if (problem) {
      setError(problem);
      setShakes((n) => n + 1);
    }
  }

  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) pressRef.current(e.key);
      else if (e.key === "Backspace") pressRef.current("back");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // While disabled the hint explains why (a lockout), over the last error.
  const message = disabled && hint ? hint : (error ?? hint);

  return (
    <div className="flex flex-col items-center" role="group" aria-label={label}>
      <p className="text-[1.0625rem] font-medium text-ink">{label}</p>

      <div key={shakes} className={`mt-5 flex gap-4 ${shakes > 0 ? "animate-shake" : ""}`} aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ring-[1.5px] ring-inset transition duration-150 ${
              i < digits.length ? "scale-110 bg-ink ring-ink" : "ring-ink-3"
            }`}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {digits.length > 0 ? `${digits.length} of ${PIN_LENGTH} digits entered` : ""}
      </p>

      <p
        role={message && message === error ? "alert" : undefined}
        className={`mt-4 min-h-[1.5em] text-center text-[0.9375rem] ${
          message && message === error ? "text-danger-ink" : "text-ink-2"
        }`}
      >
        {message}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4">
        {KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} />
          ) : key === "back" ? (
            <button
              key={i}
              type="button"
              onClick={() => press("back")}
              disabled={locked || digits.length === 0}
              aria-label="Delete"
              className="flex h-18 w-18 items-center justify-center rounded-full text-ink-2 transition active:bg-surface-3 disabled:opacity-0"
            >
              <BackspaceIcon className="h-7 w-7" />
            </button>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(key)}
              disabled={locked}
              className="flex h-18 w-18 items-center justify-center rounded-full bg-surface font-display text-[2rem] text-ink shadow-card ring-1 ring-line transition duration-100 active:scale-95 active:bg-surface-3 disabled:opacity-45"
            >
              {key}
            </button>
          )
        )}
      </div>
    </div>
  );
}
