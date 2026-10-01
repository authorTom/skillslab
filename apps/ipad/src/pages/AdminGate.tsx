import { useEffect, useState } from "react";
import { checkPin, lockoutRemaining } from "@/data/adminLock";
import Header from "@/components/Header";
import PinPad from "@/components/PinPad";
import { LockIcon } from "@/components/icons";

interface AdminGateProps {
  back: () => void;
  onUnlock: () => void;
}

function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Stands in front of Settings and Content updates while a PIN is set. */
export default function AdminGate({ back, onUnlock }: AdminGateProps) {
  const [lockedUntil, setLockedUntil] = useState(() => Date.now() + lockoutRemaining());
  const [now, setNow] = useState(() => Date.now());
  // Announced once when a lockout starts; the visible countdown isn't live,
  // so VoiceOver doesn't read out every second.
  const [lockoutNotice, setLockoutNotice] = useState("");
  const waiting = Math.max(0, lockedUntil - now);

  useEffect(() => {
    if (waiting <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  async function handlePin(pin: string): Promise<string | null> {
    try {
      const result = await checkPin(pin);
      if (result.ok) {
        onUnlock();
        return null;
      }
      if (result.lockedFor > 0) {
        setNow(Date.now());
        setLockedUntil(Date.now() + result.lockedFor);
        setLockoutNotice(`Wrong PIN. Too many attempts, the keypad is locked for ${formatWait(result.lockedFor)}.`);
      }
      return "Wrong PIN";
    } catch (err) {
      return err instanceof Error ? err.message : "Couldn’t check the PIN.";
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Header onBack={back} backLabel="Back" />
      <main className="safe-bottom flex animate-rise flex-col items-center px-6 pb-16 pt-6 text-center lg:pt-16">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <LockIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-6 font-display text-[2.5rem] leading-[1.05] tracking-[-0.022em]">Admin area</h1>
        <p className="mt-3 max-w-sm text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">
          Settings and content updates are locked on this iPad.
        </p>
        <p role="alert" className="sr-only">
          {waiting > 0 ? lockoutNotice : ""}
        </p>
        <div className="mt-10">
          <PinPad
            label="Enter admin PIN"
            onComplete={handlePin}
            disabled={waiting > 0}
            hint={waiting > 0 ? `Too many attempts. Try again in ${formatWait(waiting)}.` : undefined}
          />
        </div>
      </main>
    </div>
  );
}
