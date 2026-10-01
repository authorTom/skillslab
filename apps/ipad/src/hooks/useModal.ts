import { useEffect, useRef } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog behaviour for a full-screen overlay: focus moves into it and
 * stays there, Escape closes it, the page behind can't scroll, and focus
 * goes back to whatever opened it.
 */
export function useModal(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusables()[0] ?? el).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, [ref]);
}
